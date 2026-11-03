const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const AdmZip = require('adm-zip');

const hash = (content) => crypto.createHash('sha256').update(content).digest('hex');
const root = path.resolve(__dirname, '..');

for (const includeMsi of [false, true]) {
test(`${includeMsi ? 'MSI' : 'lean'} export delivers a verified APBX and ZIP with complete payload hashes`, () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-delivery-test-'));
  const run = (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result;
  };
  try {
    const output = path.join(folder, 'CapsuleOS-Playbook.apbx');
    // Inert bytes exercise archive integrity only, never MSI installation.
    const msi = path.join(folder, 'fixture.msi'), msiBytes = Buffer.from('inert MSI packaging fixture');
    fs.writeFileSync(msi, msiBytes);
    const exportArgs = [path.join(root, 'assistant', 'playbook-unified-export.mjs'), output,
      ...(includeMsi ? ['--msi', msi, '--msi-sha256', hash(msiBytes)] : [])];
    run(process.execPath, exportArgs);
    const zip = new AdmZip(path.join(folder, 'CapsuleOS-Playbook.zip'));
    assert.deepEqual(zip.getEntries().map(entry => entry.entryName).sort(),
      ['CapsuleOS-Playbook.apbx', 'Package-Managers/', 'Package-Managers/Capsule.Common.psm1',
        'Package-Managers/Install-CapsulePackageManager.ps1', 'Package-Managers/Install-Chocolatey.cmd',
        'Package-Managers/Install-WinGet.cmd', 'README.md', 'SHA256SUMS.txt', 'manifest.json']);
    assert.deepEqual(zip.readFile('CapsuleOS-Playbook.apbx'), fs.readFileSync(output));
    for (const line of zip.readAsText('SHA256SUMS.txt').trim().split('\n')) {
      const [expected, name] = line.split('  ');
      assert.equal(hash(zip.readFile(name)), expected, `ZIP checksum for ${name}`);
    }
    const extracted = path.join(folder, 'extracted');
    run('7z', ['x', '-pmalte', '-bso0', '-bsp0', `-o${extracted}`, output]);
    const manifest = JSON.parse(fs.readFileSync(path.join(extracted, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest, JSON.parse(zip.readAsText('manifest.json')));
    const payload = [];
    const visit = (directory, prefix = '') => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix + entry.name;
        if (entry.isDirectory()) visit(path.join(directory, entry.name), relative + '/');
        else if (relative !== 'manifest.json') payload.push(relative);
      }
    };
    visit(extracted);
    assert.deepEqual(Object.keys(manifest.files).sort(), payload.sort(), 'Every payload file must have a checksum');
    for (const [name, expected] of Object.entries(manifest.files)) {
      assert.equal(hash(fs.readFileSync(path.join(extracted, ...name.split('/')))), expected, name);
    }
    assert.equal(manifest.toolboxInstallerIncluded, includeMsi);
    assert.ok(payload.every(name => !/models\/|\.exe$/i.test(name)));
    if (includeMsi) {
      assert.deepEqual(fs.readFileSync(path.join(extracted, 'Executables', 'CapsuleToolbox.msi')), msiBytes);
      assert.equal(manifest.toolboxInstaller.sha256, hash(msiBytes));
      const readme = zip.readAsText('README.md');
      assert.match(readme, /Toolbox MSI/);
      assert.doesNotMatch(readme, /both approved local models are bundled|No AI models, Toolbox executable/);
      const conf = fs.readFileSync(path.join(extracted, 'playbook.conf'), 'utf8');
      assert.match(conf, /Install Capsule Toolbox for this computer \(MSI\)/);
      assert.doesNotMatch(conf, /both approved offline models/);
      const yaml = fs.readFileSync(path.join(extracted, 'Configuration', 'Tasks', 'apply.yml'), 'utf8');
      assert.match(yaml, /Install-CapsuleToolbox\.ps1/);
      assert.match(yaml, /option: "install-capsule-toolbox"/);
      const before = hash(fs.readFileSync(output));
      fs.writeFileSync(msi, 'tampered fixture');
      const refused = spawnSync(process.execPath, exportArgs, { encoding: 'utf8' });
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /SHA-256 mismatch/);
      assert.equal(hash(fs.readFileSync(output)), before);
      fs.writeFileSync(msi, msiBytes);
    }
    assert.ok(fs.statSync(output).size < 1024 * 1024, 'Lean playbook must stay below 1 MB');
    for (const browser of manifest.browsers) {
      const icon = fs.readFileSync(path.join(extracted, 'Images', `${browser}.png`));
      assert.equal(icon.readUInt32BE(16), 128);
      assert.equal(icon.readUInt32BE(20), 128);
    }
    if (process.platform === 'win32') {
      const command = `[xml]$conf = Get-Content -LiteralPath '${path.join(extracted, 'playbook.conf').replace(/'/g, "''")}' -Raw; if ($conf.Playbook.FeaturePages.RadioImagePage.Options.RadioImageOption.Count -ne 5) { throw 'Browser XML invalid' }`;
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')]);
      // Exercise the generated Windows PowerShell 5.1 boundary using a no-op restore stub.
      const stub = path.join(folder, 'restore-stub');
      fs.mkdirSync(stub);
      fs.writeFileSync(path.join(stub, 'Restore-CapsuleBaseline.ps1'),
        `[CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]\nparam([string[]]$Option)\nif ($PSCmdlet.ShouldProcess('test-only', 'restore')) { Write-Output "restored:$Option" }\n`);
      const yaml = fs.readFileSync(path.join(extracted, 'Configuration', 'Tasks', 'revert.yml'), 'utf8');
      const body = yaml.match(/command: >-\r?\n([\s\S]*?)    runas:/)[1]
        .split(/\r?\n/).map(line => line.trim()).join(' ');
      const wrapper = `Set-Location -LiteralPath '${stub.replace(/'/g, "''")}'; ${body}`;
      const restored = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(wrapper, 'utf16le').toString('base64')]);
      assert.match(restored.stdout, /restored:capsule-/);
    }
    // Exporting over an earlier delivery must work, not leave temporary archive candidates.
    run(process.execPath, exportArgs);
    assert.ok(fs.readdirSync(folder).every(name => !name.startsWith('.')));
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
}

test('MSI installation script parses and preserves failure, logging and no-restart boundaries', () => {
  const script = path.join(root, 'assistant', 'Install-CapsuleToolboxMsi.ps1');
  const source = fs.readFileSync(script, 'utf8');
  for (const required of ['Get-FileHash', 'SHA256', '/qn /norestart /L*v', '@(0, 3010)', 'ComponentPath',
    'capsule_toolbox.exe', 'node.exe', 'toolbox-runtime.cjs', 'Receipts', 'WindowsIdentity']) {
    assert.ok(source.includes(required), required);
  }
  assert.doesNotMatch(source, /Win32_Product|Restart-Computer|Start-Process.*CapsuleToolboxSetup/);
  if (process.platform === 'win32') {
    const command = `$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('${script.replace(/'/g, "''")}', [ref]$null, [ref]$errors) | Out-Null; if ($errors.Count) { throw ($errors | Out-String) }`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
