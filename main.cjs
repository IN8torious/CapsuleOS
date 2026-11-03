const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, dialog, ipcMain, protocol, session } = require('electron');
const { pathToFileURL } = require('node:url');
const { HOME_DEMO_URL, isAllowedContentUrl, normalizeNavigationInput } = require('./browser-policy.cjs');
const { replaceKernelBlock } = require('./kernel/document.cjs');
const { CompanionBridge, CONTRACT_VERSION } = require('./capsule/companion-bridge.cjs');
const { AssistantController } = require('./assistant/controller.cjs');

app.setName('Capsule OS Browser');
const capsuleUserData = path.join(app.getPath('appData'), 'Capsule OS', 'Browser');
app.setPath('userData', capsuleUserData);
const CHROME_HEIGHT = 72;
const TOOLBOX_WIDTH = 320;
const HOME_URL = pathToFileURL(path.join(__dirname, 'dist', 'browser', 'index.html')).href;
const PROTOTYPE_PATH = path.join(__dirname, 'index.html');
const KERNEL_PATH = path.join(__dirname, 'kernel', 'si-kernel.js');
const ACTIVITY_GRAPH_PATH = path.join(__dirname, 'app', 'activity-graph-3d.js');
const CREW_MANIFEST_PATH = path.join(__dirname, 'agents', 'crew-manifest.json');
const WORKFLOW_STORE_PATH = path.join(app.getPath('appData'), 'Capsule OS', 'workflows.json');
const KERNEL_URL = 'si-core-demo://prototype/kernel/si-kernel.js';
const MAX_WORKFLOWS = 100;
const MAX_WORKFLOW_STEPS = 20;
const MAX_WORKFLOW_STORE_BYTES = 512 * 1024;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'si-core-demo',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

let mainWindow;
let homeView;
let pageView;
let onHome = true;
let toolboxOpen = true;
let companionBridge;
let companionShutdownStarted = false;
let assistantController;

function sendState(overrides = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const webContents = onHome ? homeView?.webContents : pageView?.webContents;
  mainWindow.webContents.send('browser:state', {
    home: onHome,
    url: onHome ? '' : webContents?.getURL() || '',
    title: webContents?.getTitle() || '',
    canGoBack: !onHome && !!webContents?.canGoBack(),
    canGoForward: !onHome && !!webContents?.canGoForward(),
    toolboxOpen,
    ...overrides
  });
}

function updatePageBounds() {
  if (!mainWindow || !homeView || !pageView) return;
  const { width, height } = mainWindow.getContentBounds();
  const contentWidth = Math.max(0, width - (toolboxOpen ? TOOLBOX_WIDTH : 0));
  const bounds = { x: 0, y: CHROME_HEIGHT, width: contentWidth, height: Math.max(0, height - CHROME_HEIGHT) };
  homeView.setBounds(bounds);
  pageView.setBounds(bounds);
}

function setActiveContent(home) {
  onHome = home;
  if (!mainWindow || !homeView || !pageView) return;
  updatePageBounds();
  homeView.setVisible(false); // the kernel page runs hidden; the chrome renders the engine as home
  pageView.setVisible(!home);
  sendState();
}

function setToolboxOpen(open) {
  toolboxOpen = open;
  updatePageBounds();
  sendState();
}

function isTrustedChrome(event) {
  return Boolean(
    mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents
  );
}

function requireTrustedChrome(event) {
  if (!isTrustedChrome(event)) throw new Error('Browser control request rejected.');
}

async function saveUserWorkflow(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new Error('A workflow draft is required.');
  }
  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  const description = typeof draft.description === 'string' ? draft.description.trim() : '';
  const steps = Array.isArray(draft.steps)
    ? draft.steps.map((step) => typeof step === 'string' ? step.trim() : '')
    : [];
  if (
    !name || name.length > 80 || description.length > 240 ||
    steps.length < 1 || steps.length > 20 ||
    steps.some((step) => !step || step.length > 240)
  ) {
    throw new Error('Use a name up to 80 characters, an optional description up to 240, and 1–20 steps up to 240 characters each.');
  }
  const existing = await listUserWorkflows();
  if (existing.length >= MAX_WORKFLOWS) throw new Error('The local workflow library is full.');
  const now = Date.now();
  const workflow = {
    id: `workflow-${require('node:crypto').randomUUID()}`,
    name,
    description,
    steps,
    createdAt: now,
    updatedAt: now
  };
  await fs.mkdir(path.dirname(WORKFLOW_STORE_PATH), { recursive: true });
  const temporaryPath = `${WORKFLOW_STORE_PATH}.${process.pid}.${now}.tmp`;
  try {
    await fs.writeFile(temporaryPath, JSON.stringify({
      version: 1,
      workflows: [...existing, workflow]
    }, null, 2), { flag: 'wx' });
    await fs.rename(temporaryPath, WORKFLOW_STORE_PATH);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw new Error(`Unable to save the local workflow: ${error.message}`);
  }
  return workflow;
}

