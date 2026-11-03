const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../app/learning.js');
const start = 1_000_000;

async function eligible() {
  const L = await load(), ledger = L.emptyLedger();
  L.setLearningEnabled(ledger, true);
  for (let i = 0; i < 3; i++) L.recordSignal(ledger, 'agent:a', 'Alpha', start + i * L.SIGNAL_COOLDOWN_MS);
  L.runCycle(ledger, start + 2 * L.SIGNAL_COOLDOWN_MS);
  return { L, ledger };
}

test('usage collection is opt-in and rapid clicks cannot manufacture eligibility', async () => {
  const L = await load(), ledger = L.emptyLedger();
  L.recordSignal(ledger, 'agent:a', 'Alpha', start);
  assert.deepEqual(ledger.signals, {});
  L.setLearningEnabled(ledger, true);
  for (let i = 0; i < 50; i++) L.recordSignal(ledger, 'agent:a', 'Alpha', start + i);
  assert.equal(ledger.signals['agent:a'].count, 1);
  assert.deepEqual(L.runCycle(ledger, start + 100), []);
});

test('spaced use produces an explicitly labeled organization suggestion, not knowledge', async () => {
  const { L, ledger } = await eligible();
  assert.equal(ledger.ideas.length, 1);
  assert.equal(ledger.ideas[0].evidence.count, 3);
  assert.match(ledger.ideas[0].reason, /not proven knowledge/);
  assert.equal(L.dueForCycle(ledger, start + 50 * L.CYCLE_MS), false, 'idle time must not trigger more cycles');
  assert.deepEqual(L.runCycle(ledger, start + 50 * L.CYCLE_MS), []);
  assert.equal(ledger.cycles, 1);
});

test('decisions require existing proposals, persist evidence and support forgetting', async () => {
  const { L, ledger } = await eligible();
  assert.throws(() => L.resolveIdea(ledger, 'unknown', true), /existing idea/);
  assert.deepEqual(ledger.accepted, {});
  L.resolveIdea(ledger, 'kernel:agent:a', true, start + L.CYCLE_MS);
  assert.equal(ledger.kernels.length, 1);
  assert.equal(ledger.kernels[0].name, 'Alpha workspace');
  assert.equal(ledger.kernels[0].evidence.type, 'local-usage');
  assert.throws(() => L.resolveIdea(ledger, 'kernel:agent:a', true), /existing idea/);
  assert.deepEqual(L.parseLedger(JSON.stringify(ledger)), ledger);
  L.forgetPlanet(ledger, 'kernel:agent:a');
  assert.equal(ledger.kernels.length, 0);
  L.recordSignal(ledger, 'agent:a', 'Alpha', start + 2 * L.CYCLE_MS);
  assert.deepEqual(L.runCycle(ledger, start + 2 * L.CYCLE_MS), []);
});

test('dismissed ideas stay dismissed and disabled learning never cycles', async () => {
  const { L, ledger } = await eligible();
  L.resolveIdea(ledger, 'kernel:agent:a', false);
  L.recordSignal(ledger, 'agent:a', 'Alpha', start + L.CYCLE_MS);
  assert.deepEqual(L.runCycle(ledger, start + L.CYCLE_MS), []);
  L.setLearningEnabled(ledger, false);
  const revision = ledger.revision;
  L.recordSignal(ledger, 'agent:b', 'Beta', start + 2 * L.CYCLE_MS);
  assert.equal(ledger.revision, revision);
  assert.equal(L.dueForCycle(ledger, start + 2 * L.CYCLE_MS), false);
});

test('expired signals reset evidence and collection is bounded', async () => {
  const L = await load(), ledger = L.emptyLedger();
  L.setLearningEnabled(ledger, true);
  L.recordSignal(ledger, 'agent:a', 'Alpha', start);
  const later = start + L.SIGNAL_EXPIRY_MS + 1;
  L.recordSignal(ledger, 'agent:a', 'Alpha', later);
  assert.equal(ledger.signals['agent:a'].count, 1);
  assert.equal(ledger.signals['agent:a'].first, later);
  for (let i = 0; i < 250; i++) L.recordSignal(ledger, `workspace:${i}`, `Workspace ${i}`, later + i);
  assert.equal(Object.keys(ledger.signals).length, 200);
  assert.throws(() => L.recordSignal(ledger, '__proto__', 'Bad', later), /bounded/);
});

test('legacy history migrates without consent or invented verified knowledge', async () => {
  const L = await load();
  const legacy = { signals: { 'agent:a': { label: 'Alpha', count: 6, last: start } }, ideas: [],
    kernels: [{ id: 'kernel:agent:a', name: 'Alpha kernel', detail: 'Learned from use.', createdAt: start }],
    accepted: { 'kernel:agent:a': true }, rejected: {}, lastCycle: start, cycles: 1 };
  const migrated = L.parseLedger(JSON.stringify(legacy));
  assert.equal(migrated.enabled, false);
  assert.match(migrated.kernels[0].detail, /not verified knowledge/);
  assert.equal(migrated.signals['agent:a'].first, start);
  assert.throws(() => L.parseLedger('{"signals":[]}'), /unsupported/);
  assert.throws(() => L.parseLedger('not json'));
});

test('decision receipt segments stay verifiable after bounded truncation and detect edits', async () => {
  const L = await load(), ledger = L.emptyLedger();
  for (let i = 0; i < 240; i++) L.setLearningEnabled(ledger, !ledger.enabled);
  assert.equal(ledger.receipts.length, 200);
  assert.equal(ledger.receipts.at(-1).seq, 240);
  assert.deepEqual(L.parseLedger(JSON.stringify(ledger)), ledger);
  ledger.receipts[10].event = 'Changed approval';
  assert.throws(() => L.parseLedger(JSON.stringify(ledger)), /inconsistent/);
});
