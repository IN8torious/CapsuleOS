const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { constants, createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const { Readable, Transform, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { getModelById, getModelDownloadBytes } = require('./model-catalog.cjs');

const TRUSTED_DOWNLOAD_ORIGINS = new Set([
  'https://huggingface.co',
  'https://us.aws.cdn.hf.co',
  'https://cdn-lfs.huggingface.co',
  'https://cas-bridge.xethub.hf.co',
  'https://cdn-lfs-us-1.hf.co'
]);

function modelDirectory(root, modelId) {
  const model = getModelById(modelId);
  if (!model) throw new Error('That model is not in the approved catalog.');
  return path.join(root, model.id);
}

async function getInstalledModelIds(root) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const installed = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const model = getModelById(entry.name);
    if (!model) continue;

    try {
      const marker = JSON.parse(await fs.readFile(path.join(root, entry.name, 'si-model-install.json'), 'utf8'));
      if (marker.id === model.id && marker.revision === model.revision) installed.push(model.id);
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
  }
  return installed;
}

function verifyResponseOrigin(responseUrl) {
  const parsed = new URL(responseUrl);
  if (parsed.protocol !== 'https:') throw new Error('Model downloads must remain on HTTPS.');
  const origin = parsed.origin;
  if (!TRUSTED_DOWNLOAD_ORIGINS.has(origin)) {
    throw new Error(`Model download redirected to an unapproved host: ${origin}`);
  }
}

async function fetchTrustedAsset(url, signal) {
  let current = new URL(url);
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    verifyResponseOrigin(current.href);
    const response = await fetch(current, { signal, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) {
      if (!response.ok) {
        if (response.body) await response.body.cancel();
        return response;
      }
      verifyResponseOrigin(response.url || current.href);
      return response;
    }

    const location = response.headers.get('location');
    if (response.body) await response.body.cancel();
    if (!location) throw new Error('The model host returned a redirect without a destination.');
    if (redirectCount === 5) throw new Error('The model download exceeded the redirect limit.');
    current = new URL(location, current);
    verifyResponseOrigin(current.href);
  }
  throw new Error('The model download exceeded the redirect limit.');
}

function createFileVerifier(file) {
  const algorithm = file.sha256 ? 'sha256' : 'sha1';
  const digest = crypto.createHash(algorithm);
  if (file.sha1) digest.update(`blob ${file.size}\0`);
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > file.size) {
        callback(new Error(`Model asset exceeded its pinned size: ${file.path}`));
        return;
      }
      digest.update(chunk);
      callback(null, chunk);
    }
  });
  return {
    meter,
    result() {
      const actual = digest.digest('hex');
      const expected = file.sha256 || file.sha1;
      if (bytes !== file.size || actual !== expected) {
        throw new Error(`Model asset verification failed: ${file.path}`);
      }
      return bytes;
    }
  };
}

async function downloadModel({ root, modelId, signal, onProgress = () => {} }) {
  const model = getModelById(modelId);
  if (!model) throw new Error('That model is not in the approved catalog.');
  const destination = modelDirectory(root, model.id);
  try {
    await fs.access(destination);
    throw new Error('This model is already installed.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await fs.mkdir(root, { recursive: true });
  const staging = await fs.mkdtemp(path.join(root, `.si-${model.id}-`));
  const totalBytes = getModelDownloadBytes(model);
  let completedBytes = 0;

  try {
    for (const file of model.files) {
      if (signal?.aborted) throw new Error('Model download cancelled.');
      const url = `https://huggingface.co/${model.repository}/resolve/${model.revision}/${file.path}?download=true`;
      const response = await fetchTrustedAsset(url, signal);
      if (!response.ok || !response.body) {
        throw new Error(`Unable to download ${file.path} (HTTP ${response.status}).`);
      }

      const outputPath = path.join(staging, ...file.path.split('/'));
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const verifier = createFileVerifier(file);
      await pipeline(
        Readable.fromWeb(response.body),
        verifier.meter,
        createWriteStream(outputPath, { flags: 'wx' }),
        { signal }
      );
      completedBytes += verifier.result();
      onProgress({
        modelId,
        currentFile: file.path,
        completedBytes,
        totalBytes,
        percent: Math.floor((completedBytes / totalBytes) * 100)
      });
    }

    const installRecord = {
      id: model.id,
      repository: model.repository,
      revision: model.revision,
      license: model.license,
      verifiedAt: new Date().toISOString(),
      files: model.files.map((file) => file.path)
    };
    await fs.writeFile(
      path.join(staging, 'si-model-install.json'),
      `${JSON.stringify(installRecord, null, 2)}\n`,
      { flag: 'wx' }
    );
    await fs.rename(staging, destination);
    return { id: model.id, name: model.name, path: destination, revision: model.revision };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function verifyModelFiles(directory, model) {
  const root = await fs.lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Model storage must be a regular directory.');
  for (const file of model.files) {
    const target = path.join(directory, ...file.path.split('/'));
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size) throw new Error(`Model asset has an invalid type or size: ${file.path}`);
    const verifier = createFileVerifier(file);
    await pipeline(createReadStream(target), verifier.meter, new Writable({ write(_chunk, _encoding, done) { done(); } }));
    verifier.result();
  }
}

async function copyVerifiedModel(source, target, model) {
  await verifyModelFiles(source, model);
  await fs.mkdir(target, { recursive: true });
  for (const file of model.files) {
    const destination = path.join(target, ...file.path.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(source, ...file.path.split('/')), destination, constants.COPYFILE_EXCL);
  }
  await verifyModelFiles(target, model);
  await fs.writeFile(path.join(target, 'si-model-install.json'), `${JSON.stringify({
    id: model.id, repository: model.repository, revision: model.revision, license: model.license,
    verifiedAt: new Date().toISOString(), files: model.files.map(file => file.path)
  }, null, 2)}\n`, { flag: 'wx' });
}

module.exports = {
  createFileVerifier,
  downloadModel,
  fetchTrustedAsset,
  getInstalledModelIds,
  modelDirectory,
  verifyModelFiles,
  copyVerifiedModel
};
