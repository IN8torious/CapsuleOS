'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { AssistantController } = require('./controller.cjs');
const { CompanionBridge } = require('../capsule/companion-bridge.cjs');

async function startRuntime({ directory, bridgeDirectory = directory, workspacePath = path.join(__dirname, '..'), parentInput = process.stdin }) {
  const controller = new AssistantController({
    ipcMain: { handle() {} },
    getWindow: () => null, getWindows: () => [],
    getPageView: () => null, isHome: () => true,
    isTrustedChrome: () => false,
    userDataPath: directory, workspacePath, resourcesPath: path.dirname(workspacePath)
  });
  const bridge = new CompanionBridge({
    directory: bridgeDirectory,
    getSnapshot: async () => { throw new Error('Browser workspace is not available in the Toolbox runtime.'); },
    routeCatalogTask: async () => ({ ok: false, message: 'Open Capsule Browser to route browser tasks.' }),
    handleAssistantRequest: request => controller.handleCompanionRequest(request)
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    controller.dispose();
    await bridge.stop();
  };
  await bridge.start();
  // The native parent owns stdin. Its exit closes the pipe even after an abrupt termination.
  parentInput.resume();
  parentInput.once('end', () => { void stop().catch(error => { console.error(error); process.exitCode = 1; }); });
  parentInput.once('error', error => { console.error(error); void stop(); });
  return { controller, bridge, stop };
}

if (require.main === module) {
  const roaming = process.env.APPDATA;
  if (!roaming) throw new Error('Windows roaming app-data is unavailable.');
  const directory = process.env.CAPSULE_RUNTIME_DIRECTORY || path.join(roaming, 'Capsule OS', 'ToolboxRuntime');
  fs.mkdir(directory, { recursive: true })
    .then(() => startRuntime({ directory, bridgeDirectory: process.env.CAPSULE_BRIDGE_DIRECTORY || directory }))
    .catch(error => { console.error('Toolbox runtime failed:', error); process.exitCode = 1; });
}

module.exports = { startRuntime };
