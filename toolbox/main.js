import { invoke, inDesktopApp } from './bridge.js';
import { open } from '@tauri-apps/plugin-dialog';
import { kernelLibrary, sourceArchive, nimbusisArchive } from './kernel-library.js';
import { CYCLE_MS, dueForCycle, emptyLedger, parseLedger, setLearningEnabled, recordSignal, resolveIdea, runCycle, forgetPlanet } from '../app/learning.js';
import { buildDistrict } from '../app/district.js';
import capsuleIconUrl from '../assets/capsule-playbook-icon.png?url';
import { inspectPerformanceProposal, mountPerformanceAdvisor } from './performance-view.js';
import { reviewAndApplyAppearance, rollbackTweaks } from './tweak-actions.js';
import { createPerformanceDiscussion, createUserDiscussion, decideDiscussion, routePerformanceIntent } from '../app/task-discussion.js';
import { LESSON_CATEGORIES, learningProfile } from '../app/learning-profile.js';
import { COLOR_PROFILES, getColorProfile, readColorProfile, applyColorProfile, saveColorProfile } from './ui-profiles.js';
import { isMuted, isAudioReady, setMuted, unlockAudio } from '../app/musicode.js';
import { proposalSummary, proposalHistory, syncProposalNotifications } from './proposal-notifications.js';
import { createViewLoader } from './view-loader.js';
import { cockpitMetrics, createReceiptTickets } from './cockpit-metrics.js';
import { includedModelCatalog, inspectModelAvailability } from './model-catalog.js';
import { mountLivePerformance } from './live-performance.js';
import { mountAgentRuntime } from './agent-runtime-view.js';
import { mountOrchestratorView } from './orchestrator-view.js';
import { mountReleaseNotes } from './release-notes.js';
import { applyTheme, saveTheme } from './theme.js';

document.querySelector('#capsule-brand-icon').src = capsuleIconUrl;
document.querySelector('#capsule-favicon').href = capsuleIconUrl;
mountPerformanceAdvisor(document.querySelector('.view[data-view="performance"]'));
mountAgentRuntime(document.querySelector('.workspace'));
mountOrchestratorView(document.querySelector('#orchestrator-panel'));
mountReleaseNotes(document.querySelector('.view[data-view="auditor"]'));
window.addEventListener('capsule-runtime-changed', () => { void loadModCatalog(); });

function renderColorProfiles(activeId) {
  const root = document.querySelector('#color-profile-options');
  const active = getColorProfile(activeId);
  root.replaceChildren();
  const select = (id) => {
    try {
      saveColorProfile(id, localStorage, document.documentElement);
      renderColorProfiles(id);
      document.querySelector('#color-profile-status').textContent = 'Accent color saved on this device.';
    } catch (error) {
      document.querySelector('#color-profile-status').textContent = `Unable to save color preference: ${error.message}`;
    }
  };
  for (const profile of COLOR_PROFILES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-profile-choice';
    button.style.setProperty('--swatch', profile.accent);
    button.setAttribute('aria-label', profile.name);
    button.title = profile.name;
    button.setAttribute('aria-pressed', String(profile.accent === active.accent));
    button.addEventListener('click', () => select(profile.id));
    root.append(button);
  }
  const spectrum = document.createElement('label');
  spectrum.className = 'color-spectrum-picker';
  spectrum.title = 'Choose any color from the full spectrum';
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = active.accent;
  picker.id = 'custom-accent-color';
  picker.setAttribute('aria-label', 'Choose any accent color from the full spectrum');
  picker.addEventListener('input', () => {
    applyColorProfile(picker.value, document.documentElement);
    root.querySelectorAll('.color-profile-choice').forEach(button => button.setAttribute('aria-pressed', 'false'));
  });
  picker.addEventListener('change', () => select(picker.value));
  spectrum.append(picker);
  root.append(spectrum);
}
try {
  const id = readColorProfile(localStorage);
  applyColorProfile(id, document.documentElement);
  renderColorProfiles(id);
} catch (error) {
  applyColorProfile('parchment', document.documentElement);
  renderColorProfiles('parchment');
  document.querySelector('#color-profile-status').textContent = `Color preference unavailable: ${error.message}`;
}

const themeSelect = document.querySelector('#toolbox-theme');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
themeSelect.value = document.documentElement.dataset.themePreference || 'light';
function notifyTheme() {
  const theme = document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#171a20' : '#f6f4ee';
  window.dispatchEvent(new CustomEvent('capsule-theme-changed', { detail: theme }));
}
themeSelect.addEventListener('change', () => {
  try {
    saveTheme(themeSelect.value, localStorage, document.documentElement, systemTheme.matches);
    notifyTheme();
    document.querySelector('#toolbox-theme-status').textContent = 'Toolbox theme saved. No Windows setting was changed.';
  } catch (error) {
    themeSelect.value = document.documentElement.dataset.themePreference || 'light';
    document.querySelector('#toolbox-theme-status').textContent = `Unable to save theme: ${error.message}`;
  }
});
systemTheme.addEventListener('change', () => {
  if (document.documentElement.dataset.themePreference !== 'system') return;
  applyTheme('system', document.documentElement, systemTheme.matches);
  notifyTheme();
});
notifyTheme();

function syncSettingsSound() {
  const enabled = !isMuted() && isAudioReady();
  const button = document.querySelector('#settings-agent-sound');
  button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled ? 'MUTE AGENT SOUND' : 'ENABLE AGENT SOUND';
}
const materialSelect = document.querySelector('#surface-material');
function applySurfaceMaterial(value) {
  if (!['system', 'frosted', 'solid'].includes(value)) throw new Error('Unsupported surface material.');
  document.documentElement.dataset.surfaceMaterial = value;
  materialSelect.value = value;
}
try { applySurfaceMaterial(localStorage.getItem('capsule-surface-material-v1') || 'system'); }
catch (error) { document.querySelector('#surface-material-status').textContent = `Surface preference unavailable: ${error.message}`; }
materialSelect.addEventListener('change', () => {
  try {
    applySurfaceMaterial(materialSelect.value);
    localStorage.setItem('capsule-surface-material-v1', materialSelect.value);
    document.querySelector('#surface-material-status').textContent = 'Toolbox surface preference saved. No Windows setting was changed.';
  } catch (error) { document.querySelector('#surface-material-status').textContent = `Unable to save surface preference: ${error.message}`; }
});
window.addEventListener('capsule-audio-state', syncSettingsSound);
syncSettingsSound();
document.querySelector('#settings-agent-sound').addEventListener('click', async () => {
  try {
    if (!isMuted() && isAudioReady()) setMuted(true);
    else { await unlockAudio(); setMuted(false); }
    document.querySelector('#settings-sound-status').textContent = isMuted() ? 'Agent sound muted.' : 'Agent sound enabled for this session.';
  } catch (error) {
    document.querySelector('#settings-sound-status').textContent = `Unable to enable sound: ${error.message}`;
  }
});

const LEARN_KEY = 'capsule-learning-v1';
let learning = emptyLedger();
let learningReady = true, learningError = '', learningTimer;
try {
  learning = parseLedger(localStorage.getItem(LEARN_KEY));
} catch (error) {
  learningReady = false;
  learningError = `Local learning was not loaded or overwritten: ${error.message}`;
  console.error(learningError);
}

let cacheStatusBusy = false;
async function refreshReviewCache(clear = false) {
  if (cacheStatusBusy) return;
  if (clear && !window.confirm('Clear disposable source reports and model review results? Approved lessons, workflows, model weights and original files will remain.')) return;
  cacheStatusBusy = true;
  const status = document.querySelector('#review-cache-status');
  const clearButton = document.querySelector('#review-cache-clear');
  clearButton.disabled = true;
  try {
    const response = await invoke(clear ? 'clear_review_cache' : 'review_cache_status', clear ? { confirmed: true } : {});
    if (!response.ok) throw new Error(response.message || 'Unable to inspect the review cache.');
    const cache = response.cache;
    document.querySelector('#review-cache-usage').value = cache.usedBytes;
    status.textContent = `${clear ? 'Cache cleared. ' : ''}${(cache.usedBytes / 1024 ** 2).toFixed(2)} MiB / 2 GiB · ${cache.itemCount} items · seven-day inactivity expiry.`;
  } catch (error) {
    status.textContent = typeof error === 'string' ? error : error.message;
  } finally { cacheStatusBusy = false; clearButton.disabled = false; }
}

const CONTRACT_VERSION = 2;
const loadView = createViewLoader();
const receiptTickets = createReceiptTickets();
let expandedGraph = null;
const graphHomes = new Map();
function setGraphExpanded(element, expand) {
  if (expandedGraph && expandedGraph !== element) setGraphExpanded(expandedGraph, false);
  if (expand && !graphHomes.has(element)) {
    const marker = document.createComment('graph-home');
    element.replaceWith(marker);
    graphHomes.set(element, marker);
    document.body.append(element);
  } else if (!expand && graphHomes.has(element)) {
    graphHomes.get(element).replaceWith(element);
    graphHomes.delete(element);
  }
  element.classList.toggle('graph-fullscreen', expand);
  document.body.classList.toggle('graph-open', expand);
  element.querySelector('.graph-expand')?.setAttribute('aria-label', expand ? 'Minimize graph' : 'Enlarge graph');
  element.querySelector('.graph-expand').textContent = expand ? '✕' : '⤢';
  expandedGraph = expand ? element : null;
  if (expand) element.querySelector('canvas')?.focus();
}
for (const element of document.querySelectorAll('.activity-graph')) {
  element.addEventListener('graph-empty-click', () => {
    if (!element.classList.contains('graph-fullscreen')) setGraphExpanded(element, true);
  });
}
function addExpandButtons() {
  for (const element of document.querySelectorAll('.activity-graph')) {
    if (element.querySelector('.graph-expand') || !element.querySelector('canvas')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'graph-expand';
    button.textContent = '⤢';
    button.setAttribute('aria-label', 'Enlarge graph');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      setGraphExpanded(element, !element.classList.contains('graph-fullscreen'));
    });
    element.append(button);
  }
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && expandedGraph) setGraphExpanded(expandedGraph, false);
});
let graphsPromise = null;
let approvedLessons = [];
function loadGraphs() {
  graphsPromise ??= import('../app/activity-graph-3d.js').then(({ createActivityGraph }) => [
    createActivityGraph(document.querySelector('#agent-graph'), { decisionTools: true, calm: true }),
    createActivityGraph(document.querySelector('#agent-graph-expanded'), { decisionTools: true, calm: true })
  ]).then(graphs => {
    for (const graph of graphs) graph.setLearningProfile(learningProfile(approvedLessons));
    return graphs;
  });
  return graphsPromise;
}
let browserSnapshot = null;
let appearanceSnapshot = null;
let refreshInFlight = false;
let userWorkflows = [];
let workflowEditId = null;
let auditorLoadInFlight = false;
let savedAgentProposals = [];
let modModels = includedModelCatalog();
let modCatalogOnline = false;
let modCatalogBusy = false;
let modSelectedPackage = null;
let modAnalysisJobId = '';
let modAnalysisResults = [];
let modModelReady = false;
let modLoadedModelId = '';
let modBusy = false;
let modDownloadPolling = false;
let modStatusPolling = false;
let appearanceBusy = false;
let appearanceBatchBusy = false;
const pendingAppearance = new Map();

