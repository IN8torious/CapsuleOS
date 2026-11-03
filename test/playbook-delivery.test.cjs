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

test('lean export delivers a verified APBX and ZIP with complete payload hashes', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-delivery-test-'));
  const run = (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result;
  };
  try {
    const output = path.join(folder, 'CapsuleOS-Playbook.apbx');
    run(process.execPath, [path.join(root, 'assistant', 'playbook-unified-export.mjs'), output]);
    const zip = new AdmZip(path.join(folder, 'CapsuleOS-Playbook.zip'));
    assert.deepEqual(zip.getEntries().map(entry => entry.entryName).sort(),
      ['CapsuleOS-Playbook.apbx', 'README.md', 'SHA256SUMS.txt', 'manifest.json']);
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
    assert.equal(manifest.toolboxInstallerIncluded, false);
    assert.ok(payload.every(name => !/models\/|\.exe$/i.test(name)));
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
    run(process.execPath, [path.join(root, 'assistant', 'playbook-unified-export.mjs'), output]);
    assert.ok(fs.readdirSync(folder).every(name => !name.startsWith('.')));
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
