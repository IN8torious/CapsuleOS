'use strict';

const path = require('node:path');
const { getPublicModelCatalog, getModelById } = require('./model-catalog.cjs');
const { verifyModelFiles, getInstalledModelIds } = require('./model-store.cjs');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');

async function verifyLinuxRuntime(directory) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const archive = path.join(directory, 'linux-runtime.tar');
  if (manifest.version !== 1 || manifest.file !== 'linux-runtime.tar' || manifest.architecture !== 'x64'
      || (await fs.stat(archive)).size !== manifest.bytes) throw new Error('Bundled Linux runtime manifest/size mismatch.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== manifest.sha256) throw new Error('Bundled Linux runtime SHA-256 mismatch.');
}

async function verifyDistributionModels(root) {
  const installed = await getInstalledModelIds(root);
  for (const { id } of getPublicModelCatalog()) {
    if (!installed.includes(id)) throw new Error(`Bundled model registration is missing or invalid: ${id}`);
    await verifyModelFiles(path.join(root, id), getModelById(id));
  }
}

if (require.main === module) {
  const root = process.argv[2];
  if (!root || !path.isAbsolute(root)) throw new Error('Provide the absolute distribution models directory.');
  Promise.all([verifyDistributionModels(root), verifyLinuxRuntime(path.join(path.dirname(root), 'linux-runtime'))])
    .then(() => console.log('Both bundled models and the offline Linux runtime passed verification.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { verifyDistributionModels, verifyLinuxRuntime };