function updateAppearanceActions() {
  document.querySelector('#appearance-pending').textContent = pendingAppearance.size
    ? `${pendingAppearance.size} pending preference${pendingAppearance.size === 1 ? '' : 's'}`
    : 'No pending changes.';
  document.querySelector('#appearance-apply').disabled = appearanceBusy || appearanceBatchBusy || !pendingAppearance.size;
  document.querySelector('#appearance-discard').disabled = appearanceBusy || appearanceBatchBusy || !pendingAppearance.size;
  document.querySelector('#appearance-undo').disabled = appearanceBusy || appearanceBatchBusy;
  for (const id of ['#theme-switch', '#transparency-switch', '#window-animations-switch']) {
    document.querySelector(id).disabled = appearanceBusy || appearanceBatchBusy || !appearanceSnapshot;
  }
}

function stageAppearance(setting, button) {
  if (appearanceBusy || appearanceBatchBusy || !appearanceSnapshot) return;
  const enabled = button.getAttribute('aria-checked') !== 'true';
  button.setAttribute('aria-checked', String(enabled));
  if (enabled === (button.dataset.current === 'true')) pendingAppearance.delete(setting);
  else pendingAppearance.set(setting, enabled);
  updateAppearanceActions();
}

async function applyAppearanceSelection() {
  if (appearanceBusy || appearanceBatchBusy || !pendingAppearance.size) return;
  const settings = [...pendingAppearance].map(([setting, enabled]) => ({ setting, enabled }));
  appearanceBatchBusy = true;
  updateAppearanceActions();
  try {
    const result = await reviewAndApplyAppearance(settings);
    await inspectAppearance();
    document.querySelector('#theme-status').textContent = result;
  } catch (error) {
    await inspectAppearance();
    document.querySelector('#theme-status').textContent = typeof error === 'string' ? error : error.message;
  } finally {
    appearanceBatchBusy = false;
    for (const id of ['#theme-switch', '#transparency-switch', '#window-animations-switch']) {
      document.querySelector(id).disabled = !appearanceSnapshot;
    }
    updateAppearanceActions();
  }
}

function text(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  return element;
}

function setConnectionStatus(connected, message) {
  const dot = document.querySelector('#link-dot');
  dot.classList.toggle('connected', connected);
  document.querySelector('#link-status').textContent = message;
  document.querySelector('.runtime-health').title = message;
  document.querySelector('#footer-contract').textContent = connected
    ? `CONTRACT v${CONTRACT_VERSION} · LIVE LINK`
    : `CONTRACT v${CONTRACT_VERSION} · BROWSER OFFLINE`;
  document.querySelector('#engine-version').textContent = `CONTRACT v${CONTRACT_VERSION} · ${connected ? 'COMPATIBLE' : 'WAITING'}`;
}

function recentAgentCounts(agents, receipts) {
  const counts = new Map(agents.map((agent) => [agent.id, 0]));
  for (const receipt of receipts) {
    if (counts.has(receipt.agent)) counts.set(receipt.agent, counts.get(receipt.agent) + 1);
  }
  return counts;
}

import { CREW } from './crew-data.js';

const crewAgents = CREW.filter((agent) => agent.id !== 'crew-si-core').map((agent) => ({
  id: agent.id,
  name: agent.name,
  purpose: [agent.seat, agent.purpose, agent.law && `Law: ${agent.law}`].filter(Boolean).join(' — ').slice(0, 420),
}));

let lastGraphInput = [[], [], [], false];
const taskDiscussions = [];
let userProposalBusy = false;
function addTaskDiscussion(thread) {
  taskDiscussions.push(thread);
  if (taskDiscussions.length > 12) taskDiscussions.shift();
  renderAgentGraphs(...lastGraphInput);
}
window.addEventListener('capsule-performance-proposals', (event) => {
  addTaskDiscussion(createPerformanceDiscussion(event.detail.goal, event.detail.proposals));
});
window.addEventListener('capsule-user-proposal', async (event) => {
  const { text, reply } = event.detail;
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 240) {
    reply('Describe the proposed change in 1-240 characters.');
    return;
  }
  if (userProposalBusy) { reply('Another proposal is being inspected. Wait for its result before sending another.'); return; }
  userProposalBusy = true;
  try {
    const goal = routePerformanceIntent(text);
    if (!goal) {
      addTaskDiscussion(createUserDiscussion(text, 'This proposal is recorded for discussion, not approved for execution. The current rule-based agents can inspect desktop responsiveness, gaming capture, background activity, battery use or plugged-in performance. Choose a supported direction below; disabling security and overclocking are outside this tool.'));
      reply('Vera requested a supported direction. Nothing was changed.');
    } else {
      const { proposals } = await inspectPerformanceProposal(goal);
      addTaskDiscussion(createPerformanceDiscussion(goal, proposals, Date.now(), text));
      reply('The agent discussion is below, with potential gains, losses and evidence checks. Nothing was applied.');
    }
  } catch (error) {
    const message = typeof error === 'string' ? error : error.message;
    addTaskDiscussion(createUserDiscussion(text, `Windows inspection could not complete: ${message}. No change was approved or applied.`));
    reply(`Inspection unavailable: ${message}`);
  } finally { userProposalBusy = false; }
});
window.addEventListener('capsule-graph-direction', (event) => {
  selectView('performance');
  document.querySelector('.view[data-view="performance"]').dispatchEvent(new CustomEvent('capsule-performance-goal', { detail: event.detail.goal }));
});
window.addEventListener('capsule-graph-decision', (event) => {
  const index = taskDiscussions.findIndex((thread) => thread.id === event.detail.id);
  if (index < 0 || taskDiscussions[index].decision !== 'pending') return;
  taskDiscussions[index] = decideDiscussion(taskDiscussions[index], event.detail.decision);
  renderAgentGraphs(...lastGraphInput);
  if (event.detail.decision === 'review') {
    selectView('performance');
    document.querySelector('.view[data-view="performance"]').dispatchEvent(new CustomEvent('capsule-performance-goal', { detail: taskDiscussions[index].goal }));
  }
});
function renderAgentGraphs(agents, workflows, receipts, busy = false) {
  lastGraphInput = [agents, workflows, receipts, busy];
  const shownAgents = agents.length ? agents : crewAgents;
  const kernels = (learning.kernels || []).map((kernel) => ({
    id: kernel.id,
    kind: 'kernel',
    name: kernel.name,
    description: kernel.detail,
  }));
  loadGraphs()
    .then((graphs) => {
      addExpandButtons();
      graphs.forEach((graph) => graph.update(shownAgents, [...workflows, ...kernels], receipts, busy, taskDiscussions));
    })
    .catch((error) => {
      window.__graphErr = String(error && error.stack || error);
      for (const host of document.querySelectorAll('.activity-graph')) {
        let status = host.querySelector('.graph-runtime-error');
        if (!status) {
          status = text('div', 'graph-runtime-error empty-card', '');
          status.setAttribute('role', 'alert');
          host.append(status);
        }
        status.textContent = `3D graph unavailable: ${error.message || String(error)}. Check graphics support and restart the app. Other Toolbox pages remain available.`;
      }
    });
}

function renderAgentDirectory(agents, receipts) {
  const root = document.querySelector('#agent-directory');
  root.replaceChildren();
  const reference = agents.length === 0;
  const shown = reference ? crewAgents : agents;
  document.querySelector('[data-graph-source]').textContent = reference ? 'REFERENCE TOPOLOGY' : 'CONNECTED RECEIPTS';
  document.querySelector('[data-roster-source]').textContent = reference
    ? 'Bundled reference roles. No live activity is connected; these descriptions are not running agents.'
    : 'Roles supplied by the connected workspace. Receipt counts describe recorded work, not resource usage.';
  document.querySelector('[data-roster-count]').textContent = `(${shown.length} roles)`;
  const counts = recentAgentCounts(shown, receipts);
  for (const agent of shown) {
    const card = document.createElement('article');
    card.className = 'agent-card';
    const activity = text(
      'span',
      'agent-live',
      reference ? 'REFERENCE' : counts.get(agent.id) ? `${counts.get(agent.id)} RECEIPT${counts.get(agent.id) === 1 ? '' : 'S'}` : 'NO RECEIPTS'
    );
    card.append(
      activity,
      text('div', 'eyebrow', 'SI CORE CREW'),
      text('strong', '', agent.name),
      text('p', '', agent.purpose || 'Governed proposal role; no execution grant.'),
      text('small', '', agent.capabilities?.length ? agent.capabilities.join(' · ') : 'NO DIRECT CAPABILITIES')
    );
    const locate = text('button', 'button quiet', 'Locate in graph');
    locate.type = 'button';
    locate.addEventListener('click', () => {
      loadGraphs().then(graphs => {
        graphs[1].focus(`agent:${agent.id}`);
        document.querySelector('#agent-graph-expanded').scrollIntoView({ block: 'center', behavior: 'smooth' });
      }).catch(error => { document.querySelector('[data-roster-source]').textContent = `Graph unavailable: ${error.message}`; });
    });
    card.append(locate);
    root.append(card);
  }
  filterAgentDirectory();
}
function filterAgentDirectory() {
  const query = document.querySelector('[data-roster-search]').value.trim().toLowerCase();
  for (const card of document.querySelectorAll('#agent-directory .agent-card')) card.hidden = !card.textContent.toLowerCase().includes(query);
}
document.querySelector('[data-roster-search]').addEventListener('input', filterAgentDirectory);

function renderReceipts(receipts) {
  const root = document.querySelector('#recent-receipts');
  root.replaceChildren();
  if (!receipts.length) {
    root.append(text('div', 'empty-card', 'No route receipt has been sealed in the connected browser session yet.'));
    return;
  }
  for (const receipt of receipts.slice(-6).reverse()) {
    const row = document.createElement('article');
    row.className = 'receipt-row';
    row.append(
      text('span', 'receipt-seal', 'SEALED'),
      text('strong', '', `#${receipt.seq} · ${receipt.hash} · ${receipt.agent}`),
      text('p', '', receipt.event)
    );
    root.append(row);
  }
}

function renderTaskList(tasks) {
  const root = document.querySelector('#task-grid');
  root.replaceChildren();
  if (!tasks.length) {
    root.append(text('div', 'empty-card', 'The browser is connected, but the SI Core task catalog has not loaded.'));
    return;
  }
  for (const task of tasks) {
    const card = document.createElement('article');
    card.className = 'task-card';
    const details = document.createElement('div');
    details.append(
      text('strong', '', task.text),
      text('small', '', `${task.kind || 'recommendation'} · ${task.agentName} · ${task.capability} · ${task.risk}`)
    );
    const button = text('button', '', 'ROUTE');
    button.type = 'button';
    button.addEventListener('click', () => routeTask(task.id, button));
    card.append(details, button);
    root.append(card);
  }
}

function updateWorkflowGraphs() {
  const agents = browserSnapshot?.agents || [];
  const tasks = browserSnapshot?.tasks || [];
  const receipts = browserSnapshot?.receipts || [];
  const connected = Boolean(browserSnapshot);
  renderAgentGraphs(agents, [...tasks, ...userWorkflows], receipts, Boolean(browserSnapshot?.busy));
  renderCockpitMetrics();
  document.querySelector('#graph-summary').textContent =
    `${connected ? `${tasks.length} starter routes` : 'Browser offline'} · ${userWorkflows.length} saved workflows · ${agents.length} agents · ${receipts.length} receipts`;
}

