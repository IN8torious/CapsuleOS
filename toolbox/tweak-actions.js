import { invoke } from './bridge.js';

export function formatValue(value) {
  if (!value) return '(not set)';
  const bytes = Uint8Array.from(value.bytes);
  if (value.kind === 'REG_DWORD' && bytes.length === 4) return new DataView(bytes.buffer).getUint32(0, true).toString();
  return new TextDecoder('utf-16le').decode(bytes).replace(/\0+$/, '');
}

export async function reviewAndApplyTweaks(ids, invokeCommand = invoke) {
  const preview = await invokeCommand('preview_catalog_tweaks', { ids });
  return reviewPreview(preview, invokeCommand);
}

export async function reviewAndApplyAppearance(settings, invokeCommand = invoke) {
  const preview = await invokeCommand('preview_appearance_settings', { settings });
  return reviewPreview(preview, invokeCommand);
}

async function reviewPreview(preview, invokeCommand) {
  const dialog = document.createElement('dialog');
  dialog.className = 'settings-review';
  const title = document.createElement('h2');
  title.textContent = 'Review Windows settings';
  const note = document.createElement('p');
  note.textContent = `${preview.changes.length} fixed registry values. ${preview.needsAdmin ? 'Includes machine-wide settings.' : 'Current-user settings only.'} Confirmation requests administrator approval through Windows UAC unless already elevated. Only a fixed settings helper is elevated; the browser stays unelevated. This verifies saved registry values, not whether Windows honors a policy. Some changes need sign-out or restart. Undo restores the last batch, including Appearance, Tweak+, Internet and Performance advisor changes.`;
  const list = document.createElement('div');
  list.className = 'settings-review-list';
  for (const change of preview.changes) {
    const row = document.createElement('article');
    const heading = document.createElement('strong');
    heading.textContent = change.title;
    const path = document.createElement('code');
    path.textContent = change.location;
    const value = document.createElement('p');
    value.textContent = `${formatValue(change.before)} → ${change.desired} (${change.after.kind})`;
    row.append(heading, path, value);
    list.append(row);
  }
  const buttons = document.createElement('div');
  buttons.className = 'settings-review-buttons';
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.className = 'button secondary';
  cancel.addEventListener('click', () => dialog.close());
  const apply = document.createElement('button');
  apply.textContent = 'Confirm and apply settings';
  apply.className = 'primary-button';
  apply.addEventListener('click', () => dialog.close('apply'));
  buttons.append(cancel, apply);
  dialog.append(title, note, list, buttons);
  document.body.append(dialog);
  try {
    const confirmed = await new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'apply'), { once: true });
      dialog.showModal();
    });
    if (!confirmed) return 'Cancelled. No Windows settings were changed.';
    const receipt = await invokeCommand('apply_catalog_tweaks', { previewId: preview.id, confirmed: true });
    window.dispatchEvent(new CustomEvent('capsule-settings-changed', { detail: {
      kind: 'apply', id: receipt.id, at: Date.now(), ids: [...new Set(receipt.changes.map(change => change.tweakId))]
    } }));
    return `Applied ${receipt.changes.length} registry values and saved receipt ${receipt.id}. Windows may need sign-out or restart; policy effectiveness is not guaranteed.`;
  } finally {
    dialog.remove();
  }
}

export async function rollbackTweaks(invokeCommand = invoke) {
  if (!window.confirm('Restore the original registry values from the last settings batch (Appearance, Tweak+, Internet or Performance advisor)? Windows will request administrator approval if needed. Rollback stops if Windows values have changed since that batch.')) {
    return 'Rollback cancelled. Nothing changed.';
  }
  const receipt = await invokeCommand('rollback_catalog_tweaks', { confirmed: true });
  window.dispatchEvent(new CustomEvent('capsule-settings-changed', { detail: {
    kind: 'rollback', id: receipt.id, at: Date.now(), ids: [...new Set(receipt.changes.map(change => change.tweakId))]
  } }));
  return `Restored the original registry values from ${receipt.id}. Sign out or restart if needed.`;
}

export function attachTweakActions(bar, status, getIds) {
  const apply = document.createElement('button');
  apply.className = 'primary-button';
  apply.textContent = 'Apply settings';
  const rollback = document.createElement('button');
  rollback.className = 'button secondary';
  rollback.textContent = 'Undo last batch';
  const run = async (action) => {
    apply.disabled = true;
    rollback.disabled = true;
    status.textContent = 'Reading Windows settings…';
    try { status.textContent = await action(); }
    catch (error) { status.textContent = typeof error === 'string' ? error : error.message; }
    finally { apply.disabled = false; rollback.disabled = false; }
  };
  apply.addEventListener('click', () => {
    const ids = getIds();
    if (!ids.length) { status.textContent = 'Select at least one setting to apply.'; return; }
    void run(() => reviewAndApplyTweaks(ids));
  });
  rollback.addEventListener('click', () => void run(rollbackTweaks));
  bar.append(rollback, apply);
}
