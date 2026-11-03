import { PERFORMANCE_GOALS, performanceSettingIds, proposePerformanceSettings } from '../app/performance-advisor.js';
import { CREW } from './crew-data.js';
import { invoke } from './bridge.js';
import { formatValue, reviewAndApplyTweaks, rollbackTweaks } from './tweak-actions.js';
import { requestSupportedTweakApproval } from './tweak-library.js';
import { createPerformanceDashboard } from './live-performance.js';

const analyst = CREW.find((agent) => agent.id === 'crew-corvus');
const el = (tag, className, value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
};

export async function inspectPerformanceProposal(goal, invokeCommand = invoke) {
  const [snapshot, device] = await Promise.all([
    invokeCommand('inspect_catalog_tweaks', { ids: performanceSettingIds() }),
    invokeCommand('inspect_performance_device'),
  ]);
  return { snapshot, device, proposals: proposePerformanceSettings(goal, snapshot, device) };
}

export function mountPerformanceAdvisor(root, invokeCommand = invoke) {
  const heading = el('div', 'page-heading');
  const title = el('div');
  title.append(el('div', 'eyebrow', 'SI CORE / WINDOWS PERFORMANCE'), el('h1', '', 'Performance advisor.'),
    el('p', '', `${analyst.name} inspects real catalog registry values and proposes settings for your goal. Fixed local rules, not a model response or a measured bottleneck diagnosis.`));
  heading.append(title);
  const panel = el('article', 'panel glass-bezel performance-controls');
  const controls = el('div', 'pb-row');
  const label = el('label', 'pb-directory-label', 'Your goal');
  const goal = el('select', 'pb-directory');
  goal.setAttribute('aria-label', 'Performance goal');
  for (const [id, text] of Object.entries(PERFORMANCE_GOALS)) {
    const option = el('option', '', text);
    option.value = id;
    goal.append(option);
  }
  label.append(goal);
  const inspect = el('button', 'button secondary', 'Inspect and propose');
  const review = el('button', 'primary-button', 'Review selected settings');
  const undo = el('button', 'button secondary', 'Undo last batch');
  const powerSettings = el('button', 'button secondary', 'Windows power settings');
  review.disabled = true;
  controls.append(label, inspect, powerSettings, undo, review);
  const note = el('p', '', 'Nothing is selected or applied automatically. No Defender, Update, security, service, timer, overclock, or power-plan changes. Possible benefits depend on your workload; compare before and after rather than expecting a promised speed-up.');
  const status = el('div', 'inline-status', 'Choose a goal, then inspect Windows. Inspection is read-only and requires the desktop app.');
  status.setAttribute('role', 'status');
  const cards = el('div', 'performance-proposals');
  const deviceStatus = el('p', 'performance-device', 'Device power and memory have not been inspected.');
  const research = el('details', 'setting-evidence');
  research.append(el('summary', '', 'Registry research and laptop limits'),
    el('p', '', 'More registry entries do not automatically mean more speed. Microsoft documents that MMCSS SystemResponsiveness=0 is clamped to 20, and GPU Priority / SFIO Priority are not used. Those are not magic performance boosts.'),
    el('p', '', 'Keep power throttling and Energy Saver available on battery. For maximum plugged-in speed, review Windows Power mode: Best performance. It can increase heat, fan noise and power use; Energy Saver can prevent power-mode changes. The button above opens Windows Settings without changing anything.'),
    el('p', '', 'For sustained slowdowns, inspect Task Manager CPU, memory, disk and Startup apps first. Reducing unnecessary startup work and per-app background activity can matter more than menu timing. A one-time memory reading cannot prove a CPU or thermal bottleneck.'),
    el('p', '', 'Sources: Microsoft Support / Tips to improve PC performance in Windows; Microsoft Learn / Multimedia Class Scheduler Service; Microsoft Learn / Energy Saver.'));
  const selected = new Set();
  let busy = false;
  const updateControls = () => {
    goal.disabled = inspect.disabled = undo.disabled = powerSettings.disabled = busy;
    review.disabled = busy || selected.size === 0;
    for (const checkbox of cards.querySelectorAll('input')) checkbox.disabled = busy;
  };
  const clear = () => { selected.clear(); cards.replaceChildren(); updateControls(); };
  goal.addEventListener('change', () => { clear(); status.textContent = 'Goal changed. Inspect again to generate proposals; nothing was applied.'; });
  inspect.addEventListener('click', async () => {
    clear();
    busy = true;
    updateControls();
    status.textContent = 'Reading the fixed Windows settings allowlist. No changes are being made.';
    deviceStatus.textContent = 'Reading current Windows power and memory status.';
    try {
      const { snapshot, device, proposals } = await inspectPerformanceProposal(goal.value, invokeCommand);
      deviceStatus.textContent = `${device.hasBattery === true ? 'Battery-equipped device' : device.hasBattery === false ? 'No battery reported' : 'Battery status unknown'} / ${device.onAc === true ? 'plugged in' : device.onAc === false ? 'on battery' : 'power unknown'} / Energy Saver ${device.energySaver === null ? 'unknown' : device.energySaver ? 'on' : 'off'} / memory ${device.memoryLoadPercent}% in use, ${device.availableMemoryGiB.toFixed(1)} GiB available of ${device.totalMemoryGiB.toFixed(1)} GiB. One snapshot, not a benchmark.`;
      if (device.memoryLoadPercent >= 85) deviceStatus.textContent += ' High memory load: inspect apps and browser tabs before adding registry tweaks. Do not disable the page file or memory compression.';
      const throttling = snapshot.changes.find((change) => change.tweakId === 'no-power-throttling');
      if (device.hasBattery && throttling?.before?.kind === 'REG_DWORD' && throttling.before.bytes.join(',') === '1,0,0,0') {
        deviceStatus.textContent += ' The persistent power-throttling override is already enabled. It can affect battery life after unplugging; consider restoring it before battery use.';
      }
      window.dispatchEvent(new CustomEvent('capsule-performance-proposals', { detail: { goal: goal.value, proposals } }));
      for (const proposal of proposals) {
        const card = el('article', 'appearance-suggestion performance-proposal');
        const copy = el('div', 'appearance-suggestion-copy');
        const choose = el('label', 'performance-choice');
        const box = el('input');
        box.type = 'checkbox';
        box.addEventListener('change', () => {
          if (box.checked) selected.add(proposal.tweakId); else selected.delete(proposal.tweakId);
          updateControls();
        });
        choose.append(box, el('strong', '', proposal.title));
        copy.append(choose, el('small', '', `${analyst.name} / rule-based proposal / ${proposal.risk.toUpperCase()} RISK`),
          el('p', '', proposal.benefit), el('p', '', `Trade-off: ${proposal.tradeoff}`),
          el('p', '', `Check the outcome: ${proposal.measure}`));
        if (proposal.unsetValues) copy.append(el('small', '', 'Some values are not configured. Windows defaults and actual feature activity have not been established.'));
        const evidence = el('details', 'setting-evidence');
        evidence.append(el('summary', '', 'Inspected Windows evidence'));
        for (const change of proposal.evidence) {
          evidence.append(el('code', '', change.location), el('p', '', `Current: ${formatValue(change.before)}; proposed: ${change.desired} (${change.after.kind})`));
        }
        copy.append(evidence);
        const approve = el('button', 'button secondary', 'Approve to Tweak+');
        approve.type = 'button';
        approve.addEventListener('click', () => {
          try { status.textContent = requestSupportedTweakApproval(proposal.tweakId, `${proposal.benefit} Trade-off: ${proposal.tradeoff}`.slice(0, 600)); }
          catch (error) { status.textContent = error.message; }
        });
        copy.append(approve);
        card.append(copy);
        cards.append(card);
      }
      status.textContent = proposals.length
        ? `${proposals.length} proposals from inspected registry values. Select only the changes you want; Review shows a fresh preview before confirmation.`
        : 'No changes proposed: the inspected values already match this goal. No performance gain has been measured.';
    } catch (error) {
      status.textContent = typeof error === 'string' ? error : error.message;
    } finally { busy = false; updateControls(); }
  });
  root.addEventListener('capsule-performance-goal', (event) => {
    if (busy || !Object.hasOwn(PERFORMANCE_GOALS, event.detail)) return;
    goal.value = event.detail;
    clear();
    inspect.click();
  });
  powerSettings.addEventListener('click', async () => {
    try { await invokeCommand('open_power_settings'); status.textContent = 'Opened Windows Power & battery. No setting was changed by Capsule.'; }
    catch (error) { status.textContent = typeof error === 'string' ? error : error.message; }
  });
  review.addEventListener('click', async () => {
    if (busy || !selected.size) return;
    busy = true;
    updateControls();
    try {
      status.textContent = await reviewAndApplyTweaks([...selected], invokeCommand);
      clear();
    } catch (error) {
      status.textContent = typeof error === 'string' ? error : error.message;
    } finally { busy = false; updateControls(); }
  });
  undo.addEventListener('click', async () => {
    busy = true;
    updateControls();
    try { status.textContent = await rollbackTweaks(invokeCommand); clear(); }
    catch (error) { status.textContent = typeof error === 'string' ? error : error.message; }
    finally { busy = false; updateControls(); }
  });
  panel.append(controls, note, deviceStatus, status, cards, research);
  root.replaceChildren(heading, createPerformanceDashboard(), panel);
}