function renderCockpitMetrics() {
  const metrics = cockpitMetrics(browserSnapshot, crewAgents, userWorkflows);
  for (const [id, value, label] of [
    ['stat-agents', metrics.agents, metrics.agentLabel],
    ['stat-tasks', metrics.workflows, metrics.workflowLabel]
  ]) {
    const node = document.getElementById(id);
    node.textContent = String(value).padStart(2, '0');
    node.title = label;
    node.setAttribute('aria-label', `${value} · ${label}`);
  }
  const tickets = receiptTickets.update(browserSnapshot?.receipts || []);
  const receipt = document.querySelector('#stat-receipts');
  receipt.textContent = `#${String(tickets).padStart(4, '0')}`;
  receipt.setAttribute('aria-label', `${tickets} receipt tickets since the last display reset`);
  const health = document.querySelector('#stat-health');
  health.textContent = metrics.health;
  health.title = metrics.healthLabel;
  health.classList.toggle('metric-unavailable', !metrics.health.endsWith('%'));
  document.querySelector('#stat-health-label').textContent = metrics.healthLabel;
}

function renderWorkflowLibrary() {
  const root = document.querySelector('#workflow-library');
  root.replaceChildren();
  if (!userWorkflows.length) {
    root.append(text('div', 'empty-card', 'No workflows saved yet. Create one above; it will appear in both 3D engine graphs.'));
    return;
  }
  for (const workflow of userWorkflows) {
    const card = document.createElement('article');
    card.className = 'workflow-card';
    const heading = document.createElement('div');
    heading.className = 'workflow-card-head';
    heading.append(
      text('strong', '', workflow.name),
      text('span', 'workflow-card-meta', `${workflow.steps.length} STEPS`)
    );
    card.append(
      heading,
      text('p', '', workflow.description || 'No purpose description.'),
      text('small', 'workflow-card-meta', `UPDATED ${new Date(workflow.updatedAt).toLocaleDateString()}`)
    );
    const steps = document.createElement('ol');
    for (const step of workflow.steps) steps.append(text('li', '', step));
    card.append(steps);
    const actions = document.createElement('div');
    actions.className = 'workflow-card-actions';
    const edit = text('button', '', 'EDIT');
    edit.type = 'button';
    edit.addEventListener('click', () => editWorkflow(workflow));
    const remove = text('button', 'delete', 'DELETE');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteWorkflow(workflow));
    actions.append(edit, remove);
    card.append(actions);
    root.append(card);
  }
}

async function loadUserWorkflows() {
  try {
    userWorkflows = await invoke('list_user_workflows');
    renderWorkflowLibrary();
    updateWorkflowGraphs();
    document.querySelector('#workflow-status').textContent =
      `${userWorkflows.length} local workflow${userWorkflows.length === 1 ? '' : 's'} · data-only · shared with the Browser graph`;
  } catch (error) {
    document.querySelector('#workflow-library').replaceChildren(
      text('div', 'empty-card', 'Local workflows could not be loaded.')
    );
    document.querySelector('#workflow-status').textContent =
      typeof error === 'string' ? error : 'Unable to load the local workflow library.';
  }
}

function resetWorkflowForm() {
  workflowEditId = null;
  document.querySelector('#workflow-form').reset();
  document.querySelector('#workflow-form-title').textContent = 'Create a workflow';
  document.querySelector('#workflow-save').textContent = 'SAVE WORKFLOW';
  document.querySelector('#workflow-cancel').hidden = true;
}

function editWorkflow(workflow) {
  workflowEditId = workflow.id;
  document.querySelector('#workflow-name').value = workflow.name;
  document.querySelector('#workflow-description').value = workflow.description;
  document.querySelector('#workflow-steps').value = workflow.steps.join('\n');
  document.querySelector('#workflow-form-title').textContent = 'Edit workflow';
  document.querySelector('#workflow-save').textContent = 'SAVE CHANGES';
  document.querySelector('#workflow-cancel').hidden = false;
  document.querySelector('#workflow-name').focus();
}

async function saveWorkflow(event) {
  event.preventDefault();
  const name = document.querySelector('#workflow-name').value.trim();
  const description = document.querySelector('#workflow-description').value.trim();
  const steps = document.querySelector('#workflow-steps').value
    .split(/\r?\n/)
    .map((step) => step.trim())
    .filter(Boolean);
  const status = document.querySelector('#workflow-status');
  if (!name || name.length > 80 || description.length > 240 || steps.length < 1 || steps.length > 20 ||
      steps.some((step) => step.length > 240)) {
    status.textContent = 'Use a name up to 80 characters, an optional description up to 240, and 1–20 steps up to 240 characters each.';
    return;
  }
  try {
    await invoke('save_user_workflow', {
      draft: { id: workflowEditId, name, description, steps },
    });
    resetWorkflowForm();
    await loadUserWorkflows();
    status.textContent = 'Workflow saved locally. It is still data-only and cannot run or change Windows.';
  } catch (error) {
    status.textContent = typeof error === 'string' ? error : 'Unable to save this workflow.';
  }
}

async function deleteWorkflow(workflow) {
  if (!window.confirm(`Delete “${workflow.name}” from this device?`)) return;
  try {
    await invoke('delete_user_workflow', { workflowId: workflow.id });
    if (workflowEditId === workflow.id) resetWorkflowForm();
    await loadUserWorkflows();
    document.querySelector('#workflow-status').textContent = 'Workflow deleted from this device.';
  } catch (error) {
    document.querySelector('#workflow-status').textContent =
      typeof error === 'string' ? error : 'Unable to delete this workflow.';
  }
}

function renderAuditorProposals(proposals) {
  const root = document.querySelector('#auditor-proposals');
  root.replaceChildren();
  if (!proposals.length) {
    root.append(text('div', 'empty-card', 'No proposals in this view. Analyze HTML or a package in Mod Forge, select findings, and send them to Agent Proposals. History is kept on this device (up to 100 proposals).'));
    return;
  }
  for (const proposal of proposals) {
    const card = document.createElement('article');
    card.className = 'auditor-proposal-card';
    const header = document.createElement('div');
    header.className = 'auditor-proposal-head';
    const identity = document.createElement('div');
    identity.append(
      text('strong', '', proposal.name),
      text('small', '', `${proposal.sourcePackage} · ${new Date(proposal.createdAt).toLocaleString()}`)
    );
    const state = text('span', `auditor-state ${proposal.status}`, proposal.status.toUpperCase());
    header.append(identity, state);
    card.append(header);
    card.append(text('p', 'auditor-warning', 'UNVERIFIED LOCAL-MODEL OUTPUT · reference only · no action is authorized'));
    if (proposal.packageSha256) {
      card.append(
        text('div', 'auditor-subhead', 'PACKAGE FINGERPRINT'),
        text('code', 'auditor-evidence-hash', `SHA-256 ${proposal.packageSha256}`)
      );
    }

    const pathHeading = text('div', 'auditor-subhead', 'PACKAGE SOURCE PATHS');
    card.append(pathHeading);
    const paths = document.createElement('div');
    paths.className = 'auditor-source-paths';
    for (const sourcePath of proposal.sourcePaths) paths.append(text('code', '', sourcePath));
    if (!proposal.sourcePaths.length) paths.append(text('span', '', 'No source path recorded.'));
    card.append(paths);
    if (proposal.sourceEvidence?.length) {
      card.append(text('div', 'auditor-subhead', 'INSPECTED SOURCE EVIDENCE'));
      const evidence = document.createElement('div');
      evidence.className = 'auditor-source-paths';
      for (const item of proposal.sourceEvidence) {
        evidence.append(text('code', '', `${item.path} · SHA-256 ${item.sha256} · ${item.lineCount} lines`));
      }
      card.append(evidence);
    }
    for (const finding of proposal.findings) {
      const section = document.createElement('section');
      section.className = 'auditor-finding';
      section.append(
        text('strong', '', finding.reviewer),
        text('pre', '', finding.text)
      );
      if (finding.citations?.length) {
        section.append(text('div', 'auditor-subhead', 'PATH/RANGE CHECKED · CLAIM SUPPORT NOT VERIFIED'));
        const citations = document.createElement('div');
        citations.className = 'auditor-source-paths';
        for (const citation of finding.citations) {
          citations.append(text('code', '', `${citation.path}:L${citation.lineStart}-L${citation.lineEnd}`));
        }
        section.append(citations);
      }
      card.append(section);
    }
    const actions = document.createElement('div');
    actions.className = 'auditor-proposal-actions';
    if (proposal.status === 'pending') {
      const reviewed = text('button', 'button secondary', 'MARK REVIEWED');
      reviewed.type = 'button';
      reviewed.addEventListener('click', () => reviewAuditorProposal(proposal, 'reviewed', reviewed));
      const dismiss = text('button', 'button quiet', 'DISMISS');
      dismiss.type = 'button';
      dismiss.addEventListener('click', () => reviewAuditorProposal(proposal, 'dismissed', dismiss));
      actions.append(reviewed, dismiss);
    } else {
      const stateNote = text('small', '', proposal.status === 'reviewed'
        ? 'Reviewed locally. No settings or files were changed.'
        : 'Dismissed locally. No settings or files were changed.');
      actions.append(stateNote);
    }
    card.append(actions);
    root.append(card);
  }
}

function renderKernelLibrary() {
  const root = document.querySelector('#kernel-library-grid');
  root.replaceChildren();
  document.querySelector('#kernel-source-note').textContent =
    'Your original Raijin, Nimbusis and RingFlow kernel projects. Explore a design, inspect its source record, or draft a data-only review workflow. Archive code is not executed here.';
  document.querySelector('#kernel-source-hash').textContent =
    `SOURCE ARCHIVE SHA-256 · ${sourceArchive.sha256}`;
  for (const kernel of kernelLibrary) {
    const card = document.createElement('article');
    card.className = 'kernel-reference-card';
    card.append(
      text('div', 'eyebrow', kernel.family),
      text('h2', '', kernel.name),
      text('p', '', kernel.summary)
    );
    const evidence = document.createElement('details');
    evidence.className = 'kernel-reference-details';
    evidence.append(
      text('summary', '', 'Integration & source evidence'),
      text('p', '', kernel.use),
      text('small', 'kernel-reference-status', kernel.status),
      text('code', 'kernel-reference-source', `${kernel.sourcePath} · SHA-256 ${kernel.sourceSha256}`),
      text('small', 'kernel-reference-status', `Archive: ${(kernel.archive || sourceArchive).name} · SHA-256 ${(kernel.archive || sourceArchive).sha256}`)
    );
    card.append(evidence);
    const draft = text('button', 'button secondary', 'DRAFT REVIEW WORKFLOW');
    draft.type = 'button';
    draft.addEventListener('click', () => draftKernelWorkflow(kernel));
    card.append(draft);
    root.append(card);
  }
}

