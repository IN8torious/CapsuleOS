const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Windows CI retains the actual stack, release gates and read-only manual execution', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'windows-build.yml'), 'utf8');
  for (const required of [
    'workflow_dispatch:', 'contents: read', 'runs-on: windows-2022',
    'npm ci', 'cargo test', '--locked', 'npm run prepare:models',
    'npm exec -- tauri build', 'design-audit.cjs --dark',
    'Get-FileHash', 'actions/upload-artifact@v4',
    'not the complete offline/AME distribution',
    "bundle\\msi", 'WindowsInstaller.Installer',
    'MSI is missing required application/runtime file',
    'MSI does not contain model weights'
  ]) assert.ok(workflow.includes(required), required);
  assert.doesNotMatch(workflow, /pull_request_target|contents: write|secrets\.|CiTool|Set-MpPreference|Disable-SmartAppControl/);
});
