const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'app', file)).href);

test('dns providers are encrypted and well formed', async () => {
  const { DNS_PROVIDERS } = await load('internet.js');
  for (const provider of DNS_PROVIDERS.filter((entry) => entry.id !== 'system')) {
    assert.match(provider.doh, /^https:\/\//, provider.id);
    assert.equal(provider.ipv4.length, 2, provider.id);
    for (const ip of provider.ipv4) assert.match(ip, /^\d+\.\d+\.\d+\.\d+$/);
  }
});

test('internet plan is data only and never applied', async () => {
  const { buildInternetPlan, INTERNET_TWEAK_IDS } = await load('internet.js');
  const { plan, files } = buildInternetPlan({ providerId: 'mullvad' });
  assert.equal(plan.applied, false);
  assert.deepEqual(plan.tweaks, [...INTERNET_TWEAK_IDS]);
  assert.ok(files['Configuration/apply.yml'] && files['DNS-STEPS.txt'] && files['dns-plan.json']);
  assert.match(files['DNS-STEPS.txt'], /194\.242\.2\.2/);
  for (const content of Object.values(files)) assert.doesNotMatch(content, /powershell|netsh|cmd\.exe/i);
});

test('unknown provider and tweaks are rejected or ignored', async () => {
  const { buildInternetPlan, dnsProvider } = await load('internet.js');
  assert.throws(() => dnsProvider('evil'));
  const { plan } = buildInternetPlan({ providerId: 'system', tweakIds: ['dark-theme', 'doh-allowed'] });
  assert.deepEqual(plan.tweaks, ['doh-allowed']);
});
