import { CATEGORIES, PRESETS, TWEAKS, buildPlaybook, needsAdmin } from '../app/playbook.js';
import { createZip } from '../app/zip.js';
import { downloadScriptKit } from './script-kits.js';
import playbookIconUrl from '../assets/capsule-playbook-icon.png?url';
import { attachTweakActions } from './tweak-actions.js';
import { addApprovedTweak, readTweakLibrary, removeApprovedTweak, requestSupportedTweakApproval } from './tweak-library.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountPlaybook(root, { windows = false } = {}) {
  const selected = new Set(windows ? [] : PRESETS[0].tweakIds);
  let category = 'all';

  root.replaceChildren();
  const heading = el('div', 'page-heading');
  const headText = el('div');
  headText.append(el('div', 'eyebrow', 'CAPSULE OS / FIXED WINDOWS CATALOG'), el(windows ? 'h2' : 'h1', '', windows ? 'Windows tweak groups' : 'Tweak+.'),
    el('p', '', 'Expand a group to review individual tweaks. Approval adds supported proposals to your personal Tweak+ list; it never applies them. Applying still requires exact-value review, confirmation and UAC. Unknown ideas remain review-only.'));
  heading.append(headText);

  const presetRow = el('div', 'pb-row');
  const tabRow = el('div', 'pb-row');
  const grid = el('div', 'pb-grid');
  grid.classList.add('grouped-tweak-catalog');
  const personal = el('div', 'personal-tweak-library');
  const bar = el('div', 'pb-bar glass-bezel');
  const counter = el('span', 'pb-count');
  const status = el('span', 'inline-status');
  status.setAttribute('role', 'status');
  const exportButton = el('button', 'primary-button', 'Export source zip');
  bar.append(counter, status, exportButton);
  attachTweakActions(bar, status, () => [...selected]);

  function renderPresets() {
    presetRow.replaceChildren();
    for (const preset of PRESETS) {
      const chip = el('button', 'pb-chip', preset.title);
      chip.title = preset.description;
      chip.addEventListener('click', () => {
        selected.clear();
        preset.tweakIds.forEach((id) => selected.add(id));
        render();
      });
      presetRow.append(chip);
    }
  }

  function renderTabs() {
    tabRow.replaceChildren();
    const label = el('label', 'pb-directory-label', 'Settings directory');
    const directory = el('select', 'pb-directory');
    directory.setAttribute('aria-label', 'Settings category');
    for (const [id, label] of [['all', 'All groups'], ['approved', 'My approved supported tweaks'], ...Object.entries(CATEGORIES)]) {
      const option = el('option', '', label);
      option.value = id;
      option.selected = id === category;
      directory.append(option);
    }
    directory.addEventListener('change', () => { category = directory.value; render(); });
    label.append(directory);
    tabRow.append(label);
  }

  function renderGrid() {
    const openGroups = new Set([...grid.querySelectorAll('.tweak-category-group[open]')].map(group => group.dataset.category));
    grid.replaceChildren();
    let approved;
    try { approved = new Set(readTweakLibrary().filter(item => item.tweakId).map(item => item.tweakId)); }
    catch (error) { status.textContent = error.message; return; }
    for (const [groupId, name] of Object.entries(CATEGORIES)) {
      const entries = TWEAKS.filter(item => item.category === groupId &&
        (category === 'all' || category === 'approved' && approved.has(item.id) || category === groupId));
      if (!entries.length) continue;
      const group = el('details', 'tweak-category-group');
      group.dataset.category = groupId;
      group.open = category !== 'all' || openGroups.has(groupId);
      group.append(el('summary', '', `${name} · ${entries.length} tweaks`));
      const cards = el('div', 'tweak-category-cards');
    for (const entry of entries) {
      const card = el('article', `pb-card${selected.has(entry.id) ? ' on' : ''}`);
      const choice = el('label', 'tweak-choice');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = selected.has(entry.id);
      box.addEventListener('change', () => {
        if (box.checked) selected.add(entry.id); else selected.delete(entry.id);
        render();
      });
      const body = el('div');
      const badges = el('div', 'pb-badges');
      badges.append(el('span', `risk-${entry.risk}`, entry.risk.toUpperCase()));
      if (needsAdmin(entry)) badges.append(el('span', '', 'ADMIN'));
      body.append(el('strong', '', entry.title), el('small', '', entry.description), badges);
      choice.append(box, body);
      const exact = el('details', 'setting-evidence');
      exact.append(el('summary', '', 'Fixed registry values'));
      for (const value of entry.values) exact.append(el('code', '', `${value.root}\\${value.path}\\${value.name} = ${value.apply} (${value.type})`));
      const approve = el('button', 'button quiet', approved.has(entry.id) ? 'IN TWEAK+' : 'APPROVE TO TWEAK+');
      approve.type = 'button';
      approve.disabled = approved.has(entry.id);
      approve.addEventListener('click', () => {
        try { status.textContent = requestSupportedTweakApproval(entry.id, entry.description); }
        catch (error) { status.textContent = error.message; }
      });
      card.append(choice, exact, approve);
      cards.append(card);
    }
      group.append(cards);
      grid.append(group);
    }
    if (!grid.childElementCount) grid.append(el('p', 'mod-caution', 'No supported tweaks have been approved yet. Approve an individual catalog item or a Performance advisor proposal to add it here.'));
  }

  function renderPersonal() {
    personal.replaceChildren();
    if (windows) return;
    personal.append(el('h2', '', 'Your approved proposals'));
    try {
      const entries = readTweakLibrary();
      if (!entries.length) personal.append(el('p', 'mod-caution', 'No personal proposals yet. Catalog selections below are not approvals or applied settings.'));
      for (const entry of entries) {
        const card = el('article', 'approved-lesson');
        card.append(el('strong', '', entry.title), el('small', '', entry.tweakId ? 'SUPPORTED CATALOG ITEM · NOT AUTOMATICALLY APPLIED' : 'REVIEW ONLY · NO EXECUTABLE CATALOG ENTRY'),
          el('p', '', entry.reason), el('small', '', `Approved ${new Date(entry.approvedAt).toLocaleString()}`));
        const remove = el('button', 'button quiet', 'REMOVE FROM LIST');
        remove.type = 'button';
        remove.addEventListener('click', () => {
          if (!window.confirm('Remove this proposal from Tweak+? This does not undo any applied Windows setting.')) return;
          try { removeApprovedTweak(entry.id); status.textContent = 'Removed from the list. No Windows settings were changed.'; }
          catch (error) { status.textContent = error.message; }
        });
        card.append(remove);
        personal.append(card);
      }
    } catch (error) { status.textContent = error.message; }
  }

  function render() {
    renderTabs();
    renderGrid();
    const picked = TWEAKS.filter((entry) => selected.has(entry.id));
    counter.textContent = `${picked.length} of ${TWEAKS.length} selected${picked.some(needsAdmin) ? ' · needs admin' : ''}`;
    exportButton.disabled = picked.length === 0;
  }

  exportButton.addEventListener('click', async () => {
    try {
      const { files, manifest } = buildPlaybook({ tweakIds: TWEAKS.filter((entry) => selected.has(entry.id)).map((entry) => entry.id) });
      const iconResponse = await fetch(playbookIconUrl);
      if (!iconResponse.ok) throw new Error('Could not load the Capsule playbook icon.');
      files['playbook.png'] = new Uint8Array(await iconResponse.arrayBuffer());
      const url = URL.createObjectURL(new Blob([createZip(files)], { type: 'application/zip' }));
      const link = el('a');
      link.href = url;
      link.download = 'CapsuleOS-playbook-source.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = `Exported ${manifest.tweaks.length} selected tweaks and the Capsule icon as a source zip. This source-only export does not include the Toolbox installer. For an AME Wizard package with all selectable settings and the optional Toolbox install choice, use npm run export:apbx. Nothing was applied.`;
    } catch (error) {
      status.textContent = error.message;
    }
  });
  const scriptButton = el('button', 'button secondary', 'Download PowerShell scripts');
  scriptButton.type = 'button';
  scriptButton.addEventListener('click', () => {
    try {
      downloadScriptKit({ tweakIds: [...selected] });
      status.textContent = 'Downloaded actual PowerShell scripts with the selected settings, exact-baseline recovery and a Run-Selected.ps1 entry script. Nothing was applied.';
    } catch (error) { status.textContent = `Script export failed: ${error.message}`; }
  });
  exportButton.after(scriptButton);

  const idea = el('form', 'review-only-tweak-form');
  if (!windows) {
    idea.append(el('h2', '', 'Save a review-only tweak idea'));
    const nameLabel = el('label', '', 'Idea title');
    const name = el('input'); name.maxLength = 120; name.required = true; nameLabel.append(name);
    const reasonLabel = el('label', '', 'Evidence or proposed benefit (no executable registry paths or commands are added)');
    const reason = el('textarea'); reason.maxLength = 600; reason.required = true; reasonLabel.append(reason);
    const save = el('button', 'button secondary', 'APPROVE REVIEW-ONLY IDEA'); save.type = 'submit';
    idea.append(nameLabel, reasonLabel, save);
    idea.addEventListener('submit', event => {
      event.preventDefault();
      if (!window.confirm('Save this idea as review-only? It cannot be applied until a supported native entry is separately implemented and validated.')) return;
      try { addApprovedTweak({ title: name.value, reason: reason.value, confirmed: true }); idea.reset(); status.textContent = 'Review-only idea saved. It has no executable settings action.'; }
      catch (error) { status.textContent = error.message; }
    });
  }
  root.append(heading, personal);
  if (!windows) { root.append(idea, presetRow); renderPresets(); }
  root.append(tabRow, grid, bar);
  exportButton.hidden = windows;
  const updateLibrary = () => { renderPersonal(); renderGrid(); };
  window.addEventListener('capsule-tweak-library', updateLibrary);
  window.addEventListener('storage', updateLibrary);
  renderPersonal();
  render();
}
