import { APP_PACKS, scriptKit, downloadScriptKit, downloadScriptFile } from './script-kits.js';

const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
export function mountApps(root) {
  root.replaceChildren();
  const heading = node('div', undefined, 'page-heading');
  const intro = node('div');
  intro.append(node('div', 'CAPSULEOSv2 / APPS & SCRIPTS', 'eyebrow'), node('h1', 'Good apps. Real scripts.'),
    node('p', '13 curated packs. See every app, inspect the PowerShell, and take a complete installation kit with you.'));
  heading.append(intro); root.append(heading);
  const toolbar = node('div', undefined, 'apps-toolbar');
  const searchLabel = node('label', 'Find apps or packs');
  const search = node('input'); search.type = 'search'; search.placeholder = 'Search Firefox, developer, recovery...';
  searchLabel.append(search);
  const managerLabel = node('label', 'Package manager');
  const manager = node('select');
  for (const [value, label] of [['winget', 'Windows Package Manager (winget)'], ['chocolatey', 'Chocolatey (already installed)']]) {
    const option = node('option', label); option.value = value; manager.append(option);
  }
  managerLabel.append(manager); toolbar.append(searchLabel, managerLabel); root.append(toolbar);
  const summary = node('p', '', 'apps-status'); summary.setAttribute('role', 'status'); root.append(summary);
  const grid = node('div', undefined, 'apps-pack-grid'); root.append(grid);
  const detail = node('section', undefined, 'apps-details'); detail.hidden = true; root.append(detail);
  let selectedPack = null;
  function showPack(pack, scroll = true) {
    selectedPack = pack; detail.replaceChildren(); detail.hidden = false;
    detail.append(node('h2', pack.name), node('p', pack.role));
    const list = node('ul', undefined, 'apps-list');
    for (const app of pack.apps) {
      const item = node('li');
      item.append(node('strong', app.name), node('small', app.optional ? 'Optional extra - not installed by this script' : 'Included in this script'),
        node('small', `winget: ${app.winget || 'Not listed'} | Chocolatey: ${app.choco || 'Not listed'}`));
      list.append(item);
    }
    detail.append(list, node('h3', 'The scripts you will run'),
      node('p', 'Nothing runs in this page. The ZIP includes the selected entry script, the real install/uninstall scripts, shared helpers, catalog and recovery scripts. Unpack all files together. Review them before running PowerShell as administrator.'));
    const files = scriptKit({ packId: pack.id, manager: manager.value });
    const fileLabel = node('label', 'Inspect a script');
    const fileSelect = node('select'); fileSelect.setAttribute('aria-label', 'Script to inspect');
    for (const name of ['Run-Selected.ps1', ...Object.keys(files).filter(name => /\.(ps1|psm1)$/.test(name) && name !== 'Run-Selected.ps1')]) {
      const option = node('option', name); option.value = name; fileSelect.append(option);
    }
    fileLabel.append(fileSelect);
    const code = node('pre', files['Run-Selected.ps1'], 'apps-script'); code.tabIndex = 0;
    fileSelect.addEventListener('change', () => { code.textContent = files[fileSelect.value]; });
    const actions = node('div', undefined, 'apps-actions');
    const download = node('button', 'Download complete script ZIP', 'button primary'); download.type = 'button';
    const copy = node('button', 'Copy script', 'button secondary'); copy.type = 'button';
    const individual = node('button', 'Download this script', 'button quiet'); individual.type = 'button';
    const status = node('p', 'The selected manager must already be installed. Optional extras are not included.', 'apps-status'); status.setAttribute('role', 'status');
    download.addEventListener('click', () => {
      try { downloadScriptKit({ packId: pack.id, manager: manager.value }); status.textContent = 'Complete script kit downloaded. No apps were installed.'; }
      catch (error) { status.textContent = `Download failed: ${error.message}`; }
    });
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(files[fileSelect.value]); status.textContent = 'Script copied. Its required helpers are in the complete ZIP.'; }
      catch (error) { status.textContent = `Copy unavailable: ${error.message}. Use the script download instead.`; }
    });
    individual.addEventListener('click', () => downloadScriptFile(fileSelect.value.split('/').pop(), files[fileSelect.value]));
    actions.append(download, copy, individual); detail.append(fileLabel, code, actions, status);
    if (scroll) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function render() {
    grid.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const packs = APP_PACKS.packs.filter(pack => `${pack.name} ${pack.role} ${pack.apps.map(app => `${app.name} ${app.winget || ''} ${app.choco || ''}`).join(' ')}`.toLowerCase().includes(query));
    summary.textContent = `${packs.length} packs shown · ${APP_PACKS.packs.reduce((count, pack) => count + pack.apps.length, 0)} catalog entries · No automatic installs`;
    for (const pack of packs) {
      const card = node('article', undefined, 'apps-pack');
      const core = pack.apps.filter(app => !app.optional).length;
      const open = node('button', 'View apps & scripts', 'button secondary'); open.type = 'button';
      open.addEventListener('click', () => showPack(pack));
      card.append(node('h2', pack.name), node('p', pack.role), node('small', `${core} core apps · ${pack.apps.length - core} optional extras`), open);
      grid.append(card);
    }
    if (!packs.length) grid.append(node('p', 'No matching packs. Try another app name.'));
  }
  search.addEventListener('input', render);
  manager.addEventListener('change', () => { if (selectedPack) showPack(selectedPack, false); });
  render();
}
