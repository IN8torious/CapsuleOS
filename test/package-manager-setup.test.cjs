const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('one-click manager setup uses official fixed sources and preserves security settings', () => {
  const script = path.join(root, 'playbook', 'scripts', 'Install-CapsulePackageManager.ps1');
  const source = fs.readFileSync(script, 'utf8');
  for (const required of ['SupportsShouldProcess', "ValidateSet('winget', 'chocolatey')",
    '-Verb RunAs', 'Microsoft.WinGet.Client', 'Repair-WinGetPackageManager -AllUsers',
    '--id chocolatey.chocolatey --exact --source winget', 'Write-CapsuleReceipt',
    'https://www.powershellgallery.com/api/v2', '--version']) assert.ok(source.includes(required), required);
  assert.doesNotMatch(source, /Set-ExecutionPolicy|Set-PSRepository|Invoke-Expression|DownloadString|CiTool|Set-MpPreference/);
  for (const [file, manager] of [['Install-WinGet.cmd', 'winget'], ['Install-Chocolatey.cmd', 'chocolatey']]) {
    const launcher = fs.readFileSync(path.join(root, 'playbook', 'scripts', file), 'utf8');
    assert.ok(launcher.includes(`-Manager ${manager}`));
    assert.match(launcher, /if errorlevel 1/);
    assert.doesNotMatch(launcher, /ExecutionPolicy/i);
  }
  if (process.platform === 'win32') {
    const command = `$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('${script.replace(/'/g, "''")}', [ref]$null, [ref]$errors) | Out-Null; if ($errors.Count) { throw ($errors | Out-String) }`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
      { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('manager setup is unchecked and runs before browser or app installation', async () => {
  const { buildPlaybook } = await import('../app/playbook.js');
  const { files } = buildPlaybook({ unified: true, packCatalog: require('../playbook/packs.catalog.json') });
  const yaml = files['Configuration/Tasks/apply.yml'];
  for (const manager of ['winget', 'chocolatey']) {
    assert.ok(yaml.indexOf(`-Manager ${manager}`) > yaml.indexOf('Start-CapsuleSession.ps1'));
    assert.ok(yaml.indexOf(`-Manager ${manager}`) < yaml.indexOf('-Browser edge'));
    assert.match(files['playbook.conf'], new RegExp(`<CheckboxOption IsChecked="false">\\s*<Text>[^<]+</Text>\\s*<Name>install-manager-${manager}</Name>`));
  }
});
