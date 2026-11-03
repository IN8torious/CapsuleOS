const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const test = require('node:test');
const { getPublicModelCatalog, getModelById } = require('../assistant/model-catalog.cjs');
const { findModelLocations } = require('../assistant/bundled-models.cjs');
const { verifyModelFiles, copyVerifiedModel } = require('../assistant/model-store.cjs');

test('included UI catalog matches canonical pinned models and offline status has a deadline', async () => {
  const { includedModelCatalog, inspectModelAvailability } = await import('../toolbox/model-catalog.js');
  const models = includedModelCatalog();
  assert.deepEqual(models.map(m => [m.id, m.revision, m.downloadBytes]), getPublicModelCatalog().map(m => [m.id, m.revision, m.downloadBytes]));
  assert.ok(models.every(model => model.installed === null));
  await assert.rejects(inspectModelAvailability(() => new Promise(() => {}), 10), /timed out/);
  const result = await inspectModelAvailability(async command => ({ command }), 100);
  assert.equal(result.length, 2);
});

test('bundled model discovery uses approved ids and rejects malformed registration', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-bundle-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const userDataPath = path.join(root, 'Browser');
  const modelRoot = path.join(userDataPath, 'models');
  const bundle = path.join(root, 'bundled-models');
  const model = getModelById('phi-3.5-mini-q4f16');
  await fs.mkdir(path.join(bundle, model.id), { recursive: true });
  await fs.writeFile(path.join(bundle, model.id, 'si-model-install.json'), JSON.stringify({ id: model.id, revision: model.revision }));
  const locations = await findModelLocations({ modelRoot, workspacePath: root, userDataPath });
  assert.equal(locations.size, 1);
  assert.equal(locations.get(model.id).bundled, true);
  assert.equal(locations.get(model.id).directory, path.join(bundle, model.id));
  await fs.writeFile(path.join(root, 'toolbox-models.json'), JSON.stringify({ version: 1, root: 'relative-path' }));
  await assert.rejects(findModelLocations({ modelRoot, workspacePath: root, userDataPath }), /invalid/);
});

test('offline model verification checks bytes rather than trusting an install marker', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-model-integrity-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const payload = Buffer.from('trusted weight fixture');
  const model = { files: [{ path: 'weights.bin', size: payload.length, sha256: crypto.createHash('sha256').update(payload).digest('hex') }] };
  await fs.writeFile(path.join(root, 'weights.bin'), payload);
  await verifyModelFiles(root, model);
  await fs.writeFile(path.join(root, 'weights.bin'), Buffer.alloc(payload.length));
  await assert.rejects(verifyModelFiles(root, model), /integrity|match|verification|checksum|hash/i);
});

test('offline copies include only pinned assets, never unrelated files in a model directory', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-model-copy-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), target = path.join(root, 'target');
  await fs.mkdir(source);
  const payload = Buffer.from('pinned model fixture');
  const model = { id: 'fixture', revision: 'fixed', repository: 'fixture/public', license: 'MIT',
    files: [{ path: 'weights.bin', size: payload.length, sha256: crypto.createHash('sha256').update(payload).digest('hex') }] };
  await fs.writeFile(path.join(source, 'weights.bin'), payload);
  await fs.writeFile(path.join(source, 'unrelated.txt'), 'Do not include this file.');
  await copyVerifiedModel(source, target, model);
  assert.deepEqual((await fs.readdir(target)).sort(), ['si-model-install.json', 'weights.bin']);
  await verifyModelFiles(target, model);
});
