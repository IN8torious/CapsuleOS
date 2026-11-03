const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { getPublicModelCatalog } = require('./model-catalog.cjs');
const { verifyModelFiles, copyVerifiedModel } = require('./model-store.cjs');
const { getModelById } = require('./model-catalog.cjs');
const config = require('../src-tauri/tauri.conf.json');
const { assertDesignGate } = require('./design-audit.cjs');

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  await assertDesignGate();
  const workspace = path.join(__dirname, '..');
  const models = path.join(workspace, 'bundled-models');
  for (const model of getPublicModelCatalog()) await verifyModelFiles(path.join(models, model.id), getModelById(model.id));
  const executable = path.join(workspace, 'src-tauri', 'target', 'release', 'capsule_toolbox.exe');
  await fs.access(executable);
  const installer = path.join(workspace, 'src-tauri', 'target', 'release', 'bundle', 'nsis', `${config.productName}_${config.version}_x64-setup.exe`);
  const runtime = path.join(workspace, 'src-tauri', 'runtime');
  const linuxPayload = path.join(workspace, 'bundled-linux-runtime');
  const linuxManifest = JSON.parse(await fs.readFile(path.join(linuxPayload, 'manifest.json'), 'utf8'));
  if (linuxManifest.version !== 1 || linuxManifest.file !== 'linux-runtime.tar'
      || await sha256(path.join(linuxPayload, 'linux-runtime.tar')) !== linuxManifest.sha256) {
    throw new Error('The offline Linux runtime payload is missing or invalid. Run npm run prepare:linux-runtime from the prepared Pengwin build host.');
  }
  const setupStat = await fs.stat(installer);
  if (setupStat.mtimeMs < (await fs.stat(path.join(workspace, 'dist', 'toolbox', 'design-audit.json'))).mtimeMs) {
    throw new Error('Setup predates the verified design audit. Run npm run toolbox:build so the audited frontend is packaged.');
  }
  if (setupStat.mtimeMs < (await fs.stat(path.join(runtime, 'node.exe'))).mtimeMs) {
    throw new Error('Setup predates the staged runtime. Run npm run toolbox:build to build the complete model-containing distribution.');
  }
  const parent = path.join(workspace, 'pre-release');
  const destination = path.join(parent, 'Capsule Toolbox Offline');
  try {
    await fs.access(destination);
    throw new Error('The offline bundle already exists. Move the previous bundle before creating another.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(parent, { recursive: true });
  const staging = await fs.mkdtemp(path.join(parent, '.offline-toolbox-'));
  try {
    await fs.copyFile(executable, path.join(staging, 'Capsule Toolbox.exe'));
    await fs.copyFile(installer, path.join(staging, 'Install Capsule Toolbox.exe'));
    await fs.cp(runtime, path.join(staging, 'runtime'), { recursive: true });
    await fs.mkdir(path.join(staging, 'linux-runtime'));
    for (const file of ['linux-runtime.tar', 'manifest.json']) await fs.copyFile(path.join(linuxPayload, file), path.join(staging, 'linux-runtime', file));
    for (const model of getPublicModelCatalog()) {
      await copyVerifiedModel(path.join(models, model.id), path.join(staging, 'models', model.id), getModelById(model.id));
    }
    await fs.copyFile(path.join(workspace, 'TOOLBOX.md'), path.join(staging, 'TOOLBOX.md'));
    await fs.copyFile(path.join(workspace, 'dist', 'toolbox', 'design-audit.json'), path.join(staging, 'design-audit.json'));
    await fs.writeFile(path.join(staging, 'BUNDLE-MANIFEST.json'), JSON.stringify({
      version: 1,
      application: { file: 'Capsule Toolbox.exe', sha256: await sha256(executable) },
      installer: { file: 'Install Capsule Toolbox.exe', sha256: await sha256(installer) },
      designAudit: { file: 'design-audit.json', sha256: await sha256(path.join(staging, 'design-audit.json')) },
      linuxRuntime: linuxManifest,
      models: getPublicModelCatalog().map(({ id, name, revision, license, downloadBytes }) => ({
        id, name, revision, license, bytes: downloadBytes, files: getModelById(id).files
      }))
    }, null, 2) + '\n');
    await fs.writeFile(path.join(staging, 'START-HERE.txt'),
      'Capsule Toolbox - complete offline distribution\r\n\r\n'
      + 'Open "Capsule Toolbox.exe" to run portably, or "Install Capsule Toolbox.exe" to install.\r\n'
      + 'Keep models\\ and runtime\\ beside these executables. Both approved models and their licenses are included.\r\n'
      + 'Setup requires the adjacent models\\ payload and copies and verifies both models before reporting success.\r\n'
      + 'No Browser app, system Node, or model download is required. Windows WebView2 is still required.\r\n'
      + 'WSL2 remains opt-in and requires its separate Linux prerequisites. Bundled weights do not enable WSL by themselves.\r\n'
      + 'Installed model files are retained on uninstall; remove the installation models\\ folder manually if no longer needed.\r\n');
    await fs.rename(staging, destination);
    console.log('Offline Toolbox and both verified models are in pre-release\\Capsule Toolbox Offline. Nothing was promoted to release.');
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (require.main === module) main().catch(error => { console.error(`Offline packaging failed: ${error.message}`); process.exitCode = 1; });
module.exports = { main, sha256 };
