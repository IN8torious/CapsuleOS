import catalog from '../playbook/packs.catalog.json';
import { TWEAKS, capsuleTargets } from '../app/playbook.js';
import { createZip } from '../app/zip.js';

const sources = import.meta.glob('../playbook/scripts/**/*', { query: '?raw', import: 'default', eager: true });
export const SCRIPT_FILES = Object.fromEntries(Object.entries(sources).map(([name, text]) => [name.split('/scripts/')[1], text]));
export { catalog as APP_PACKS };

export function scriptKit({ packId, manager = 'winget', tweakIds = [] } = {}) {
  if (!['winget', 'chocolatey'].includes(manager)) throw new Error('Choose winget or Chocolatey.');
  if (!Array.isArray(tweakIds) || tweakIds.some(id => !TWEAKS.some(tweak => tweak.id === id))) throw new Error('Unknown fixed tweak.');
  if (packId && !catalog.packs.some(pack => pack.id === packId)) throw new Error('Choose a listed app pack.');
  if (!packId && !tweakIds.length) throw new Error('Choose a pack or at least one setting.');
  const command = packId
    ? `& (Join-Path $PSScriptRoot 'Start-CapsuleSession.ps1')\n& (Join-Path $PSScriptRoot 'Install-CapsulePack.ps1') -Pack '${packId}' -Manager '${manager}'`
    : `& (Join-Path $PSScriptRoot 'Apply-CapsuleTweaks.ps1') -Option @(${tweakIds.map(id => `'capsule-${id}'`).join(', ')})`;
  const entry = `# CapsuleOSv2 - extract the complete ZIP before running this script.\n# Review the files, then use an elevated Windows PowerShell window.\n$ErrorActionPreference = 'Stop'\n${command}\n`;
  return {
    ...SCRIPT_FILES,
    'Run-Selected.ps1': entry,
    'packs.catalog.json': JSON.stringify(catalog, null, 2),
    'capsule-targets.json': JSON.stringify(capsuleTargets(TWEAKS, true), null, 2),
    'README.txt': 'CapsuleOSv2 script kit\r\n\r\nExtract ALL files together. Review Run-Selected.ps1 and its fixed helper scripts.\r\nOpen Windows PowerShell as administrator in this folder, then run:\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\Run-Selected.ps1\r\n\r\nNo scripts run from the Toolbox UI. Installers require internet and an existing package manager.\r\nOptional app extras are listed but not installed. Start-CapsuleSession requires a restore point.\r\nTo preview registry restoration: .\\Restore-CapsuleBaseline.ps1 -WhatIf\r\nTo preview a pack uninstall: .\\Uninstall-CapsulePack.ps1 -Pack <pack-id> -WhatIf\r\nUse the same Windows account. Real elevated acceptance is still required.\r\n',
  };
}
export function downloadScriptKit(options) {
  const files = scriptKit(options);
  downloadScriptFile(`CapsuleOSv2-${options.packId || 'Windows-settings'}-scripts.zip`, createZip(files), 'application/zip');
  return files;
}
export function downloadScriptFile(name, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