async function draftKernelWorkflow(kernel) {
  await selectView('workflows');
  resetWorkflowForm();
  document.querySelector('#workflow-name').value = kernel.workflow.name;
  document.querySelector('#workflow-description').value =
    `Reference: ${kernel.sourcePath} · archive SHA-256 ${(kernel.archive || sourceArchive).sha256}. Confirm the source before use.`;
  document.querySelector('#workflow-steps').value = kernel.workflow.steps.join('\n');
  document.querySelector('#workflow-status').textContent =
    'Review and edit this data-only draft before saving. It does not execute or change system settings.';
  document.querySelector('#workflow-name').focus();
}

async function loadAuditorProposals() {
  if (auditorLoadInFlight) return;
  if (!inDesktopApp) {
    syncProposalNotifications(document, []);
    document.querySelector('#auditor-status').textContent = 'Saved device proposals appear in the desktop app. Release Notes and Toolbox source updates are available in this preview.';
    return;
  }
  auditorLoadInFlight = true;
  const status = document.querySelector('#auditor-status');
  try {
    const proposals = await invoke('list_auditor_proposals');
    savedAgentProposals = proposals;
    renderAuditorProposals(proposalHistory(proposals, document.querySelector('#proposal-history-filter').value));
    syncProposalNotifications(document, proposals);
    status.textContent = `${proposals.length} saved proposals · ${proposalSummary(proposals).label} · newest first · no execution`;
  } catch (error) {
    syncProposalNotifications(document, savedAgentProposals, true);
    status.textContent = typeof error === 'string' ? error : 'Unable to load saved agent proposals.';
  } finally {
    auditorLoadInFlight = false;
  }
}

async function reviewAuditorProposal(proposal, nextStatus, button) {
  button.disabled = true;
  try {
    await invoke('review_auditor_proposal', { proposalId: proposal.id, status: nextStatus });
    await loadAuditorProposals();
  } catch (error) {
    button.disabled = false;
    document.querySelector('#auditor-status').textContent =
      typeof error === 'string' ? error : 'Unable to update this auditor proposal.';
  }
}

function selectedModModel() {
  return modModels.find((model) => model.id === document.querySelector('#mod-model-select').value);
}

function updateModControls() {
  const model = selectedModModel();
  document.querySelector('#mod-package-select').disabled = modBusy;
  document.querySelector('#mod-model-load').disabled =
    !modCatalogOnline || !model || (!model.installed && !model.wslSelectable) || modBusy;
  document.querySelector('#mod-model-unload').disabled = !modCatalogOnline || modBusy;
  document.querySelector('#mod-model-download').hidden = !modCatalogOnline || !model || model.installed;
  document.querySelector('#mod-model-download').disabled = !modCatalogOnline || !model || modBusy;
  document.querySelector('#mod-model-cancel').hidden = !modDownloadPolling;
  document.querySelector('#mod-model-cancel').disabled = !modDownloadPolling;
  document.querySelector('#mod-package-analyze').disabled =
    !modSelectedPackage || !modModelReady || !model || model.id !== modLoadedModelId || modBusy;
}

function renderModCatalog() {
  const select = document.querySelector('#mod-model-select');
  const previous = select.value;
  select.replaceChildren();
  for (const model of modModels) {
    const option = document.createElement('option');
    option.value = model.id;
    const size = `${(model.downloadBytes / 1024 ** 3).toFixed(2)} GiB`;
    option.textContent = `${model.name} · ${size} · ${model.installed === null ? 'availability unknown' : model.bundled ? 'bundled offline' : model.installed ? 'installed on Windows' : model.wslSelectable ? 'try opted-in WSL2 host' : 'not installed'}`;
    select.append(option);
  }
  if (modModels.some(model => model.id === previous)) select.value = previous;
  const list = document.querySelector('#included-model-catalog');
  list.replaceChildren();
  for (const model of modModels) {
    const card = text('div', 'included-model-card', '');
    card.append(text('strong', '', model.name), text('p', '', model.description),
      text('small', '', `${model.license} · ${(model.downloadBytes / 1024 ** 3).toFixed(2)} GiB · pinned revision ${model.revision.slice(0, 12)}`));
    list.append(card);
  }
}

async function loadModCatalog() {
  if (modCatalogBusy) return;
  modCatalogBusy = true;
  modCatalogOnline = false;
  const status = document.querySelector('#mod-model-status');
  renderModCatalog();
  updateModControls();
  try {
    const [result, statusResult] = await inspectModelAvailability(invoke);
    if (!Array.isArray(result.models)) throw new Error('The model catalog response is invalid.');
    modModels = includedModelCatalog().map(model => {
      const live = result.models.find(item => item.id === model.id);
      if (!live || typeof live.installed !== 'boolean') throw new Error('Approved model availability is incomplete.');
      return { ...model, installed: live.installed, bundled: Boolean(live.bundled), wslSelectable: live.wslSelectable === true };
    });
    modCatalogOnline = true;
    renderModCatalog();
    const select = document.querySelector('#mod-model-select');
    const assistant = statusResult.status;
    modModelReady = Boolean(assistant?.modelReady);
    modLoadedModelId = modModelReady ? assistant.modelId || '' : '';
    if (assistant?.state === 'model-loading') {
      modStatusPolling = true;
      status.textContent = `Loading ${assistant.modelName || 'local model'}…`;
      window.setTimeout(refreshModModelStatus, 1200);
    } else {
      modStatusPolling = false;
    }
    if (assistant?.modelName && modModelReady) {
      status.textContent = `Loaded locally (${assistant.runtime?.backend === 'wsl2' ? 'WSL2' : 'Windows'}): ${assistant.modelName}. Package analysis runs on this device.`;
      if (assistant.modelId && modModels.some((model) => model.id === assistant.modelId)) {
        select.value = assistant.modelId;
      }
    } else if (!modModels.length) {
      status.textContent = 'No approved local models are available.';
    } else if (assistant?.state !== 'model-loading') {
      status.textContent = assistant?.state === 'model-error' ? assistant.message
        : 'Load an installed Windows model or try your opted-in WSL2 host. Missing Linux prerequisites are reported before Windows fallback.';
    }
    updateModControls();
  } catch (error) {
    modModelReady = false;
    modLoadedModelId = '';
    modModels = includedModelCatalog();
    renderModCatalog();
    status.textContent = `Runtime/installation status is unavailable: ${typeof error === 'string' ? error : error.message}. Retry status; if the bundled runtime is missing, install the self-contained Toolbox build. A catalog entry alone does not mean model files are installed.`;
    updateModControls();
  } finally { modCatalogBusy = false; }
}

async function refreshModModelStatus() {
  if (!modDownloadPolling && !modStatusPolling) return;
  try {
    const result = await invoke('get_assistant_status');
    const assistant = result.status;
    const status = document.querySelector('#mod-model-status');
    if (assistant?.state === 'download-progress' || assistant?.state === 'download-started') {
      const percent = Number.isFinite(assistant.percent) ? assistant.percent : 0;
      document.querySelector('#mod-download-progress').value = percent;
      status.textContent = assistant.message || `Downloading local model · ${percent.toFixed(1)}%`;
      window.setTimeout(refreshModModelStatus, 1200);
      return;
    }
    if (assistant?.state === 'model-loading') {
      modStatusPolling = true;
      status.textContent = `Loading ${assistant.modelName || 'local model'}…`;
      window.setTimeout(refreshModModelStatus, 1200);
      return;
    }
    modDownloadPolling = false;
    modStatusPolling = false;
    modModelReady = Boolean(assistant?.modelReady);
    modLoadedModelId = modModelReady ? assistant.modelId || '' : '';
    document.querySelector('#mod-download-progress').value =
      assistant?.state === 'download-complete' ? 100 : 0;
    if (assistant?.state === 'download-complete') {
      status.textContent = `${assistant.message || 'Model download complete.'} Select the model and load it before analysis.`;
      await loadModCatalog();
    } else if (assistant?.modelReady && assistant.modelName) {
      status.textContent = `Loaded locally: ${assistant.modelName}. Package analysis runs on this device.`;
      updateModControls();
    } else if (assistant?.state === 'model-error' || assistant?.state === 'download-error') {
      status.textContent = assistant.message || 'The local model operation failed.';
      updateModControls();
    } else {
      status.textContent = assistant?.message || 'Model download stopped. Review the status and retry if needed.';
      updateModControls();
    }
  } catch (error) {
    modDownloadPolling = false;
    modStatusPolling = false;
    document.querySelector('#mod-model-status').textContent =
      typeof error === 'string' ? error : error.message || 'Model download status could not be read.';
    updateModControls();
  }
}

async function loadModModel() {
  const model = selectedModModel();
  if (!model || (!model.installed && !model.wslSelectable) || modBusy) return;
  modBusy = true;
  updateModControls();
  const status = document.querySelector('#mod-model-status');
  status.textContent = `Loading ${model.name} into the local analysis worker…`;
  try {
    const result = await invoke('load_assistant_model', { modelId: model.id });
    if (!result.ok) throw new Error(result.message || 'The approved model could not be loaded.');
    status.textContent = result.message || `${model.name} is ready for local analysis.`;
    await loadModCatalog();
  } catch (error) {
    status.textContent = typeof error === 'string' ? error : error.message || 'Unable to load the local model.';
  } finally {
    modBusy = false;
    updateModControls();
  }
}

async function downloadModModel() {
  const model = selectedModModel();
  if (!model || model.installed || modBusy) return;
  modBusy = true;
  updateModControls();
  const status = document.querySelector('#mod-model-status');
  status.textContent = `Starting the optional local download for ${model.name}…`;
  try {
    await invoke('download_assistant_model', { modelId: model.id });
    modDownloadPolling = true;
    status.textContent = 'Local model download started.';
    updateModControls();
    void refreshModModelStatus();
  } catch (error) {
    status.textContent = typeof error === 'string' ? error : 'Unable to start the local model download.';
  } finally {
    modBusy = false;
    updateModControls();
  }
}

async function cancelModModelDownload() {
  try {
    await invoke('cancel_assistant_model_download');
    document.querySelector('#mod-model-status').textContent = 'Cancellation requested for the local model download.';
  } catch (error) {
    document.querySelector('#mod-model-status').textContent =
      typeof error === 'string' ? error : 'Unable to cancel the local model download.';
  }
}