async function listUserWorkflows() {
  let content;
  try {
    content = await fs.readFile(WORKFLOW_STORE_PATH);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Unable to read local Capsule workflows: ${error.message}`);
  }
  if (content.length > MAX_WORKFLOW_STORE_BYTES) {
    throw new Error('The local workflow library exceeds the size limit.');
  }
  let document;
  try {
    document = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error('The local workflow library is malformed.');
  }
  if (document.version !== 1 || !Array.isArray(document.workflows) || document.workflows.length > MAX_WORKFLOWS) {
    throw new Error('The local workflow library is invalid or exceeds its limits.');
  }
  const ids = new Set();
  for (const workflow of document.workflows) {
    if (
      !workflow || typeof workflow.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(workflow.id) ||
      ids.has(workflow.id) || typeof workflow.name !== 'string' || !workflow.name.trim() ||
      workflow.name.length > 80 || typeof workflow.description !== 'string' ||
      workflow.description.length > 240 || !Array.isArray(workflow.steps) ||
      workflow.steps.length < 1 || workflow.steps.length > MAX_WORKFLOW_STEPS ||
      workflow.steps.some((step) => typeof step !== 'string' || !step.trim() || step.length > 240) ||
      !Number.isSafeInteger(workflow.createdAt) || !Number.isSafeInteger(workflow.updatedAt)
    ) {
      throw new Error('The local workflow library contains invalid workflow data.');
    }
    ids.add(workflow.id);
  }
  return document.workflows;
}

function injectCrewManifest(document, rawManifest) {
  const manifest = JSON.parse(rawManifest);
  if (!Array.isArray(manifest.crew) || manifest.crew.length === 0 || manifest.crew.length > 32) {
    throw new Error('The SI Core crew manifest is invalid.');
  }
  const crew = manifest.crew.map((agent) => {
    if (
      typeof agent.id !== 'string' || typeof agent.name !== 'string' ||
      !Array.isArray(agent.capabilities) ||
      agent.capabilities.some((capability) => typeof capability !== 'string')
    ) {
      throw new Error('The SI Core crew manifest contains an invalid agent.');
    }
    return {
      id: agent.id,
      name: agent.name,
      purpose: typeof agent.purpose === 'string' ? agent.purpose : '',
      capabilities: agent.capabilities
    };
  });
  const data = JSON.stringify(crew).replace(/</g, '\\u003c');
  const moduleScript = '<script type="module">';
  if (!document.includes(moduleScript)) throw new Error('The SI Core homepage script is missing.');
  return document.replace(
    moduleScript,
    `<script>window.__SI_CORE_BROWSER_MODE__=true;window.__SI_CORE_CREW__=${data};</script>\n${moduleScript}`
  );
}

async function navigateTo(url) {
  if (!isAllowedContentUrl(url)) {
    throw new Error('Only HTTP and HTTPS websites can be opened.');
  }

  setActiveContent(false);
  await pageView.webContents.loadURL(url);
  sendState();
}

function configureContentSecurity() {
  const browserSession = session.defaultSession;
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.on('will-download', (event) => {
    event.preventDefault();
    sendState({ message: 'Downloads are disabled in this prototype.' });
  });
}

function installDemoProtocol() {
  protocol.handle('si-core-demo', async (request) => {
    const url = new URL(request.url);
    const isHome = url.pathname === '/index.html';
    const isKernel = url.pathname === '/kernel/si-kernel.js';
    const isActivityGraph = url.pathname === '/app/activity-graph-3d.js';
    if (
      request.method !== 'GET' || url.hostname !== 'prototype' || url.search || url.hash ||
      (!isHome && !isKernel && !isActivityGraph)
    ) {
      return new Response('Not found', { status: 404 });
    }

    try {
      const assetPath = isHome ? PROTOTYPE_PATH : isKernel ? KERNEL_PATH : ACTIVITY_GRAPH_PATH;
      const body = await fs.readFile(assetPath, 'utf8');
      let content = body;
      if (isHome) {
        const crewManifest = await fs.readFile(CREW_MANIFEST_PATH, 'utf8');
        content = injectCrewManifest(
          replaceKernelBlock(body, `import { Kernel } from '${KERNEL_URL}';`),
          crewManifest
        ).replace('</head>', '<style id="si-browser-toolbox-mode">#dock{display:none!important}</style></head>');
      }
      const contentType = isHome ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8';
      return new Response(content, { headers: { 'content-type': contentType } });
    } catch (error) {
      console.error(`Unable to serve the SI Core ${isHome ? 'homepage' : 'kernel'}:`, error);
      return new Response(`The SI Core ${isHome ? 'homepage' : 'kernel'} could not be loaded.`, { status: 500 });
    }
  });
}

function attachContentHandlers(view, isHome) {
  const webContents = view.webContents;
  const allowNavigation = isHome
    ? (url) => url === HOME_DEMO_URL
    : isAllowedContentUrl;

  webContents.on('will-navigate', (event, url) => {
    if (!allowNavigation(url)) event.preventDefault();
  });
  webContents.on('will-redirect', (event, url) => {
    if (!allowNavigation(url)) event.preventDefault();
  });
  webContents.setWindowOpenHandler(() => {
    sendState({ message: 'Pop-up windows are disabled in this prototype.' });
    return { action: 'deny' };
  });
  webContents.on('did-navigate', () => sendState());
  webContents.on('did-navigate-in-page', () => sendState());
  webContents.on('did-start-loading', () => sendState({ loading: true, message: '' }));
  webContents.on('did-stop-loading', () => sendState({ loading: false }));
  webContents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      sendState({ loading: false, message: `Page failed to load: ${errorDescription}` });
    }
  });
  webContents.on('render-process-gone', (_event, details) => {
    sendState({ loading: false, message: `Page stopped unexpectedly (${details.reason}).` });
  });
}

function registerBrowserControls() {
  ipcMain.handle('workflows:list', (event) => {
    requireTrustedChrome(event);
    return listUserWorkflows();
  });

  ipcMain.handle('workflows:save', (event, draft) => {
    requireTrustedChrome(event);
    return saveUserWorkflow(draft);
  });

  ipcMain.handle('browser:navigate', async (event, address) => {
    requireTrustedChrome(event);
    try {
      await navigateTo(normalizeNavigationInput(address));
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Navigation failed.';
      sendState({ loading: false, message });
      return { ok: false, message };
    }
  });

  ipcMain.handle('browser:home', (event) => {
    requireTrustedChrome(event);
    setActiveContent(true);
    return { ok: true };
  });

  ipcMain.handle('browser:back', (event) => {
    requireTrustedChrome(event);
    if (pageView.webContents.canGoBack()) pageView.webContents.goBack();
  });

  ipcMain.handle('browser:forward', (event) => {
    requireTrustedChrome(event);
    if (pageView.webContents.canGoForward()) pageView.webContents.goForward();
  });

  ipcMain.handle('browser:reload', (event) => {
    requireTrustedChrome(event);
    (onHome ? homeView : pageView).webContents.reload();
  });
}

function registerToolboxControls() {
  ipcMain.handle('toolbox:toggle', (event) => {
    requireTrustedChrome(event);
    setToolboxOpen(!toolboxOpen);
    return { ok: true, open: toolboxOpen };
  });

  ipcMain.handle('toolbox:snapshot', async (event) => {
    requireTrustedChrome(event);
    if (!homeView || homeView.webContents.isDestroyed()) throw new Error('The SI Core home is unavailable.');
    const snapshot = await homeView.webContents.executeJavaScript(
      'window.__siToolboxSnapshot ? window.__siToolboxSnapshot() : null',
      true
    );
    if (!snapshot) throw new Error('The SI Core toolbox is not ready yet.');
    return snapshot;
  });

  ipcMain.handle('toolbox:sync-workflows', async (event, workflows) => {
    requireTrustedChrome(event);
    if (!homeView || homeView.webContents.isDestroyed()) throw new Error('The SI Core home is unavailable.');
    if (!Array.isArray(workflows) || workflows.length > MAX_WORKFLOWS) {
      throw new Error('The SI Core workflow update is invalid or exceeds its limits.');
    }
    const workflowIds = new Set();
    const safeWorkflows = workflows.map((workflow) => {
      if (
        !workflow || typeof workflow.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(workflow.id) ||
        workflowIds.has(workflow.id) ||
        typeof workflow.name !== 'string' || !workflow.name.trim() || workflow.name.length > 80 ||
        typeof workflow.description !== 'string' || workflow.description.length > 240 ||
        !Array.isArray(workflow.steps) || workflow.steps.length < 1 ||
        workflow.steps.length > MAX_WORKFLOW_STEPS ||
        workflow.steps.some((step) => typeof step !== 'string' || !step.trim() || step.length > 240)
      ) {
        throw new Error('The SI Core workflow update contains invalid workflow data.');
      }
      workflowIds.add(workflow.id);
      return {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        steps: [...workflow.steps]
      };
    });
    const serialized = JSON.stringify(safeWorkflows).replace(/</g, '\\u003c');
    const synced = await homeView.webContents.executeJavaScript(
      `window.__siCoreSetWorkflows ? window.__siCoreSetWorkflows(${serialized}) : false`,
      true
    );
    if (!synced) throw new Error('The SI Core activity engine is not ready to receive local workflows.');
    return { ok: true, count: safeWorkflows.length };
  });

  ipcMain.handle('toolbox:route', async (event, taskId) => {
    requireTrustedChrome(event);
    if (!Number.isSafeInteger(taskId) || taskId < 0) {
      return { ok: false, message: 'Choose a task from the SI Core toolbox catalog.' };
    }
    if (!homeView || homeView.webContents.isDestroyed()) {
      return { ok: false, message: 'The SI Core home is unavailable.' };
    }
    const result = await homeView.webContents.executeJavaScript(
      `window.__siToolboxRouteTask ? window.__siToolboxRouteTask(${taskId}, { background: ${!onHome} }) : null`,
      true
    );
    if (!result) return { ok: false, message: 'The SI Core toolbox is not ready yet.' };
    return result;
  });
}

async function getCompanionSnapshot() {
  if (!homeView || homeView.webContents.isDestroyed()) {
    throw new Error('Capsule OS Browser engine is not available.');
  }
  const snapshot = await homeView.webContents.executeJavaScript(
    'window.__siToolboxSnapshot ? window.__siToolboxSnapshot() : null',
    true
  );
  if (!snapshot) throw new Error('The SI Core engine has not finished initializing.');
  return {
    ...snapshot,
    contractVersion: CONTRACT_VERSION,
    browserVersion: app.getVersion(),
    activeContent: onHome ? 'si-core-home' : 'website'
  };
}

async function routeCompanionTask(taskId) {
  const snapshot = await getCompanionSnapshot();
  if (!snapshot.tasks.some((task) => task.id === taskId)) {
    return { ok: false, message: 'Choose a task ID from the published Capsule catalog.' };
  }
  const result = await homeView.webContents.executeJavaScript(
    `window.__siToolboxRouteTask(${taskId}, { background: ${!onHome} })`,
    true
  );
  return result || { ok: false, message: 'The SI Core route did not return a result.' };
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 980,
    minHeight: 560,
    backgroundColor: '#070609',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  });
  assistantController = new AssistantController({
    ipcMain,
    dialog,
    getWindow: () => mainWindow,
    getWindows: () => [mainWindow],
    getPageView: () => pageView,
    isHome: () => onHome,
    userDataPath: app.getPath('userData'),
    workspacePath: __dirname,
    isTrustedChrome
  });

  pageView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      javascriptCanOpenWindowsAutomatically: false,
      devTools: !app.isPackaged
    }
  });

  homeView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      javascriptCanOpenWindowsAutomatically: false,
      devTools: !app.isPackaged
    }
  });

  toolboxOpen = true;
  mainWindow.contentView.addChildView(homeView);
  mainWindow.contentView.addChildView(pageView);
  attachContentHandlers(homeView, true);
  attachContentHandlers(pageView, false);
  setActiveContent(true);
  mainWindow.on('resize', updatePageBounds);
  mainWindow.on('closed', () => {
    if (pageView && !pageView.webContents.isDestroyed()) pageView.webContents.close();
    if (homeView && !homeView.webContents.isDestroyed()) homeView.webContents.close();
    homeView = null;
    pageView = null;
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== HOME_URL) event.preventDefault();
  });
  mainWindow.webContents.on('did-finish-load', () => sendState());
  try {
    await Promise.all([
      mainWindow.loadURL(HOME_URL),
      homeView.webContents.loadURL(HOME_DEMO_URL)
    ]);
  } catch (error) {
    console.error('Unable to load the SI Core browser interface:', error);
    app.quit();
  }
}

app.whenReady().then(() => {
  configureContentSecurity();
  installDemoProtocol();
  registerBrowserControls();
  registerToolboxControls();
  return createWindow();
}).then(async () => {
  companionBridge = new CompanionBridge({
    directory: capsuleUserData,
    getSnapshot: getCompanionSnapshot,
    routeCatalogTask: routeCompanionTask,
    handleAssistantRequest: (request) => assistantController.handleCompanionRequest(request)
  });
  await companionBridge.start();
}).catch((error) => {
  console.error('Unable to start Capsule OS Browser:', error);
  app.quit();
});

app.on('before-quit', (event) => {
  if (!companionBridge || companionShutdownStarted) return;
  event.preventDefault();
  companionShutdownStarted = true;
  const bridge = companionBridge;
  companionBridge = null;
  bridge.stop().catch((error) => {
    console.error('Unable to cleanly stop the Capsule Toolbox bridge:', error);
  }).finally(() => app.quit());
});

app.on('will-quit', () => assistantController?.dispose());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
