const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { PassThrough } = require('node:stream');
const { startRuntime } = require('../assistant/toolbox-runtime.cjs');
const { CONTRACT_VERSION, validateRequest } = require('../capsule/companion-bridge.cjs');

async function request(endpoint, operation, fields = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint.pipePath);
    let data = '';
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('Runtime request timed out')); });
    socket.on('error', reject);
    socket.on('connect', () => socket.write(JSON.stringify({
      version: CONTRACT_VERSION, token: endpoint.token, operation, ...fields
    }) + '\n'));
    socket.on('data', chunk => { data += chunk; });
    socket.on('end', () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
  });
}

test('standalone Toolbox runtime serves its own authenticated pipe without Electron and exits on parent EOF', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'toolbox-owned-runtime-'));
  const input = new PassThrough();
  const runtime = await startRuntime({ directory, parentInput: input });
  t.after(async () => { await runtime.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  const endpoint = JSON.parse(await fs.readFile(path.join(directory, 'bridge.json'), 'utf8'));
  assert.equal((await request(endpoint, 'assistant-status')).status.modelReady, false);
  const catalog = await request(endpoint, 'assistant-catalog');
  assert.equal(catalog.models.length, 2);
  assert.equal((await request(endpoint, 'review-cache-status')).ok, true);
  assert.deepEqual((await request(endpoint, 'learning-list')).lessons, []);
  assert.equal((await request(endpoint, 'assistant-unload-model')).ok, true);
  assert.equal((await request(endpoint, 'assistant-load-model', { modelId: 'not-approved' })).ok, false);
  assert.equal((await request({ ...endpoint, token: '0'.repeat(64) }, 'assistant-status')).ok, false);
  assert.equal((await request(endpoint, 'snapshot')).ok, false);
  input.end();
  for (let n = 0; n < 100 && runtime.bridge.server; n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(runtime.bridge.server, null);
});

test('unload is bounded and model loading uses a verification-sized native deadline', async () => {
  const token = 'a'.repeat(64);
  for (const model of require('../assistant/model-catalog.json')) {
    for (const operation of ['assistant-load-model', 'assistant-download-model']) {
      assert.equal(validateRequest({ version: CONTRACT_VERSION, token, operation, modelId: model.id }, token), null, `${operation}: ${model.id}`);
    }
  }
  assert.ok(validateRequest({ version: CONTRACT_VERSION, token, operation: 'assistant-load-model', modelId: 'not-approved' }, token));
  assert.equal(validateRequest({ version: CONTRACT_VERSION, token, operation: 'assistant-unload-model' }, token), null);
  assert.ok(validateRequest({ version: CONTRACT_VERSION, token, operation: 'assistant-unload-model', command: 'anything' }, token));
  const source = await fs.readFile(path.join(__dirname, '..', 'src-tauri', 'src', 'companion.rs'), 'utf8');
  assert.match(source, /"assistant-load-model",\s*json!\(\{ "modelId": model_id \}\),\s*MODEL_REQUEST_TIMEOUT/);
});

test('portable runtime finds sibling bundled models without Browser data, workspace models or Electron resourcesPath', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'toolbox-sibling-models-'));
  const input = new PassThrough();
  const { getModelById } = require('../assistant/model-catalog.cjs');
  const model = getModelById('phi-3.5-mini-q4f16');
  await fs.mkdir(path.join(root, 'models', model.id), { recursive: true });
  await fs.writeFile(path.join(root, 'models', model.id, 'si-model-install.json'),
    JSON.stringify({ id: model.id, revision: model.revision }));
  const bridgeDirectory = path.join(root, 'data', 'ToolboxRuntime', 'sessions', 'test-instance');
  const runtime = await startRuntime({
    directory: path.join(root, 'data', 'ToolboxRuntime'), bridgeDirectory,
    workspacePath: path.join(root, 'runtime'), parentInput: input
  });
  t.after(async () => { input.end(); await runtime.stop(); await fs.rm(root, { recursive: true, force: true }); });
  const endpoint = JSON.parse(await fs.readFile(path.join(bridgeDirectory, 'bridge.json'), 'utf8'));
  const response = await request(endpoint, 'assistant-catalog');
  const bundled = response.models.find(entry => entry.id === model.id);
  assert.equal(bundled.installed, true);
  assert.equal(bundled.bundled, true);
  assert.equal((await runtime.controller.modelLocations()).get(model.id).directory, path.join(root, 'models', model.id));
});