function renderModStaticReport(info) {
  const root = document.querySelector('#mod-report');
  root.replaceChildren();
  const report = info.report;
  if (!report) { root.hidden = true; return; }
  root.hidden = false;
  const m = report.metadata;
  const card = document.createElement('div');
  card.className = `mod-verdict mod-verdict-${report.verdict.level}`;
  card.append(text('strong', '', m.name || info.name), text('span', '', report.verdict.summary));
  root.append(card);
  const facts = info.kind === 'html' ? [['Type', m.loader], ['Encoding', 'UTF-8'], ['Execution', 'None']] : [
    ['Type', m.loader], ['Id', m.id || 'unknown'], ['Version', m.version || 'unknown'],
    ['Minecraft', m.minecraft || 'unknown'], ['Authors', m.authors.join(', ') || 'unknown'],
    ['License', m.license || 'unknown']
  ];
  const grid = document.createElement('dl');
  grid.className = 'mod-facts';
  for (const [label, value] of facts) grid.append(text('dt', '', label), text('dd', '', value));
  root.append(grid);
  if (m.description) root.append(text('p', 'mod-caution', m.description));
  if (m.dependencies.length) root.append(text('strong', '', `Dependencies (${m.dependencies.length})`), text('code', '', m.dependencies.join(' · ')));
  if (report.inventory.length) {
    root.append(text('strong', '', 'Contents'));
    const chips = document.createElement('div');
    chips.className = 'mod-chips';
    for (const item of report.inventory) chips.append(text('span', 'mod-chip', `${item.category} · ${item.count}`));
    root.append(chips);
  }
  const flagTotal = report.signals.length + report.notes.length;
  root.append(text('strong', '', flagTotal ? `Flags (${flagTotal})` : 'Flags (none)'));
  for (const signal of report.signals) {
    root.append(text('span', `mod-flag mod-flag-${signal.level}`, `${signal.level.toUpperCase()} · ${signal.label}`));
    for (const hit of signal.hits) root.append(text('code', '', `${hit.path}:${hit.line}  ${hit.excerpt}`));
  }
  for (const note of report.notes) root.append(text('span', `mod-flag mod-flag-${note.level}`, `${note.level.toUpperCase()} · ${note.text}`));
  const copy = document.createElement('button');
  copy.className = 'button secondary';
  copy.type = 'button';
  copy.textContent = 'COPY REPORT (MARKDOWN)';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(info.reportMarkdown || '');
      copy.textContent = 'COPIED';
    } catch { copy.textContent = 'COPY BLOCKED'; }
    window.setTimeout(() => { copy.textContent = 'COPY REPORT (MARKDOWN)'; }, 1800);
  });
  const build = document.createElement('button');
  build.className = 'button primary';
  build.type = 'button';
  build.textContent = 'PREPARE DISTRICT FOR WORLD';
  build.title = 'Prepare district data, then choose Add reviewed package district in the Voxel World dock. Imported code never runs.';
  build.addEventListener('click', () => {
    const district = buildDistrict({ ...report, sourceCount: (info.sourcePaths || []).length }, info.name);
    sessionStorage.setItem('capsule-district-pending', JSON.stringify(district));
    selectView('world');
    window.dispatchEvent(new CustomEvent('capsule:district'));
  });
  if (info.kind !== 'html') root.append(build);
  root.append(copy, text('small', 'mod-caution', 'Flags are pattern matches on readable text, not proof. Imported code is never executed.'));
}

function renderModPackageEvidence(info) {
  renderModStaticReport(info);
  const root = document.querySelector('#mod-package-evidence');
  root.replaceChildren();
  root.append(
    text('strong', '', `${info.name} · ${info.kind === 'html' ? 'HTML source only' : `${info.entryCount} archive entries`}`),
    text('code', '', `File SHA-256 · ${info.packageSha256}`)
  );
  const appendPaths = (heading, paths) => {
    root.append(text('strong', '', `${heading} (${paths.length})`));
    for (const item of paths) root.append(text('code', '', item));
  };
  appendPaths('Readable docs and metadata', info.documentPaths || []);
  appendPaths('Bounded UTF-8 source files (inert)', info.sourcePaths || []);
  if (info.sourceEvidence?.length) {
    root.append(text('strong', '', 'Source fingerprints and line counts'));
    for (const evidence of info.sourceEvidence) {
      root.append(text('code', '', `${evidence.path} · SHA-256 ${evidence.sha256} · ${evidence.lineCount} lines`));
    }
  }
  if (info.executablePaths?.length) {
    appendPaths(`Compiled/binary entries skipped${info.executablePaths.length === 20 ? '+' : ''}`, info.executablePaths);
  }
  if (info.skippedDocuments || info.skippedSources) {
    root.append(text('span', '', `${info.skippedDocuments || 0} documents and ${info.skippedSources || 0} source files skipped by safety/size limits.`));
  }
  if (info.analysisTruncated) root.append(text('span', 'mod-caution', 'Review text was capped at the inspector’s configured evidence limit.'));
}

async function selectModPackage() {
  const status = document.querySelector('#mod-package-status');
  if (modBusy) {
    status.textContent = 'Wait for the current model operation or review to finish before importing another file.';
    return;
  }
  modBusy = true;
  updateModControls();
  try {
    const filePath = await open({
      multiple: false,
      filters: [{ name: 'Mod packages', extensions: ['zip', 'jar', 'mcpack', 'mrpack'] }]
    });
    if (!filePath) {
      status.textContent = 'File selection cancelled. Previous evidence, if any, is unchanged.';
      return;
    }
    status.textContent = 'Inspecting bounded source content without executing or loading assets.';
    const result = await invoke('inspect_mod_package', { filePath });
    if (!result.ok) throw new Error(result.message || 'Source inspection failed.');
    modSelectedPackage = result;
    modAnalysisJobId = '';
    modAnalysisResults = [];
    document.querySelector('#mod-analysis-panel').hidden = true;
    document.querySelector('#mod-kernel-panel').hidden = true;
    renderModPackageEvidence(result);
    status.textContent = result.kind === 'html'
      ? 'HTML loaded as inert source. Review the structure summary; load an installed local model and run review passes for agent deconstruction. No model is trained.'
      : 'Package inspected. Readable content is inert evidence only; no package code was run.';
    updateModControls();
  } catch (error) {
    status.textContent = typeof error === 'string' ? error : error.message || 'Unable to inspect that file.';
  } finally {
    modBusy = false;
    updateModControls();
  }
}

function renderModAnalysis(results) {
  const root = document.querySelector('#mod-analysis-results');
  root.replaceChildren();
  for (const result of results) {
    const card = document.createElement('article');
    card.className = 'mod-analysis-card';
    const heading = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.resultId = result.id;
    heading.append(checkbox, text('strong', '', result.name));
    card.append(heading, text('pre', '', result.text));
    const form = document.createElement('form');
    form.className = 'lesson-approval-form';
    const label = text('label', '', 'Lesson to remember (review and edit, 600 characters maximum)');
    const input = document.createElement('textarea');
    input.rows = 3;
    input.maxLength = 600;
    input.required = true;
    input.value = result.text.slice(0, 600);
    label.append(input);
    const categoryLabel = text('label', '', 'Learning category');
    const category = document.createElement('select');
    for (const id of LESSON_CATEGORIES) {
      const option = text('option', '', id);
      option.value = id;
      category.append(option);
    }
    categoryLabel.append(category);
    const approve = text('button', 'button secondary', 'APPROVE & REMEMBER LESSON');
    approve.type = 'submit';
    const status = text('div', 'inline-status', 'Requires a valid source citation in this finding. Approval is reference memory, not execution permission.');
    status.setAttribute('role', 'status');
    form.append(label, categoryLabel, approve, status);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const lessonText = input.value.trim();
      if (!lessonText) { status.textContent = 'Write a lesson before approving.'; return; }
      if (!window.confirm(`Remember this lesson for future source reviews and the visual engine profile?\n\n${lessonText}`)) return;
      approve.disabled = true;
      try {
        const response = await invoke('approve_source_lesson', {
          findingId: result.id, sourceSha256: modSelectedPackage.packageSha256,
          text: lessonText, category: category.value, confirmed: true
        });
        if (!response.ok) throw new Error(response.message || 'Lesson approval failed.');
        await updateApprovedLearning(response.lessons);
        status.textContent = 'Lesson approved and saved on this device. Future reviews can reference it.';
      } catch (error) {
        status.textContent = typeof error === 'string' ? error : error.message;
      } finally { approve.disabled = false; }
    });
    card.append(form);
    root.append(card);
  }
}

async function updateApprovedLearning(lessons) {
  approvedLessons = lessons;
  const root = document.querySelector('#approved-learning-list');
  root.replaceChildren();
  const profile = learningProfile(lessons);
  document.querySelector('#approved-learning-status').textContent =
    `${profile.label} · ${lessons.length}/40 saved. Only the latest eight enter new source-review context.`;
  for (const lesson of lessons) {
    const card = document.createElement('article');
    card.className = 'approved-lesson';
    card.append(text('strong', '', lesson.category), text('p', '', lesson.text),
      text('code', '', `${lesson.sourceName} · SHA-256 ${lesson.sourceSha256}`),
      text('small', '', `Approved ${new Date(lesson.approvedAt).toLocaleString()} · ${lesson.reviewer}`));
    for (const citation of lesson.citations) card.append(text('code', '', `${citation.path}:L${citation.lineStart}-L${citation.lineEnd}`));
    const forget = text('button', 'button quiet', 'FORGET');
    forget.type = 'button';
    forget.addEventListener('click', async () => {
      if (!window.confirm('Forget this approved lesson? Existing review outputs and saved drafts will remain.')) return;
      forget.disabled = true;
      try {
        const response = await invoke('forget_source_lesson', { lessonId: lesson.id });
        if (!response.ok) throw new Error(response.message || 'Unable to forget the lesson.');
        await updateApprovedLearning(response.lessons);
      } catch (error) {
        document.querySelector('#approved-learning-status').textContent = typeof error === 'string' ? error : error.message;
      } finally { forget.disabled = false; }
    });
    card.append(forget);
    root.append(card);
  }
  if (!lessons.length) root.append(text('p', 'mod-caution', 'No lessons have been approved. Importing or running a review does not automatically remember anything.'));
  for (const graph of await loadGraphs()) graph.setLearningProfile(profile);
  renderLearning();
}

async function loadApprovedLearning() {
  try {
    const response = await invoke('list_approved_learning');
    if (!response.ok) throw new Error(response.message || 'Unable to load approved lessons.');
    await updateApprovedLearning(response.lessons);
  } catch (error) {
    document.querySelector('#approved-learning-status').textContent =
      typeof error === 'string' ? error : error.message;
  }
}

async function runModAnalysis() {
  if (!modSelectedPackage || modBusy) return;
  modBusy = true;
  updateModControls();
  const status = document.querySelector('#mod-package-status');
  status.textContent = 'Starting four local review passes…';
  document.querySelector('#mod-analysis-panel').hidden = false;
  document.querySelector('#mod-kernel-panel').hidden = true;
  try {
    const started = await invoke('start_mod_analysis');
    if (!started.jobId) throw new Error('The local review did not return a job identifier.');
    modAnalysisJobId = started.jobId;
    while (modAnalysisJobId) {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      const response = await invoke('get_mod_analysis_status', { jobId: modAnalysisJobId });
      const job = response.job;
      if (!job) throw new Error('The local analysis job is no longer available.');
      status.textContent = job.state === 'running'
        ? `Local review in progress · ${job.role || 'Starting'}`
        : job.state === 'complete'
          ? job.cachedAt
            ? `Cached review from ${new Date(job.cachedAt).toLocaleString()} for ${job.packageName}. Same file, model and approved context; verify the cited paths.`
            : `Four local review passes finished for ${job.packageName}. Verify the cited paths.`
          : `Local review failed · ${job.error || 'Unknown analysis error.'}`;
      if (job.state === 'complete') {
        modAnalysisResults = job.results || [];
        renderModAnalysis(modAnalysisResults);
        document.querySelector('#mod-kernel-panel').hidden = false;
        await loadModKernelProposals();
        break;
      }
      if (job.state !== 'running') break;
    }
  } catch (error) {
    status.textContent = typeof error === 'string' ? error : 'Local package analysis failed.';
  } finally {
    modBusy = false;
    updateModControls();
  }
}

function selectedModFindingIds() {
  return [...document.querySelectorAll('#mod-analysis-results input:checked')]
    .map((input) => input.dataset.resultId);
}

