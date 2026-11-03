const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'app', file)).href);
const rust = fs.readFileSync(path.join(__dirname, '..', 'src-tauri', 'src', 'repair.rs'), 'utf8');

test('every repair task and fix id exists in the Rust allowlist', async () => {
  const { REPAIR_TASKS, SECURITY_FIXES } = await load('repair.js');
  for (const task of REPAIR_TASKS) assert.ok(rust.includes(`"${task.id}"`), task.id);
  for (const fix of SECURITY_FIXES) assert.ok(rust.includes(`"${fix.id}"`), fix.id);
});

test('repair commands are fixed and never disable protections', () => {
  assert.doesNotMatch(rust, /DisableRealtimeMonitoring \$true|Enabled False|EnableLUA -Value 0/);
  assert.doesNotMatch(rust, /format!\([^)]*task_id|format!\([^)]*fix_id/);
});

test('security findings flag only what is actually off', async () => {
  const { securityFindings } = await load('repair.js');
  const healthy = securityFindings({ firewall: [{ enabled: true }], defenderRealtime: true, signatureAgeDays: 1, uacEnabled: true });
  assert.equal(healthy.filter((f) => f.needed).length, 0);
  const bad = securityFindings({ firewall: [{ enabled: false }], defenderRealtime: false, signatureAgeDays: 9, uacEnabled: false });
  assert.deepEqual(bad.filter((f) => f.needed).map((f) => f.id).sort(), ['defender-realtime-on', 'defender-update', 'firewall-on', 'uac-on']);
});
