import { invoke } from './bridge.js';

const node = (tag, text) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
};

export function mountHtmlComponents(root, { getSource, invokeCommand = invoke } = {}) {
  const heading = node('h2', 'Reuse selected components');
  const caution = node('p', 'Review only the parts you want to keep. A selected parent includes its children; shared scripts and styles are not automatically split. Source stays inert and originals are unchanged.');
  const goalLabel = node('label', 'What should the agents keep?');
  const goal = node('textarea');
  goal.maxLength = 600;
  goal.rows = 2;
  goal.placeholder = 'For example: retain the core ball and its controls; omit the documentation panels.';
  goalLabel.append(goal);
  const controls = node('div');
  controls.className = 'mod-inline-controls';
  const actions = node('div');
  actions.className = 'mod-inline-controls';
  const status = node('div', 'Open or edit HTML above, then deconstruct the draft. Only explicitly approved components are retained.');
  status.className = 'inline-status';
  status.setAttribute('role', 'status');
  const parts = node('div');
  const sourcePreview = node('pre');
  const library = node('details');
  library.className = 'component-library';
  const librarySummary = node('summary', 'Approved component library');
  const libraryEntries = node('div');
  library.append(librarySummary, libraryEntries);
  const sourceDetails = node('details');
  sourceDetails.append(node('summary', 'Exact selected source'), sourcePreview);
  sourceDetails.className = 'component-source-details';
  const receipt = node('pre');
  let document, reviewedSource, busy = false;
  const buttons = [];
  const call = (action, payload = {}) => invokeCommand('html_component_action', { action, payload });
  const selection = () => [...parts.querySelectorAll('input:checked')].map(input => input.value);
  const assertCurrent = () => {
    if (!document || getSource().source !== reviewedSource) throw new Error('The HTML draft changed. Deconstruct it again before using this selection.');
  };
  const payload = () => {
    assertCurrent();
    return { sourceSha256: document.sourceSha256, componentIds: selection() };
  };
  function syncControls() {
    for (const { element, ready } of buttons) element.disabled = busy || !ready();
    parts.querySelectorAll('input').forEach(input => { input.disabled = busy; });
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    syncControls();
    try { await task(); }
    catch (error) { status.textContent = typeof error === 'string' ? error : error.message; }
    finally { busy = false; syncControls(); }
  }
  function button(parent, title, task, ready = () => true) {
    const element = node('button', title);
    element.type = 'button';
    element.className = 'button secondary';
    element.addEventListener('click', () => void run(task));
    buttons.push({ element, ready });
    parent.append(element);
  }
  async function refreshLibrary() {
    let result;
    try { result = await call('library'); }
    catch (error) {
      libraryEntries.replaceChildren(node('p', typeof error === 'string' ? error : error.message));
      throw error;
    }
    librarySummary.textContent = `Approved component library (${result.entries.length}/20)`;
    libraryEntries.replaceChildren();
    if (!result.entries.length) libraryEntries.append(node('p', 'No retained components yet.'));
    for (const entry of result.entries) {
      const details = node('details');
      details.append(node('summary', `${entry.label} — ${entry.sourceName}:${entry.startLine}-${entry.endLine}`),
        node('p', `SHA-256 ${entry.sha256} · approved ${entry.savedAt}`), node('pre', entry.html));
      const forget = node('button', 'Forget component');
      forget.type = 'button';
      forget.addEventListener('click', () => void run(async () => {
        if (!window.confirm(`Forget retained ${entry.label}? Existing exported files are not deleted.`)) return;
        await call('forget', { id: entry.id, confirmed: true });
        await refreshLibrary();
        status.textContent = 'Approved component removed from the local library.';
      }));
      details.append(forget);
      libraryEntries.append(details);
    }
  }
  button(controls, 'DECONSTRUCT DRAFT', async () => {
    const current = getSource();
    const result = await call('import', current);
    if (getSource().source !== current.source) throw new Error('The draft changed during deconstruction. Try again.');
    document = result.document;
    reviewedSource = current.source;
    parts.replaceChildren();
    sourcePreview.textContent = '';
    for (const part of document.components) {
      const row = node('label');
      row.className = 'component-choice';
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      checkbox.value = part.id;
      checkbox.dataset.componentId = part.id;
      checkbox.addEventListener('change', () => { sourcePreview.textContent = ''; syncControls(); });
      row.append(checkbox, node('span', ` ${part.id} · ${part.label} · lines ${part.startLine}-${part.endLine} · ${part.bytes} bytes${part.parentId ? ` · nested in ${part.parentId}` : ''}${part.external ? ' · external reference (not fetched)' : ''}`));
      parts.append(row);
    }
    status.textContent = `${document.components.length} components. Select what to keep, or ask Genki for a proposal.`;
  }, () => Boolean(getSource().source.trim()));
  const hasSelection = () => Boolean(document && selection().length);
  button(controls, 'ASK GENKI TO SELECT', async () => {
    assertCurrent();
    status.textContent = 'Genki Builder is proposing necessary component IDs through the shared local model…';
    const result = await call('propose', { sourceSha256: document.sourceSha256, goal: goal.value });
    if (!result.ok) throw new Error(result.message);
    assertCurrent();
    const selected = new Set(result.proposal.components.map(part => part.id));
    parts.querySelectorAll('input').forEach(input => { input.checked = selected.has(input.value); });
    receipt.textContent = `${result.role} · ${result.modelId}\n${result.proposal.summary}\n${result.proposal.components.map(part => `${part.id}: ${part.reason}`).join('\n')}\nProposal only; review the exact selected source before approval.`;
    status.textContent = 'Agent selection proposed. Nothing retained or written yet.';
  }, () => Boolean(document && goal.value.trim()));
  async function previewSelection() {
    const result = await call('export', payload());
    assertCurrent();
    sourcePreview.textContent = result.html;
    sourceDetails.open = true;
    status.textContent = `${result.warning} Omitted component IDs: ${result.omitted.join(', ') || '(none)'}`;
    return result;
  }
  button(actions, 'REVIEW SELECTION', previewSelection, hasSelection);
  button(actions, 'APPROVE & KEEP', async () => {
    const selected = payload();
    const result = await previewSelection();
    if (!window.confirm(`Retain ${result.selected.length} exact source components in the local library?\n${result.selected.map(part => `${part.label} (${part.sha256})`).join('\n')}\nParents include all nested source. No source executes. Review the source preview before accepting.`)) return;
    await call('retain', { ...selected, confirmed: true });
    await refreshLibrary();
    status.textContent = 'Approved source components saved with fingerprints and line citations. Unselected source was not retained in the component library.';
  }, hasSelection);
  button(actions, 'SAVE REDUCED COPY', async () => {
    const result = await previewSelection();
    if (!window.confirm(`Export a separate reduced HTML copy containing ${result.selected.length} selected components? The original is unchanged. Scripts/external resources are disabled; functionality may require manual adaptation.`)) return;
    const saved = await invokeCommand('export_reduced_html_copy', {
      sourceSha256: document.sourceSha256, componentIds: selection()
    });
    status.textContent = saved.cancelled ? 'Save cancelled; no file written.'
      : `Reduced copy written: ${saved.file} (${saved.bytes} bytes). Original files were not overwritten.`;
  }, hasSelection);
  button(library, 'REFRESH LIBRARY', refreshLibrary);
  const reset = () => {
    document = null;
    reviewedSource = null;
    parts.replaceChildren();
    sourcePreview.textContent = '';
    receipt.textContent = '';
    syncControls();
  };
  button(actions, 'CLEAR REVIEW', async () => {
    if (!window.confirm('Clear this component review? The HTML editor, approved library and saved copies remain unchanged.')) return;
    const result = await call('discard', { confirmed: true });
    reset();
    status.textContent = result.message;
  }, () => Boolean(document));
  goal.addEventListener('input', syncControls);
  root.append(heading, caution, goalLabel, controls, status, parts, receipt, actions, sourceDetails, library);
  syncControls();
  return {
    refresh: () => void refreshLibrary().catch(() => {}),
    invalidate() { reset(); status.textContent = 'Draft updated. Deconstruct it to review reusable components.'; }
  };
}