function splitModGuideLine(line) {
  const chunks = [];
  let chunk = '';
  for (const word of line.split(/\s+/).filter(Boolean)) {
    if (word.length > 240) throw new Error('A finding has a word over 240 characters. Edit the workflow manually.');
    const next = chunk ? `${chunk} ${word}` : word;
    if (next.length > 240) {
      chunks.push(chunk);
      chunk = word;
    } else chunk = next;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

async function draftModWorkflow() {
  const selected = new Set(selectedModFindingIds());
  const lines = modAnalysisResults
    .filter((result) => selected.has(result.id))
    .flatMap((result) => result.text.split(/\r?\n/))
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line));
  try {
    const steps = lines.flatMap(splitModGuideLine);
    if (!steps.length) throw new Error('Select at least one finding to draft a workflow.');
    if (steps.length > 20) throw new Error('Selected findings exceed 20 workflow steps. Select fewer findings.');
    await selectView('workflows');
    resetWorkflowForm();
    document.querySelector('#workflow-name').value =
      `${modSelectedPackage.name.replace(/\.[^.]+$/, '')} Guide`.slice(0, 80);
    document.querySelector('#workflow-description').value =
      `User-reviewed data-only guide from local analysis of ${modSelectedPackage.name}. Verify source evidence before use.`;
    document.querySelector('#workflow-steps').value = steps.join('\n');
    document.querySelector('#workflow-status').textContent =
      'Draft from selected model findings. Review and edit every step; it will not execute.';
    document.querySelector('#workflow-name').focus();
  } catch (error) {
    document.querySelector('#mod-auditor-status').textContent = error.message;
  }
}

async function saveModAuditorProposal() {
  const findingIds = selectedModFindingIds();
  const status = document.querySelector('#mod-auditor-status');
  if (!findingIds.length || findingIds.length > 4) {
    status.textContent = 'Select one to four review passes.';
    return;
  }
  try {
    await invoke('save_mod_auditor_proposal', { findingIds });
    status.textContent = 'Source-linked findings saved to Agent Proposals. They remain unverified and inert.';
    await loadAuditorProposals();
  } catch (error) {
    status.textContent = typeof error === 'string' ? error : 'Unable to save findings to Agent Proposals.';
  }
}

function renderModKernelProposals(proposals) {
  const parent = document.querySelector('#mod-kernel-parent');
  parent.replaceChildren(text('option', '', 'Start a new v1 proposal'));
  parent.firstElementChild.value = '';
  for (const proposal of proposals) {
    const option = document.createElement('option');
    option.value = proposal.id;
    option.textContent = `${proposal.name} · v${proposal.versionNumber}`;
    parent.append(option);
  }
  const root = document.querySelector('#mod-kernel-library');
  root.replaceChildren();
  for (const proposal of [...proposals].reverse()) {
    const card = document.createElement('article');
    card.className = 'mod-kernel-card';
    card.append(
      text('strong', '', `${proposal.name} · v${proposal.versionNumber} · PROPOSED`),
      text('small', '', `Lineage ${proposal.lineageId} · ${proposal.parentId ? `Parent ${proposal.parentId.slice(0, 8)}` : 'Root proposal'} · ${proposal.sourcePackage || 'No package source'}`),
      text('pre', '', proposal.content)
    );
    root.append(card);
  }
  if (!proposals.length) root.append(text('div', 'empty-card', 'No kernel proposals have been drafted.'));
}

async function loadModKernelProposals() {
  try {
    const result = await invoke('list_mod_kernel_proposals');
    renderModKernelProposals(result.proposals || []);
  } catch (error) {
    document.querySelector('#mod-kernel-status').textContent =
      typeof error === 'string' ? error : 'Unable to load versioned kernel proposals.';
  }
}

async function createModKernelProposal() {
  const button = document.querySelector('#mod-kernel-create');
  const status = document.querySelector('#mod-kernel-status');
  const name = document.querySelector('#mod-kernel-name').value.trim();
  if (!name || name.length > 100) {
    status.textContent = 'Give the proposal a name of up to 100 characters.';
    return;
  }
  button.disabled = true;
  status.textContent = 'A local agent is drafting an inert proposal from reviewed package evidence…';
  try {
    const result = await invoke('create_mod_kernel_proposal', {
      name,
      parentId: document.querySelector('#mod-kernel-parent').value || null
    });
    status.textContent =
      `Saved ${result.proposal.name} · v${result.proposal.versionNumber} as proposal only. The active kernel was not changed.`;
    await loadModKernelProposals();
  } catch (error) {
    status.textContent = typeof error === 'string' ? error : 'Unable to create the kernel proposal.';
  } finally {
    button.disabled = false;
  }
}

function renderSnapshot(snapshot) {
  const firstConnection = !browserSnapshot;
  browserSnapshot = snapshot;
  if (firstConnection) {
    void loadApprovedLearning();
    void refreshReviewCache();
  }
  document.querySelector('#graph-connection-error').hidden = true;
  const tasks = snapshot.tasks || [];
  const agents = snapshot.agents || [];
  const receipts = snapshot.receipts || [];

  renderCockpitMetrics();
  document.querySelector('#receipt-pill').textContent = String(receipts.length).padStart(2, '0');
  document.querySelector('#graph-summary').textContent =
    `${tasks.length} starter routes · ${userWorkflows.length} saved workflows · ${agents.length} agents · ${receipts.length} receipts`;
  document.querySelector('#graph-updated').textContent = `UPDATED ${new Date().toLocaleTimeString()}`;
  renderAgentGraphs(agents, [...tasks, ...userWorkflows], receipts, snapshot.busy);
  renderAgentDirectory(agents, receipts);
  renderReceipts(receipts);
  renderTaskList(tasks);
  setConnectionStatus(true, 'BROWSER LINK · LIVE');
}

async function refreshBrowserSnapshot() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const snapshot = await invoke('get_browser_snapshot');
    renderSnapshot(snapshot);
  } catch (error) {
    setConnectionStatus(false, 'BROWSER LINK · OFFLINE');
    document.querySelector('#graph-summary').textContent = 'Browser connection unavailable.';
    document.querySelector('#graph-updated').textContent = '';
    document.querySelector('#graph-connection-error').hidden = false;
    document.querySelector('#graph-connection-message').textContent =
      typeof error === 'string' ? error : error?.message || 'Start Capsule OS Browser to connect the SI Core engine.';
    if (browserSnapshot) {
      browserSnapshot = null;
      renderAgentGraphs([], userWorkflows, [], false);
      renderAgentDirectory([], []);
      renderReceipts([]);
      renderTaskList([]);
    }
    renderCockpitMetrics();
    document.querySelector('#receipt-pill').textContent = 'OFFLINE';
  } finally {
    refreshInFlight = false;
  }
}

async function routeTask(taskId, button) {
  if (!Number.isSafeInteger(taskId)) return;
  button.disabled = true;
  document.querySelector('#route-status').textContent = 'Sending one catalog task to the connected Capsule OS Browser…';
  try {
    const result = await invoke('route_browser_task', { taskId });
    document.querySelector('#route-status').textContent = result.message || 'The SI Core kernel received the task.';
    await refreshBrowserSnapshot();
  } catch (error) {
    document.querySelector('#route-status').textContent =
      typeof error === 'string' ? error : 'The browser bridge rejected the request.';
  } finally {
    button.disabled = false;
  }
}

function settingName(setting) {
  return setting === 'transparency'
    ? 'Transparency effects'
    : setting === 'windowAnimations'
      ? 'Window minimize and restore animation'
      : 'Dark theme';
}

function setSwitch(button, value, label) {
  button.setAttribute('aria-checked', String(value === true));
  button.setAttribute('aria-label', label);
  button.disabled = appearanceBusy || appearanceBatchBusy;
}

function renderAppearanceReceipts(themeReceipt, visualReceipts) {
  const root = document.querySelector('#windows-receipt');
  root.replaceChildren();
  const records = visualReceipts.map((receipt) => ({
    ...receipt,
    timestamp: receipt.changedAt,
    rolledBack: receipt.rolledBackAt !== null
  }));
  if (themeReceipt) {
    records.push({
      id: themeReceipt.id,
      setting: 'theme',
      after: themeReceipt.choice === 'dark',
      source: 'user-switch',
      timestamp: themeReceipt.changedAt,
      rolledBack: themeReceipt.rolledBack
    });
  }
  records.sort((left, right) => right.timestamp - left.timestamp);
  if (!records.length) {
    root.append(text('div', 'empty-card', 'No appearance changes recorded.'));
    return;
  }

  const newestActive = new Set();
  const activeReceiptIds = new Set();
  for (const record of records) {
    if (!record.rolledBack && !newestActive.has(record.setting)) {
      newestActive.add(record.setting);
      activeReceiptIds.add(record.id);
    }
  }
  for (const receipt of records.slice(0, 8)) {
    const row = document.createElement('article');
    row.className = 'windows-receipt-row';
    const description = receipt.setting === 'theme'
      ? `${receipt.after ? 'DARK' : 'LIGHT'} · app and system`
      : `${receipt.after ? 'ON' : 'OFF'} · ${receipt.source === 'agent-suggestion' ? 'SI CORE SUGGESTION' : 'USER SWITCH'}`;
    const copy = document.createElement('div');
    copy.className = 'windows-receipt-copy';
    copy.append(
      text('strong', '', `${settingName(receipt.setting).toUpperCase()} · ${description}`),
      text('small', '', `${receipt.id} · ${new Date(receipt.timestamp * 1000).toLocaleString()}${receipt.reason ? ` · ${receipt.reason}` : ''}`)
    );
    row.append(copy);
    if (activeReceiptIds.has(receipt.id)) {
      const rollback = text('button', 'button quiet', 'ROLL BACK');
      rollback.type = 'button';
      rollback.addEventListener('click', () => receipt.setting === 'theme'
        ? rollbackTheme()
        : rollbackVisualTweak(receipt.setting));
      row.append(rollback);
    } else if (receipt.rolledBack) {
      row.append(text('small', 'workflow-card-meta', 'RESTORED'));
    }
    root.append(row);
  }
}

