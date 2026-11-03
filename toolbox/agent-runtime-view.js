import { invoke, inDesktopApp } from './bridge.js';

const hostPages = Object.freeze({
  ubuntu: 'https://github.com/ubuntu/WSL',
  pengwin: 'https://apps.microsoft.com/detail/9NV1GV1PXZ6P',
  pistachio: 'https://apps.microsoft.com/detail/9P41G2MV9CQ3'
});

export function mountAgentRuntime(root, invokeCommand = invoke) {
  const policy = root.querySelector('[data-runtime-policy]');
  const distro = root.querySelector('[data-runtime-distro]');
  const status = root.querySelector('[data-runtime-status]');
  const live = root.querySelectorAll('[data-runtime-live]');
  const hostList = root.querySelector('[data-wsl-list]');
  const hostStatus = root.querySelector('[data-wsl-status]');
  const hostRefresh = root.querySelector('[data-wsl-refresh]');
  const save = root.querySelector('[data-runtime-save]');
  root.querySelectorAll('[data-agent-host-page]').forEach(button => button.addEventListener('click', async () => {
    const choice = button.dataset.agentHostPage;
    if (!Object.hasOwn(hostPages, choice)) return;
    try {
      if (inDesktopApp) await invokeCommand('open_agent_host_page', { choice });
      else if (!window.open(hostPages[choice], '_blank', 'noopener,noreferrer')) {
        status.textContent = `Open this information page in your browser: ${hostPages[choice]}`;
        return;
      }
      status.textContent = 'Requested the external host information page. Capsule has not installed or enabled anything.';
    } catch (error) { status.textContent = typeof error === 'string' ? error : error.message; }
  }));
  let busy = false, dirty = false, timer, updating = false, revision = 0, distributions = [], current = { policy: 'windows', distro: '' };
  const setLive = value => live.forEach(node => { node.textContent = value; });
  function renderSettings(settings) {
    current = settings;
    policy.value = settings.policy;
    distro.replaceChildren();
    const names = [...new Set([...distributions, ...(settings.distro ? [settings.distro] : [])])];
    if (!names.length) {
      const option = document.createElement('option');
      option.value = ''; option.textContent = 'Refresh to find existing WSL2 distributions';
      distro.append(option);
    }
    for (const name of names) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = distributions.includes(name) ? name : `${name} (saved; not checked)`;
      distro.append(option);
    }
    if (settings.distro) distro.value = settings.distro;
    distro.disabled = busy || policy.value !== 'prefer-wsl';
  }
  async function run(action) {
    if (busy) return;
    revision++;
    busy = true; hostRefresh.disabled = save.disabled = policy.disabled = distro.disabled = true;
    root.querySelectorAll('[data-wsl-lifecycle]').forEach(button => { button.disabled = true; });
    try { await action(); }
    catch (error) {
      status.textContent = hostStatus.textContent = typeof error === 'string' ? error : error.message;
    }
    finally {
      busy = false; hostRefresh.disabled = save.disabled = policy.disabled = false;
      root.querySelectorAll('[data-wsl-lifecycle]').forEach(button => { button.disabled = false; });
      distro.disabled = policy.value !== 'prefer-wsl';
    }
  }
  policy.addEventListener('change', () => { dirty = true; distro.disabled = policy.value !== 'prefer-wsl'; });
  distro.addEventListener('change', () => { dirty = true; });
  function renderHosts(result) {
    hostList.replaceChildren();
    if (!result.ok || !distributions.length) {
      const empty = document.createElement('p');
      empty.textContent = result.ok ? 'No eligible WSL2 distributions found. Install and initialize your chosen host manually, then Refresh.' : 'Host inventory unavailable. No lifecycle controls are enabled.';
      hostList.append(empty);
    }
    for (const name of result.ok ? distributions : []) {
      const row = document.createElement('article');
      row.className = 'wsl-host-card';
      const heading = document.createElement('strong'); heading.textContent = name;
      const state = document.createElement('span');
      const stateName = Array.isArray(result.running) ? result.running.includes(name) ? 'Running' : 'Stopped' : 'Unknown';
      state.textContent = `WSL2 / ${stateName} / runtime compatibility not checked`;
      const controls = document.createElement('div'); controls.className = 'mod-inline-controls';
      for (const action of ['start', 'stop']) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'button secondary';
        button.dataset.wslLifecycle = action; button.disabled = busy;
        button.textContent = action === 'start' ? 'START' : 'STOP';
        button.setAttribute('aria-label', `${action === 'start' ? 'Start' : 'Stop'} ${name}`);
        button.addEventListener('click', () => void run(async () => {
          if (!window.confirm(action === 'stop'
            ? `Stop "${name}"? ALL processes in this distribution will terminate, including work outside Capsule. Save all Linux work first. This cannot undo lost unsaved work. Other distributions will not be stopped.`
            : `Start the existing WSL2 distribution "${name}"? This starts Linux but does not install software or load agent models.`)) return;
          hostStatus.textContent = `${action === 'start' ? 'Starting' : 'Stopping'} ${name}...`;
          const response = await invokeCommand('manage_wsl_distribution', { action, distro: name, confirmed: true });
          if (!response.ok) throw new Error(response.message || 'The WSL lifecycle operation failed.');
          await inspect();
          hostStatus.textContent = response.message;
        }));
        controls.append(button);
      }
      const setup = document.createElement('button');
      setup.type = 'button'; setup.className = 'button secondary';
      setup.textContent = 'REVIEW OFFLINE RUNTIME SETUP';
      setup.dataset.wslLifecycle = 'setup';
      setup.disabled = busy;
      setup.addEventListener('click', () => void run(async () => {
        const { plan } = await invokeCommand('preview_wsl_setup', { distro: name });
        hostStatus.textContent = plan.changes.join(' ');
        if (!window.confirm(`Prepare the offline agent runtime in "${name}"?\n\n${plan.changes.join('\n\n')}\n\nApprove only these changes?`)) return;
        hostStatus.textContent = 'Verifying payloads, copying model files and preparing ext4 runtime. Keep Toolbox open; allow up to 12 minutes.';
        const response = await invokeCommand('apply_wsl_setup', { distro: name, approvalId: plan.id, confirmed: true });
        if (!response.ok) throw new Error(response.message || 'WSL setup failed.');
        hostStatus.textContent = `${response.receipt.status}: ${response.receipt.output}`;
      }));
      controls.append(setup);
      row.append(heading, state, controls); hostList.append(row);
    }
    if (result.ok) for (const name of result.unavailable || []) {
      const row = document.createElement('article');
      row.className = 'wsl-host-card';
      const heading = document.createElement('strong'); heading.textContent = name;
      const detail = document.createElement('p');
      detail.textContent = 'WSL2 / Unavailable: listed by WSL but not yet launchable. Installation or removal may still be in progress. Complete setup in the distribution app, then Refresh. Start, Stop and inference selection are disabled.';
      row.append(heading, detail); hostList.append(row);
    }
  }
  async function inspect() {
    status.textContent = 'Reading existing WSL2 inventory. No distribution or packages will be installed.';
    let result;
    try { result = await invokeCommand('inspect_agent_runtime'); }
    catch (error) { renderHosts({ ok: false }); throw error; }
    distributions = result.distributions || [];
    renderHosts(result);
    if (result.runtime) setLive(`${result.runtime.backend === 'wsl2' ? 'WSL2' : 'Windows'} / ${result.runtime.phase}: ${result.runtime.message}`);
    if (!dirty) renderSettings(result.settings || current);
    const message = result.ok
      ? `${distributions.length} eligible WSL2 distributions; ${(result.unavailable || []).length} unavailable. Runtime dependencies and model files are verified only when you load a model.`
      : result.message || 'WSL2 inventory could not be read. Windows remains available.';
    status.textContent = hostStatus.textContent = message;
  }
  hostRefresh.addEventListener('click', () => void run(inspect));
  save.addEventListener('click', () => void run(async () => {
    const settings = { policy: policy.value, distro: policy.value === 'prefer-wsl' ? distro.value : '' };
    if (settings.policy === 'prefer-wsl') {
      if (!settings.distro) throw new Error('Refresh and choose an existing WSL2 distribution first.');
      if (!window.confirm(`Allow Capsule to start a shared inference worker in "${settings.distro}" when you load an approved model? This starts WSL if stopped and creates a Linux cache. No packages or models are installed. Windows fallback remains enabled. Any loaded model will stop.`)) return;
    }
    const result = await invokeCommand('configure_agent_runtime', { settings });
    if (!result.ok) throw new Error(result.message || 'The runtime preference was not saved.');
    renderSettings(result.settings);
    dirty = false;
    status.textContent = result.runtime.message;
    window.dispatchEvent(new CustomEvent('capsule-runtime-changed'));
  }));
  async function update() {
    if (busy || updating) return;
    updating = true;
    const expected = revision;
    try {
      const result = await invokeCommand('get_assistant_status');
      if (!result.ok || !result.status?.runtime) throw new Error('The bundled runtime did not return valid status. Retry or reinstall the self-contained Toolbox build.');
      if (busy || expected !== revision) return;
      const runtime = result.status.runtime;
      if (!dirty) renderSettings(runtime.settings);
      setLive(`${runtime.backend === 'wsl2' ? 'WSL2' : 'Windows'} / ${runtime.phase}: ${runtime.message}`);
    } catch (error) { setLive(typeof error === 'string' ? error : error.message); }
    finally { updating = false; }
  }
  const onView = event => {
    clearInterval(timer);
    if (['settings', 'wsl'].includes(event.detail)) {
      if (event.detail === 'wsl') void run(inspect);
      else void update();
      timer = setInterval(() => { if (!document.hidden) void update(); }, 5000);
    }
  };
  window.addEventListener('capsule-view', onView);
  return { update, destroy() { clearInterval(timer); window.removeEventListener('capsule-view', onView); } };
}
