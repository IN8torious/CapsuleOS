import { createActivityGraph } from './activity-graph-3d.js';

const addressInput = document.querySelector('#address');
const statusMessage = document.querySelector('#status-message');
const pageStatus = document.querySelector('#page-status');
const backButton = document.querySelector('#back');
const forwardButton = document.querySelector('#forward');
const engineDock = document.querySelector('#engine-dock');
const engineToggle = document.querySelector('#toolbox-toggle');
const drawerTab = document.querySelector('#drawer-tab');
const homeStage = document.querySelector('#home-stage');
const activityGraph = createActivityGraph(document.querySelector('#engine-graph'));
let snapshotPending = false;

function showMessage(message = '') {
  statusMessage.textContent = message;
}

function setEngineDockOpen(open) {
  engineDock.classList.toggle('collapsed', !open);
  document.body.classList.toggle('drawer-closed', !open);
  engineToggle.setAttribute('aria-expanded', String(open));
  drawerTab.setAttribute('aria-expanded', String(open));
  drawerTab.firstElementChild.textContent = open ? '›' : '‹';
}

function renderState(state) {
  backButton.disabled = !state.canGoBack;
  forwardButton.disabled = !state.canGoForward;
  if (state.url) addressInput.value = state.url;
  if (state.home) {
    addressInput.value = '';
    pageStatus.textContent = 'CAPSULE OS · SI CORE 3D HOME';
  } else {
    pageStatus.textContent = state.loading ? 'LOADING · CHROMIUM WEB CONTENT' : 'WEB CONTENT · ISOLATED';
  }
  homeStage.hidden = !state.home;
  if (typeof state.toolboxOpen === 'boolean') setEngineDockOpen(state.toolboxOpen);
  showMessage(state.message || '');
}

function renderReceipts(receipts) {
  const root = document.querySelector('#dock-receipts-list');
  root.replaceChildren();
  if (!receipts.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No task receipt has been sealed in this browser session yet.';
    root.append(empty);
    return;
  }
  for (const receipt of receipts.slice(-4).reverse()) {
    const item = document.createElement('article');
    item.className = 'dock-receipt';
    const title = document.createElement('strong');
    title.textContent = `#${receipt.seq} · ${receipt.agent}`;
    const detail = document.createElement('small');
    detail.textContent = receipt.event;
    item.append(title, detail);
    root.append(item);
  }
}

function renderSnapshot(snapshot, userWorkflows = []) {
  const agents = snapshot.agents || [];
  const tasks = snapshot.tasks || [];
  const receipts = snapshot.receipts || [];
  document.querySelector('#engine-state').textContent = snapshot.busy ? 'ROUTING' : 'ONLINE';
  document.querySelector('#dock-agents').textContent = String(agents.length).padStart(2, '0');
  document.querySelector('#dock-routes').textContent = String(tasks.length + userWorkflows.length).padStart(2, '0');
  document.querySelector('#dock-receipts').textContent = String(receipts.length).padStart(2, '0');
  document.querySelector('#dock-ledger-state').textContent = snapshot.ledgerValid ? 'VERIFIED' : 'UNVERIFIED';
  document.querySelector('#companion-link-state').textContent = 'BRIDGE READY';
  document.querySelector('#home-stage').dataset.verified = String(snapshot.ledgerValid);
  activityGraph.update(agents, [...tasks, ...userWorkflows], receipts, snapshot.busy);
  renderReceipts(receipts);
}

async function refreshEngineSnapshot() {
  if (snapshotPending) return;
  snapshotPending = true;
  try {
    const snapshot = await window.siBrowser.engineSnapshot();
    let userWorkflows = [];
    try {
      userWorkflows = await window.siBrowser.listWorkflows();
      await window.siBrowser.syncWorkflowsWithEngine(userWorkflows);
    } catch (error) {
      showMessage(error.message || 'Local workflows are unavailable.');
    }
    renderSnapshot(snapshot, userWorkflows);
  } catch (error) {
    document.querySelector('#engine-state').textContent = 'STARTING';
    document.querySelector('#companion-link-state').textContent = 'STARTING';
    document.querySelector('#dock-ledger-state').textContent = 'WAITING';
    const root = document.querySelector('#dock-receipts-list');
    root.replaceChildren();
    const message = document.createElement('p');
    message.textContent = error.message || 'The SI Core engine is initializing.';
    root.append(message);
  } finally {
    snapshotPending = false;
  }
}

async function submitAddress() {
  try {
    const result = await window.siBrowser.navigate(addressInput.value);
    if (!result.ok) showMessage(result.message);
  } catch (error) {
    showMessage(error.message || 'Navigation failed.');
  }
}

document.querySelector('#address-form').addEventListener('submit', (event) => {
  event.preventDefault();
  submitAddress();
});
document.querySelector('#back').addEventListener('click', () => window.siBrowser.back());
document.querySelector('#forward').addEventListener('click', () => window.siBrowser.forward());
document.querySelector('#home').addEventListener('click', () => window.siBrowser.home());
document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  window.siBrowser.home();
});
document.querySelector('#reload').addEventListener('click', () => window.siBrowser.reload());
document.querySelector('#toolbox-toggle').addEventListener('click', () => window.siBrowser.toggleToolbox());
drawerTab.addEventListener('click', () => window.siBrowser.toggleToolbox());

import('./brand-mark.js').then((m) => m.mountBrandMark(document.querySelector('.brand-mark'))).catch(() => {});

window.siBrowser.onState(renderState);
window.siBrowser.onState(refreshEngineSnapshot);
refreshEngineSnapshot();
window.setInterval(refreshEngineSnapshot, 1800);
