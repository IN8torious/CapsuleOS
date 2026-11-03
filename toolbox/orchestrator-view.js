import { invoke, inDesktopApp } from './bridge.js';

export function mountOrchestratorView(root, invokeCommand = invoke) {
  const status = root.querySelector('[data-orchestrator-status]');
  const history = root.querySelector('[data-orchestrator-history]');
  const start = root.querySelector('[data-orchestrator-start]');
  const stop = root.querySelector('[data-orchestrator-stop]');
  const workspaceStatus = root.querySelector('[data-workspace-status]');
  const workspaceButtons = ['grant', 'revoke', 'undo'].map(name => root.querySelector(`[data-workspace-${name}]`));
  let busy = false, refreshing = false, timer, lastProposal = null, workspaceBusy = false;
  const visible = () => !document.hidden && !root.closest('[data-notification-panel]').hidden && root.closest('.view').classList.contains('active');
  const node = (tag, value) => { const element = document.createElement(tag); element.textContent = value; return element; };
  function render(result) {
    status.textContent = result.error || (result.run
      ? `${result.run.state} · refinement ${result.run.cycle}/${result.run.maxCycles} · ${result.run.modelId}`
      : 'No orchestrator run yet. Load a local model, choose a goal, then explicitly start a bounded run.');
    start.disabled = busy || result.active;
    stop.disabled = busy || !result.active;
    history.replaceChildren();
    if (!result.events.length) history.append(node('p', 'Development events will appear here as work actually happens. No changes have been applied.'));
    for (const event of result.events.slice().reverse()) {
      const card = node('article', '');
      card.className = 'approved-lesson';
      const title = { 'principle-checked': 'Christian principle · reference checked', 'evidence-verified': 'Discernment · source evidence matched', 'workspace-edited': 'Stewardship · checkpoint saved' }[event.kind] || event.kind.replaceAll('-', ' ');
      card.append(node('strong', title),
        node('small', `${new Date(event.at).toLocaleString()} · run ${event.runId.slice(0, 8)} · event #${event.seq}`),
        node('p', event.message));
      if (event.proposalId) card.append(node('code', `Saved proposal ${event.proposalId}`));
      history.append(card);
    }
    const newest = result.events.filter(event => event.proposalId).at(-1)?.proposalId || null;
    if (newest && newest !== lastProposal) window.dispatchEvent(new Event('capsule-proposals-changed'));
    lastProposal = newest;
  }
  async function refresh() {
    window.clearTimeout(timer);
    if (busy || refreshing) return;
    if (!inDesktopApp) {
      status.textContent = 'Desktop runtime required. This preview shows the controls but cannot start agents or read native development history.';
      start.disabled = stop.disabled = true;
      workspaceStatus.textContent = 'Folder permissions and Undo require the desktop app.';
      workspaceButtons.forEach(button => { button.disabled = true; });
      return;
    }
    refreshing = true;
    try {
      const result = await invokeCommand('orchestrator_action', { action: 'status', payload: {} });
      if (!result.ok) throw new Error(result.message || 'Orchestrator status unavailable.');
      render(result);
      if (!workspaceBusy) await refreshWorkspace();
      if (result.active && visible()) timer = window.setTimeout(refresh, 3000);
    } catch (error) {
      status.textContent = `Development history unavailable: ${typeof error === 'string' ? error : error.message}`;
      start.disabled = stop.disabled = true;
    } finally { refreshing = false; }
  }
  async function refreshWorkspace() {
    try {
      const state = await invokeCommand('workspace_autonomy_action', { action: 'status' });
      if (!state.ok) throw new Error(state.message || 'Workspace permissions unavailable.');
      workspaceStatus.textContent = state.grant ? `Automatic edits authorized: ${state.grant.folder}` : 'No folder authorized. Agents can inspect the selected package and refine drafts without changing documents.';
      workspaceButtons[0].disabled = false;
      workspaceButtons[1].disabled = !state.grant;
      workspaceButtons[2].disabled = !state.checkpoints.some(item => item.state !== 'undone');
    } catch (error) {
      workspaceStatus.textContent = `Workspace status unavailable: ${typeof error === 'string' ? error : error.message}`;
      workspaceButtons.forEach(button => { button.disabled = true; });
    }
  }
  workspaceButtons.forEach((button, index) => button.addEventListener('click', async () => {
    if (workspaceBusy || !inDesktopApp) return;
    workspaceBusy = true; workspaceButtons.forEach(item => { item.disabled = true; });
    try {
      const result = await invokeCommand(index === 0 ? 'authorize_document_workspace' : 'workspace_autonomy_action',
        index === 0 ? {} : { action: index === 1 ? 'revoke' : 'undo' });
      if (!result.ok) throw new Error(result.message || 'Workspace action failed.');
      await refreshWorkspace();
    } catch (error) {
      workspaceStatus.textContent = typeof error === 'string' ? error : error.message;
      workspaceButtons[0].disabled = false;
    } finally { workspaceBusy = false; }
  }));
  async function act(action, payload) {
    if (busy) return;
    busy = true; start.disabled = stop.disabled = true;
    window.clearTimeout(timer);
    try {
      const result = await invokeCommand('orchestrator_action', { action, payload });
      if (!result.ok) throw new Error(result.message || 'The orchestrator action was rejected.');
    } catch (error) {
      status.textContent = typeof error === 'string' ? error : error.message;
      busy = false;
      start.disabled = stop.disabled = false;
      return;
    }
    busy = false;
    await refresh();
  }
  start.addEventListener('click', () => {
    const goal = root.querySelector('[data-orchestrator-goal]').value.trim();
    const maxCycles = Number(root.querySelector('[data-orchestrator-cycles]').value);
    if (!goal || goal.length > 600) { status.textContent = 'Enter a goal of 1-600 characters.'; return; }
    void act('start', { goal, maxCycles, confirmed: true });
  });
  stop.addEventListener('click', () => { void act('stop', {}); });
  root.querySelector('[data-orchestrator-refresh]').addEventListener('click', refresh);
  const visibility = () => {
    window.clearTimeout(timer);
    if (visible()) void refresh();
  };
  window.addEventListener('capsule-view', visibility);
  window.addEventListener('capsule-notification-tab', visibility);
  document.addEventListener('visibilitychange', visibility);
  return { refresh, destroy() {
    window.clearTimeout(timer);
    window.removeEventListener('capsule-view', visibility);
    window.removeEventListener('capsule-notification-tab', visibility);
    document.removeEventListener('visibilitychange', visibility);
  } };
}
