import { invoke } from './bridge.js';
import { REPAIR_GROUPS, REPAIR_TASKS, SECURITY_FIXES, repairTask, securityFindings } from '../app/repair.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountRepair(root) {
  root.replaceChildren();
  const heading = el('div', 'page-heading');
  const text = el('div');
  text.append(el('div', 'eyebrow', 'CAPSULE OS / REPAIR'), el('h1', '', 'Repair Windows.'),
    el('p', '', 'Review the exact fixed action, approve it, then answer Windows UAC. Only the helper is elevated; the Toolbox stays unelevated. Results are recorded. Repairs have no automatic Undo.'));
  heading.append(text, el('span', 'chip-safe', 'ACTION-SPECIFIC APPROVAL'));

  const secPanel = el('section', 'panel net-panel');
  const secList = el('div', 'net-hard');
  const secStatus = el('div', 'net-live', 'Security check: reading…');
  secPanel.append(el('div', 'eyebrow', 'SECURITY CHECK'), secStatus, secList);

  const repairPanel = el('section', 'panel net-panel');
  repairPanel.append(el('div', 'eyebrow', 'REPAIR TOOLS'));
  const tools = el('div', 'rp-groups');
  repairPanel.append(tools);

  const log = el('pre', 'rp-log', 'Output appears here.');
  const status = el('div', 'inline-status');
  status.setAttribute('role', 'status');
  const receiptStatus = el('div', 'inline-status');
  receiptStatus.setAttribute('role', 'status');
  const logPanel = el('section', 'panel net-panel');
  logPanel.append(el('div', 'eyebrow', 'OUTPUT / LAST EXECUTION RECEIPT'), status, receiptStatus, log);

  let busy = false;
  const buttons = [];

  function setBusy(value) {
    busy = value;
    buttons.forEach((button) => { button.disabled = value; });
  }

  async function loadReceipt() {
    try {
      const receipt = await invoke('get_repair_receipt');
      receiptStatus.textContent = receipt
        ? `Receipt ${receipt.id}: ${receipt.task} — ${receipt.status}. ${['awaiting-admin', 'running', 'uncertain'].includes(receipt.status) ? 'Do not retry: inspect the pending repair-receipt.json journal and Windows tool state first.' : ''}`
        : 'No approved repair has run yet.';
    } catch (error) {
      receiptStatus.textContent = `Receipt unavailable: ${typeof error === 'string' ? error : error.message}`;
    }
  }

  async function run(label, action, message, taskId, kind) {
    if (busy) return;
    setBusy(true);
    status.textContent = `Preparing the exact ${label} action for review…`;
    try {
      const preview = await invoke('preview_repair', { taskId, kind });
      log.textContent = `${preview.command}\n\n${preview.warning}`;
      if (!window.confirm(`${message}\n\nExact Windows action:\n${preview.command}\n\n${preview.warning}\n\nApprove this action and request UAC?`)) {
        status.textContent = 'Cancelled. No action was started.';
        return;
      }
      status.textContent = `${label}: awaiting Windows consent, then execution. This can take up to an hour. Keep the app open.`;
      const result = await action(preview.approvalId);
      status.textContent = result.success ? `${label}: Windows tool exited successfully. Review its output and current security state.` : `${label} reported a problem.`;
      log.textContent = result.output || 'Windows returned no text. A successful tool exit is not proof of overall system health.';
    } catch (error) {
      status.textContent = typeof error === 'string' ? error : error.message;
    } finally {
      setBusy(false);
      void loadReceipt();
      if (label.startsWith('Fix')) loadSecurity();
    }
  }

  for (const [group, label] of Object.entries(REPAIR_GROUPS)) {
    const box = el('div', 'rp-group');
    box.append(el('h3', '', label));
    for (const task of REPAIR_TASKS.filter((entry) => entry.group === group)) {
      const row = el('div', 'net-row rp-row');
      const body = el('div');
      body.append(el('strong', '', task.title), el('small', '', task.description),
        el('div', 'pb-badges', `${task.changes ? 'REPAIRS' : 'READ-ONLY'} · ${task.minutes} MIN`));
      const go = el('button', 'primary-button', 'Review and run');
      buttons.push(go);
      go.addEventListener('click', () => run(task.title, approvalId => invoke('run_repair', { taskId: task.id, approvalId, confirmed: true }),
        `${task.title}\n\n${task.description}\n\nExpected duration: ${task.minutes} minutes.`, task.id, 'repair'));
      row.append(body, go);
      box.append(row);
    }
    tools.append(box);
  }

  function renderSecurity(report) {
    secList.replaceChildren();
    const findings = securityFindings(report);
    const open = findings.filter((entry) => entry.needed);
    secStatus.textContent = open.length
      ? `${open.length} thing${open.length === 1 ? '' : 's'} need attention.`
      : 'Security protections look healthy.';
    for (const fix of SECURITY_FIXES) {
      const finding = findings.find((entry) => entry.id === fix.id);
      if (!finding.needed && fix.id !== 'defender-update' && fix.id !== 'defender-quick-scan') continue;
      const row = el('div', `net-row rp-row${finding.needed ? ' on' : ''}`);
      const body = el('div');
      body.append(el('strong', '', fix.title), el('small', '', fix.description), el('div', 'pb-badges', finding.needed ? 'NEEDED' : 'OPTIONAL'));
      const go = el('button', 'primary-button', finding.needed ? 'Review fix' : 'Review and run');
      buttons.push(go);
      go.disabled = busy;
      go.addEventListener('click', () => run(`Fix: ${fix.title}`, approvalId => invoke('apply_security_fix', { fixId: fix.id, approvalId, confirmed: true }),
        `${fix.title}\n\n${fix.description}\n\nThis only turns protection on or refreshes it.`, fix.id, 'security-fix'));
      row.append(body, go);
      secList.append(row);
    }
  }

  async function loadSecurity() {
    try {
      const { report } = await invoke('inspect_security');
      renderSecurity(report);
    } catch (error) {
      secStatus.textContent = `Security check unavailable: ${typeof error === 'string' ? error : error.message}`;
      secList.replaceChildren();
    }
  }

  root.append(heading, secPanel, repairPanel, logPanel);
  loadSecurity();
  void loadReceipt();
}

export { repairTask };