async function inspectAppearance() {
  try {
    const [theme, themeReceipt, visual, visualReceipts] = await Promise.all([
      invoke('inspect_theme'),
      invoke('get_last_theme_receipt'),
      invoke('inspect_visual_tweaks'),
      invoke('get_visual_tweak_receipts')
    ]);
    appearanceSnapshot = visual;
    const isDark = theme.apps_use_light_theme === 0 && theme.system_uses_light_theme === 0;
    const isLight = theme.apps_use_light_theme === 1 && theme.system_uses_light_theme === 1;
    document.querySelector('#theme-current').textContent = isDark
      ? 'APP AND SYSTEM THEME · DARK'
      : isLight
        ? 'APP AND SYSTEM THEME · LIGHT'
        : 'APP AND SYSTEM THEME · MIXED OR WINDOWS DEFAULT';
    setSwitch(document.querySelector('#theme-switch'), isDark, 'Use the Windows dark theme');
    for (const [setting, value, controlId, stateId, label] of [
      ['transparency', visual.transparency, '#transparency-switch', '#transparency-current', 'Enable Windows transparency effects'],
      ['windowAnimations', visual.windowAnimations, '#window-animations-switch', '#window-animations-current', 'Enable window minimize and restore animation']
    ]) {
      const control = document.querySelector(controlId);
      const state = document.querySelector(stateId);
      state.textContent = value === null
        ? 'NOT SET · WINDOWS DEFAULT'
        : value
          ? 'ON · CURRENT-USER PREFERENCE'
          : 'OFF · CURRENT-USER PREFERENCE';
      setSwitch(control, value, label);
      control.dataset.setting = setting;
    }
    renderAppearanceReceipts(themeReceipt, visualReceipts);
    pendingAppearance.clear();
    for (const id of ['#theme-switch', '#transparency-switch', '#window-animations-switch']) {
      const control = document.querySelector(id);
      control.dataset.current = control.getAttribute('aria-checked');
    }
    updateAppearanceActions();
    document.querySelector('#theme-status').textContent =
      'Current-user settings inspected. Stage switches, then use Apply settings; recent changes can be rolled back.';
  } catch (error) {
    appearanceSnapshot = null;
    pendingAppearance.clear();
    updateAppearanceActions();
    for (const id of ['#theme-switch', '#transparency-switch', '#window-animations-switch']) {
      document.querySelector(id).disabled = true;
    }
    document.querySelector('#theme-current').textContent = 'UNAVAILABLE';
    document.querySelector('#transparency-current').textContent = 'UNAVAILABLE';
    document.querySelector('#window-animations-current').textContent = 'UNAVAILABLE';
    document.querySelector('#theme-status').textContent =
      typeof error === 'string' && !/ACL|not allowed/i.test(error)
        ? error
        : 'Windows settings are only available in the Capsule desktop app, not this preview.';
  }
}

async function rollbackTheme() {
  try {
    const receipt = await invoke('rollback_last_theme_change');
    document.querySelector('#theme-status').textContent =
      `Restored previous settings from receipt ${receipt.id}.`;
    await inspectAppearance();
  } catch (error) {
    document.querySelector('#theme-status').textContent = typeof error === 'string' ? error : 'The theme rollback was rejected.';
  }
}

async function rollbackVisualTweak(setting) {
  try {
    const receipt = await invoke('rollback_visual_tweak', { setting });
    document.querySelector('#theme-status').textContent =
      `Restored ${settingName(setting)} from receipt ${receipt.id}.`;
    await inspectAppearance();
  } catch (error) {
    document.querySelector('#theme-status').textContent =
      typeof error === 'string' ? error : 'The appearance rollback was rejected.';
  }
}

async function askAppearanceSuggestion() {
  const goal = document.querySelector('#appearance-goal').value.trim();
  const status = document.querySelector('#appearance-agent-status');
  const button = document.querySelector('#appearance-suggest');
  const root = document.querySelector('#appearance-suggestions');
  root.replaceChildren();
  if (!goal || goal.length > 240) {
    status.textContent = 'Describe a preference in 1–240 characters.';
    return;
  }
  button.disabled = true;
  status.textContent = 'SI Core is reviewing only the two supported appearance preferences…';
  try {
    const settings = await invoke('inspect_visual_tweaks');
    const result = await invoke('propose_appearance_tweaks', { goal, settings });
    if (!result.ok) throw new Error(result.message || 'The local model did not return a usable suggestion.');
    if (!result.recommendations.length) {
      status.textContent = 'No change was recommended for the current settings and stated preference.';
      return;
    }
    status.textContent = `Local model suggestion · ${result.modelId || 'approved model'} · review each change before applying.`;
    for (const recommendation of result.recommendations) {
      const card = document.createElement('article');
      card.className = 'appearance-suggestion';
      const copy = document.createElement('div');
      copy.className = 'appearance-suggestion-copy';
      copy.append(
        text('strong', '', `${settingName(recommendation.setting)} · ${recommendation.value ? 'ON' : 'OFF'}`),
        text('small', '', recommendation.reason)
      );
      const apply = text('button', 'button primary', 'APPLY THIS');
      apply.type = 'button';
      apply.addEventListener('click', async () => {
        apply.disabled = true;
        try {
          const result = await reviewAndApplyAppearance([{ setting: recommendation.setting, enabled: recommendation.value }]);
          await inspectAppearance();
          status.textContent = result;
        } catch (error) {
          status.textContent = typeof error === 'string' ? error : error.message;
        } finally { apply.disabled = false; }
      });
      card.append(copy, apply);
      root.append(card);
    }
  } catch (error) {
    status.textContent = typeof error === 'string' ? error : error.message || 'Unable to get a local suggestion.';
  } finally {
    button.disabled = false;
  }
}

function filterNavigation() {
  const query = document.querySelector('#nav-search').value.trim().toLocaleLowerCase();
  let matches = 0;
  for (const group of document.querySelectorAll('.nav-group')) {
    let groupMatches = 0;
    for (const item of group.querySelectorAll('.nav-item')) {
      const visible = !query || `${group.querySelector('summary').textContent} ${item.textContent} ${item.dataset.caption || ''}`.toLocaleLowerCase().includes(query);
      item.hidden = !visible;
      if (visible) groupMatches += 1;
    }
    group.hidden = groupMatches === 0;
    if (query && groupMatches) group.open = true;
    matches += groupMatches;
  }
  document.querySelector('#nav-empty').hidden = matches > 0;
}

function setDirectoryOpen(open) {
  const directory = document.querySelector('#page-directory');
  const visible = open || window.matchMedia('(min-width: 1100px)').matches;
  directory.hidden = !visible;
  document.querySelector('#directory-toggle').setAttribute('aria-expanded', String(visible));
  window.dispatchEvent(new CustomEvent('capsule-directory', { detail: visible }));
  if (open) document.querySelector('#nav-search').focus();
}
window.matchMedia('(min-width: 1100px)').addEventListener('change', () => setDirectoryOpen(false));

async function loadPreferences() {
  try {
    const entries = await invoke('get_preferences');
    document.querySelector('#memory-list').value = entries.join('\n');
    document.querySelector('#memory-status').textContent =
      `${entries.length} user-approved preference${entries.length === 1 ? '' : 's'} stored locally.`;
    const receipts = await invoke('get_preference_receipts');
    renderMemoryReceipts(receipts);
  } catch (error) {
    document.querySelector('#memory-status').textContent = typeof error === 'string' ? error : 'Unable to read local preferences.';
  }
}

function renderMemoryReceipts(receipts) {
  const root = document.querySelector('#memory-receipts');
  root.replaceChildren();
  if (!receipts.length) {
    root.append(text('div', 'empty-card', 'No memory change has been recorded.'));
    return;
  }
  for (const receipt of receipts.slice(-12).reverse()) {
    const item = document.createElement('article');
    item.className = 'memory-receipt';
    item.append(
      text('strong', '', `${receipt.action.toUpperCase()} · ${receipt.changedCount} ITEM${receipt.changedCount === 1 ? '' : 'S'}`),
      text('small', '', receipt.reason),
      text('time', '', new Date(receipt.timestamp * 1000).toLocaleString())
    );
    root.append(item);
  }
}

async function savePreferences() {
  const values = document.querySelector('#memory-list').value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  try {
    const reason = document.querySelector('#memory-reason').value.trim();
    const receipt = await invoke('save_preferences', { entries: values, reason });
    document.querySelector('#memory-status').textContent =
      `${values.length} preferences saved on this device. Memory receipt ${receipt.id}; no model weights were modified.`;
    await loadPreferences();
  } catch (error) {
    document.querySelector('#memory-status').textContent = typeof error === 'string' ? error : 'Unable to save local preferences.';
  }
}

async function erasePreferences() {
  if (!window.confirm('Erase all Capsule Toolbox preferences stored in this Windows user account? A content-free memory receipt will remain.')) return;
  try {
    const reason = document.querySelector('#memory-reason').value.trim();
    const receipt = await invoke('erase_preferences', { reason });
    document.querySelector('#memory-list').value = '';
    document.querySelector('#memory-status').textContent = `Local preferences erased. Memory receipt ${receipt.id}.`;
    await loadPreferences();
  } catch (error) {
    document.querySelector('#memory-status').textContent = typeof error === 'string' ? error : 'Unable to erase local preferences.';
  }
}

function selectView(name) {
  const nextView = [...document.querySelectorAll('.workspace > .view')].find(view => view.dataset.view === name);
  if (!nextView) {
    console.error(`Unknown Toolbox page: ${name}`);
    return false;
  }
  if (expandedGraph) setGraphExpanded(expandedGraph, false);
  const search = document.querySelector('#nav-search');
  if (search.value) {
    search.value = '';
    filterNavigation();
  }
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.view === name);
    if (item.dataset.view === name) {
      item.closest('.nav-group').open = true;
      item.setAttribute('aria-current', 'page');
      document.querySelector('#directory-section').textContent = item.closest('.nav-group').querySelector('summary').textContent;
      document.querySelector('#directory-page').textContent = [...item.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim();
    } else item.removeAttribute('aria-current');
  });
  setDirectoryOpen(false);
  document.querySelectorAll('[data-shortcut-view]').forEach((button) => {
    if (button.dataset.shortcutView === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.dataset.view === name);
  });
  const pageName = document.querySelector('#directory-page').textContent;
  nextView.setAttribute('aria-label', pageName);
  document.title = `CapsuleOSv2 · ${pageName}`;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  if (name === 'world') void loadView(nextView, () => import('./world-view.js'), (module, root) => {
    module.mountWorld(root);
    renderLearning();
  });
  if (name === 'bible') void loadView(nextView, () => import('./bible-view.js'), (module, root) => module.mountBible(root));
  if (name === 'scene-studio') void loadView(nextView, () => import('./scene-studio.js'), (module, root) => module.mountSceneStudio(root));
  if (name === 'apps') void loadView(nextView, () => import('./apps-view.js'), (module, root) => module.mountApps(root));
  window.dispatchEvent(new CustomEvent('capsule-view', { detail: name }));
  if (name !== 'bible') recordLearningSignal(`workspace:${name}`, nextView.querySelector('h1')?.textContent.trim().slice(0, 80) || name);
  if (name === 'playbook') void loadView(nextView, () => import('./playbook-view.js'), (module, root) => module.mountPlaybook(root));
  if (name === 'internet') void loadView(nextView, () => import('./internet-view.js'), (module, root) => module.mountInternet(root));
  if (name === 'repair') void loadView(nextView, () => import('./repair-view.js'), (module, root) => module.mountRepair(root));
  if (name === 'windows') {
    inspectAppearance();
    void loadView(document.querySelector('#windows-tweak-groups'), () => import('./playbook-view.js'), (module, root) => module.mountPlaybook(root, { windows: true }));
  }
  if (name === 'memory') loadPreferences();
  if (name === 'settings') {
    void loadModCatalog();
    void refreshReviewCache();
    syncSettingsSound();
  }
  if (name === 'workflows') return loadUserWorkflows();
  if (name === 'auditor') loadAuditorProposals();
  if (name === 'mod-forge') {
    loadModCatalog();
    void loadApprovedLearning();
    void refreshReviewCache();
    loadModKernelProposals();
  }
}

