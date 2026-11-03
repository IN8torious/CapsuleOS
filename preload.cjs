const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('siBrowser', Object.freeze({
  navigate: (address) => ipcRenderer.invoke('browser:navigate', address),
  home: () => ipcRenderer.invoke('browser:home'),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  toggleToolbox: () => ipcRenderer.invoke('toolbox:toggle'),
  engineSnapshot: () => ipcRenderer.invoke('toolbox:snapshot'),
  syncWorkflowsWithEngine: (workflows) => ipcRenderer.invoke('toolbox:sync-workflows', workflows),
  listWorkflows: () => ipcRenderer.invoke('workflows:list'),
  saveWorkflow: (draft) => ipcRenderer.invoke('workflows:save', draft),
  modelCatalog: () => ipcRenderer.invoke('assistant:catalog'),
  downloadModel: (modelId) => ipcRenderer.invoke('assistant:download', modelId),
  cancelModelDownload: () => ipcRenderer.invoke('assistant:cancel-download'),
  loadModel: (modelId) => ipcRenderer.invoke('assistant:load-model', modelId),
  inspectAgentRuntime: () => ipcRenderer.invoke('assistant:runtime-inspect'),
  configureAgentRuntime: (settings) => ipcRenderer.invoke('assistant:runtime-configure', settings),
  onAssistantState(callback) {
    if (typeof callback !== 'function') throw new TypeError('An assistant state callback is required.');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('assistant:state', listener);
    return () => ipcRenderer.removeListener('assistant:state', listener);
  },
  onState(callback) {
    if (typeof callback !== 'function') throw new TypeError('A state callback is required.');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('browser:state', listener);
    return () => ipcRenderer.removeListener('browser:state', listener);
  },
}));
