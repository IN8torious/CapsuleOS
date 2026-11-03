'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const catalog = require('../assistant/model-catalog.json');
const { modelInstallerHooks } = require('../assistant/build-model-installer.cjs');
const { verifyDistributionModels } = require('../assistant/verify-distribution-models.cjs');

test('setup requires and copies every pinned model asset and license, then verifies installed bytes', () => {
  const hooks = modelInstallerHooks();
  for (const model of catalog) {
    for (const file of [...model.files.map(entry => entry.path), 'si-model-install.json']) {
      const asset = `models\\${model.id}\\${file.replaceAll('/', '\\')}`;
      assert.ok(hooks.includes(`IfFileExists "$EXEDIR\\${asset}" +4`), asset);
      assert.ok(hooks.includes(`CopyFiles /SILENT "$EXEDIR\\${asset}"`), asset);
    }
  }
  assert.match(hooks, /verify-distribution-models\.cjs/);
  assert.match(hooks, /ExecWait/);
  assert.match(hooks, /SetErrorLevel 2/);
  assert.doesNotMatch(hooks, /CopyFiles.*\\\*/);
});

test('incomplete distribution is rejected instead of becoming a download-only model catalog', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-distribution-check-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(verifyDistributionModels(directory), /registration is missing/);
  for (const model of catalog) {
    await fs.mkdir(path.join(directory, model.id));
    await fs.writeFile(path.join(directory, model.id, 'si-model-install.json'), JSON.stringify({ id: model.id, revision: model.revision }));
  }
  await assert.rejects(verifyDistributionModels(directory), /ENOENT/);
});

test('standard build assembles the full offline distribution and APBX stages model payloads without buffering weights', async () => {
  const root = path.join(__dirname, '..');
  const pkg = require('../package.json');
  const config = require('../src-tauri/tauri.conf.json');
  assert.match(pkg.scripts['toolbox:build'], /tauri build && node assistant\/package-offline\.cjs/);
  assert.equal(pkg.scripts['package:offline'], 'npm run toolbox:build');
  assert.match(config.build.beforeBuildCommand, /verify:models/);
  assert.deepEqual(config.bundle.targets, ['msi', 'nsis']);
  assert.equal(config.bundle.windows.wix.upgradeCode, 'b6037e6d-a440-560f-a15b-54f669e4b2b8');
  assert.equal(config.bundle.resources['runtime/'], 'runtime/');
  const exporter = await fs.readFile(path.join(root, 'assistant', 'playbook-export.mjs'), 'utf8');
  assert.match(exporter, /await verifyDistributionModels/);
  assert.match(exporter, /await copyVerifiedModel/);
  assert.match(exporter, /toolboxModelsIncluded/);
  assert.doesNotMatch(exporter, /readFileSync\([^)]*(?:onnx|model_q4)/);
});