document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  selectView('cockpit');
});
window.addEventListener('capsule-navigate', event => {
  if (typeof event.detail === 'string') selectView(event.detail);
});
document.querySelector('#open-performance-advisor').addEventListener('click', () => selectView('performance'));
document.querySelector('#appearance-open-performance').addEventListener('click', () => selectView('performance'));
document.querySelectorAll('[data-shortcut-view]').forEach((button) => {
  button.addEventListener('click', () => selectView(button.dataset.shortcutView));
});
document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    selectView(button.dataset.view);
    document.querySelector('#directory-toggle').focus();
  });
});
document.querySelector('#directory-toggle').addEventListener('click', () => setDirectoryOpen(document.querySelector('#page-directory').hidden));
document.querySelectorAll('[data-directory-open]').forEach(button => button.addEventListener('click', () => setDirectoryOpen(true)));
document.querySelector('#directory-close').addEventListener('click', () => { setDirectoryOpen(false); document.querySelector('#directory-toggle').focus(); });
document.addEventListener('click', (event) => {
  if (!event.target.closest('#page-directory, #directory-toggle, [data-directory-open]')) setDirectoryOpen(false);
});
document.querySelector('#nav-search').addEventListener('input', filterNavigation);
document.querySelector('#nav-search').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.currentTarget.value = '';
    filterNavigation();
    event.currentTarget.blur();
    setDirectoryOpen(false);
    document.querySelector('#directory-toggle').focus();
  }
});
document.addEventListener('keydown', (event) => {
  const target = event.target;
  const isEditing = target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if (event.key === '/' && !isEditing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    setDirectoryOpen(true);
  }
  if (event.key === 'Escape' && !document.querySelector('#page-directory').hidden) {
    setDirectoryOpen(false);
    document.querySelector('#directory-toggle').focus();
  }
});
document.querySelector('#theme-switch').addEventListener('click', (event) => stageAppearance('theme', event.currentTarget));
document.querySelector('#transparency-switch').addEventListener('click', (event) => {
  stageAppearance('transparency', event.currentTarget);
});
document.querySelector('#window-animations-switch').addEventListener('click', (event) => {
  stageAppearance('windowAnimations', event.currentTarget);
});
document.querySelector('#appearance-apply').addEventListener('click', applyAppearanceSelection);
document.querySelector('#appearance-undo').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  try {
    const result = await rollbackTweaks();
    await inspectAppearance();
    document.querySelector('#theme-status').textContent = result;
  } catch (error) {
    document.querySelector('#theme-status').textContent = typeof error === 'string' ? error : error.message;
  } finally { document.querySelector('#appearance-undo').disabled = false; }
});
document.querySelector('#appearance-discard').addEventListener('click', () => { pendingAppearance.clear(); void inspectAppearance(); });
document.querySelector('#appearance-suggest').addEventListener('click', askAppearanceSuggestion);
document.querySelector('#appearance-open-forge').addEventListener('click', () => selectView('settings'));
document.querySelectorAll('[data-settings-view]').forEach(button => {
  button.addEventListener('click', () => selectView(button.dataset.settingsView));
});
document.querySelector('[data-about-site]').addEventListener('click', event => {
  if (!inDesktopApp) return;
  event.preventDefault();
  invoke('open_agent_host_page', { choice: 'project' }).catch(error => {
    document.querySelector('#color-profile-status').textContent = `Could not open the external project page: ${error?.message || String(error)}`;
  });
});
document.querySelector('#memory-save').addEventListener('click', savePreferences);
document.querySelector('#memory-erase').addEventListener('click', erasePreferences);
document.querySelector('#workflow-form').addEventListener('submit', saveWorkflow);
document.querySelector('#workflow-cancel').addEventListener('click', resetWorkflowForm);
document.querySelector('#auditor-refresh').addEventListener('click', loadAuditorProposals);
document.querySelector('#proposal-history-filter').addEventListener('change', event => {
  renderAuditorProposals(proposalHistory(savedAgentProposals, event.target.value));
});
document.querySelector('#mod-model-select').addEventListener('change', updateModControls);
document.querySelector('#mod-model-load').addEventListener('click', loadModModel);
document.querySelector('#mod-model-unload').addEventListener('click', async () => {
  if (modBusy) return;
  modBusy = true; updateModControls();
  try {
    await invoke('unload_assistant_model');
    modStatusPolling = false; modModelReady = false; modLoadedModelId = '';
    await loadModCatalog();
  } catch (error) {
    document.querySelector('#mod-model-status').textContent = typeof error === 'string' ? error : error.message;
  } finally { modBusy = false; updateModControls(); }
});
document.querySelector('#mod-model-refresh').addEventListener('click', loadModCatalog);
document.querySelector('#mod-model-download').addEventListener('click', downloadModModel);
document.querySelector('#mod-model-cancel').addEventListener('click', cancelModModelDownload);
document.querySelector('#mod-package-select').addEventListener('click', () => selectModPackage());
document.querySelector('#learning-refresh').addEventListener('click', loadApprovedLearning);
document.querySelector('#review-cache-refresh').addEventListener('click', () => refreshReviewCache());
document.querySelector('#review-cache-clear').addEventListener('click', () => refreshReviewCache(true));
document.querySelector('#mod-package-analyze').addEventListener('click', runModAnalysis);
document.querySelector('#mod-guide-draft').addEventListener('click', draftModWorkflow);
document.querySelector('#mod-auditor-save').addEventListener('click', saveModAuditorProposal);
document.querySelector('#mod-kernel-create').addEventListener('click', createModKernelProposal);
document.querySelector('#receipt-ticket-reset').addEventListener('click', () => {
  receiptTickets.reset();
  renderCockpitMetrics();
});

renderKernelLibrary();
selectView('cockpit');
renderModCatalog();
mountLivePerformance([...document.querySelectorAll('[data-performance-dashboard]')]);
renderAgentGraphs([], [], [], false);
renderAgentDirectory([], []);
renderCockpitMetrics();
refreshBrowserSnapshot();
void loadApprovedLearning();
void refreshReviewCache();
window.setInterval(() => { if (!document.hidden) void refreshReviewCache(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshReviewCache(); });
inspectAppearance();
loadPreferences();
loadUserWorkflows();
loadAuditorProposals();
window.setInterval(refreshBrowserSnapshot, 1800);
window.addEventListener('capsule-proposals-changed', loadAuditorProposals);

function changeLearning(change, reset = false) {
  try {
    if (!learningReady && !reset) throw new Error('Review the storage error or explicitly reset local usage learning.');
    const next = reset ? emptyLedger() : structuredClone(learning);
    change(next);
    const serialized = JSON.stringify(next);
    if (!reset && serialized === JSON.stringify(learning)) return true;
    parseLedger(serialized);
    localStorage.setItem(LEARN_KEY, serialized);
    learning = next;
    learningReady = true;
    learningError = '';
    renderLearning();
    return true;
  } catch (error) {
    learningError = `Learning change was not saved: ${error.message}`;
    console.error(learningError);
    renderLearning();
    return false;
  }
}
function renderLearning() {
  for (const host of document.querySelectorAll('.activity-graph')) {
    let panel = host.querySelector('.learning-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'learning-panel';
      host.append(panel);
    }
    panel.hidden = !learning.ideas.length;
    panel.replaceChildren();
    if (!learning.ideas.length) continue;
    const open = text('button', 'button quiet', `${learning.ideas.length} usage suggestions - review learning`);
    open.type = 'button';
    open.addEventListener('click', () => {
      selectView('agents');
      document.querySelector('[data-learning-home]').closest('details').open = true;
    });
    panel.append(open);
  }
  const home = document.querySelector('[data-learning-home]');
  if (!home) return;
  home.replaceChildren(text('h2', '', 'Learning & knowledge'),
    text('p', '', 'Cited, approved source lessons are reference knowledge. Optional usage suggestions organize your workspace; they do not prove learning, train models or grant permissions.'));
  const status = text('p', 'inline-status', learningError || (learning.enabled
    ? 'Local usage suggestions enabled. Only workspace visits and agent/workflow selections are counted, at most once per minute per item. No URLs or document contents are collected.'
    : 'Usage collection is off. Existing approved source lessons remain available to source reviews.'));
  status.setAttribute('role', 'status');
  home.append(status);
  const button = (label, action) => {
    const item = text('button', 'button secondary', label);
    item.type = 'button';
    item.addEventListener('click', action);
    return item;
  };
  const toggle = button(learning.enabled ? 'DISABLE USAGE SUGGESTIONS' : 'ENABLE LOCAL USAGE SUGGESTIONS', () => {
    if (changeLearning(next => setLearningEnabled(next, !next.enabled))) scheduleLearning();
  });
  toggle.disabled = !learningReady;
  home.append(toggle, button('RESET LOCAL USAGE LEARNING', () => {
    if (!window.confirm('Delete local usage counts, suggestions, decisions, workspace planets and their local receipts? Cited source lessons, saved files and model weights are not affected. Usage collection will be off.')) return;
    if (changeLearning(() => {}, true)) {
      scheduleLearning();
      renderAgentGraphs(...lastGraphInput);
    }
  }), button('OPEN CITED SOURCE KNOWLEDGE', () => selectView('mod-forge')));
  home.append(text('p', '', `${learning.ideas.length}/50 pending usage suggestions · ${learning.kernels.length}/12 workspace planets. Signals expire after 30 days; idle/hidden pages do not cycle.`));
  for (const idea of learning.ideas) {
    const row = text('article', 'approved-lesson', '');
    row.append(text('strong', '', idea.title), text('p', '', idea.reason),
      button('KEEP WORKSPACE PLANET', () => resolveLearning(idea.id, true)),
      button('DISMISS', () => resolveLearning(idea.id, false)));
    home.append(row);
  }
  for (const planet of learning.kernels) {
    const row = text('article', 'approved-lesson', '');
    row.append(text('strong', '', planet.name), text('p', '', planet.detail),
      button('FORGET PLANET', () => {
        if (!window.confirm(`Forget "${planet.name}"? This removes its workspace planet, not source lessons or model weights.`)) return;
        if (changeLearning(next => forgetPlanet(next, planet.id))) renderAgentGraphs(...lastGraphInput);
      }));
    home.append(row);
  }
  const receipts = document.createElement('details');
  receipts.append(text('summary', '', `Local decision receipts (${learning.receipts.length}; checksums, not cryptographic authentication)`));
  for (const receipt of learning.receipts.slice(-12).reverse()) receipts.append(text('p', '', `#${receipt.seq} · ${receipt.agent} · ${receipt.event}`));
  home.append(receipts);
}
function resolveLearning(id, accept) {
  if (changeLearning(next => resolveIdea(next, id, accept)) && accept) renderAgentGraphs(...lastGraphInput);
}
function scheduleLearning() {
  window.clearTimeout(learningTimer);
  if (!learningReady || !learning.enabled || document.hidden || learning.revision === learning.processedRevision) return;
  learningTimer = window.setTimeout(learningTick, Math.max(0, learning.lastCycle + CYCLE_MS - Date.now()));
}
function learningTick() {
  if (!document.hidden && learningReady && dueForCycle(learning)) changeLearning(next => runCycle(next));
}
function recordLearningSignal(key, name) {
  if (!learningReady || !learning.enabled) return;
  if (changeLearning(next => recordSignal(next, key, name))) scheduleLearning();
}
document.addEventListener('graph-select', (event) => {
  const { key, name, kind } = event.detail || {};
  if (key && ['agent', 'workflow'].includes(kind)) recordLearningSignal(key, name || key);
});
document.addEventListener('visibilitychange', scheduleLearning);
scheduleLearning();
renderLearning();
