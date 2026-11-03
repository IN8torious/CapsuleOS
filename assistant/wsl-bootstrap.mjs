import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const send = value => process.stdout.write(JSON.stringify(value) + '\n');
let worker, initialized = false, busy = false, buffer = '', ending = false;

async function initialize(message) {
  if (process.platform !== 'linux' || !/microsoft/i.test(os.release())) throw new Error('A WSL2 Linux runtime is required.');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('The existing Linux runtime requires Node.js 22 or newer.');
  const root = path.join(os.homedir(), '.local', 'share', 'capsule-agent');
  const realRoot = await fsp.realpath(root);
  if ((await fsp.statfs(realRoot)).type !== 0xef53) throw new Error('Capsule agent data must reside on the Linux ext4 filesystem.');
  process.chdir(realRoot);
  const model = message.model;
  const modelPath = path.join(realRoot, 'models', model.id);
  const realModel = await fsp.realpath(modelPath);
  if (realModel !== modelPath) throw new Error('Model directories must not be symlinks.');
  if ((await fsp.statfs(realModel)).type !== 0xef53) throw new Error('Approved model files must reside on ext4, not a mounted Windows drive.');
  const cache = path.join(realRoot, 'transformers-cache');
  await fsp.mkdir(cache, { recursive: true });
  if (await fsp.realpath(cache) !== cache || (await fsp.statfs(cache)).type !== 0xef53) {
    throw new Error('The Linux inference cache must reside on ext4 without symlinks.');
  }
  for (const file of model.files) {
    const target = path.join(realModel, file.path);
    if (await fsp.realpath(target) !== target) throw new Error('Model files must not be symlinks.');
    const stat = await fsp.stat(target);
    if (!stat.isFile() || stat.size !== file.size) throw new Error(`Missing or wrong-size approved asset: ${file.path}`);
    const hash = crypto.createHash(file.sha256 ? 'sha256' : 'sha1');
    if (!file.sha256) hash.update(`blob ${file.size}\0`);
    for await (const chunk of fs.createReadStream(target)) hash.update(chunk);
    if (hash.digest('hex') !== (file.sha256 || file.sha1)) throw new Error(`Approved asset hash mismatch: ${file.path}`);
  }
  const require = createRequire(path.join(realRoot, 'package.json'));
  const resolvedModule = require.resolve('@huggingface/transformers');
  if ((await fsp.statfs(resolvedModule)).type !== 0xef53) throw new Error('The Linux inference dependencies must reside on ext4.');
  const packagePath = path.join(path.dirname(resolvedModule), '..', 'package.json');
  const pkg = JSON.parse(await fsp.readFile(packagePath, 'utf8'));
  if (pkg.version !== '4.3.2') throw new Error('The existing Linux runtime requires @huggingface/transformers 4.3.2.');
  const transformers = pathToFileURL(path.join(path.dirname(resolvedModule), 'transformers.node.mjs')).href;
  const source = message.workerSource.replace("'@huggingface/transformers'", JSON.stringify(transformers));
  worker = new Worker(new URL(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`), {
    workerData: { modelPath: realModel, modelId: model.id, dtype: model.dtype, userDataPath: realRoot },
    stdout: true, stderr: true
  });
  worker.stdout.on('data', chunk => process.stderr.write(chunk));
  worker.stderr.on('data', chunk => process.stderr.write(chunk));
  worker.on('message', value => {
    if (['response', 'request-error'].includes(value.type)) busy = false;
    send(value);
  });
  worker.on('error', error => { send({ type: 'initialization-error', message: error.message }); process.exitCode = 1; process.stdin.destroy(); });
  worker.on('exit', code => { if (!ending) { send({ type: 'initialization-error', message: `Linux inference worker exited (${code}).` }); process.stdin.destroy(); } });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  if (Buffer.byteLength(buffer) > 1024 * 1024) { send({ type: 'initialization-error', message: 'Linux workload exceeded its transport limit.' }); process.stdin.destroy(); return; }
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    try {
      const message = JSON.parse(line);
      if (!initialized && message.type === 'initialize') {
        initialized = true;
        initialize(message).catch(error => { send({ type: 'initialization-error', message: error.message }); process.stdin.destroy(); });
      } else if (worker && message.type === 'generate' && !busy) {
        busy = true; worker.postMessage(message);
      } else throw new Error('Linux worker is unavailable or busy.');
    } catch (error) {
      send({ type: 'initialization-error', message: error.message }); process.stdin.destroy();
    }
  }
});
function shutdown() {
  if (ending) return;
  ending = true;
  if (worker) void worker.terminate().finally(() => process.exit(0));
  else process.exit(0);
}
process.stdin.on('close', shutdown);
process.stdin.on('end', shutdown);
