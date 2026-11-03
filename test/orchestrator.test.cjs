const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { Orchestrator, validateRequest } = require('../assistant/orchestrator.cjs');
async function runner(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-orchestrator-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new Orchestrator({
    file: path.join(directory, 'history.json'),
    context: async () => ({ modelReady: true, modelId: 'local', fingerprint: 'a'.repeat(64) }),
    generate: async () => 'Bounded source proposal',
    saveProposal: async () => randomUUID(), ...overrides
  });
}
const request = { goal: 'Improve readability', maxCycles: 3, confirmed: true };
test('orchestrator accepts only bounded actions and rejects generic tool/admin authority', () => {
  assert.equal(validateRequest('start', request), true);
  for (const invalid of [{ ...request, confirmed: false }, { ...request, maxCycles: 4 }, { ...request, command: 'anything' }]) assert.equal(validateRequest('start', invalid), false);
  assert.equal(validateRequest('apply', {}), false);
  assert.equal(validateRequest('status', { admin: true }), false);
});
test('three serial cycles make exactly six model calls, finish without acknowledgements and reject concurrent start', async t => {
  let calls = 0, pending = 0;
  const service = await runner(t, { generate: async () => {
    assert.equal(++pending, 1); calls++;
    await new Promise(resolve => setImmediate(resolve));
    pending--; return 'Draft or review';
  } });
  await service.start(request);
  await assert.rejects(service.start(request), /already active/);
  await service.task;
  const status = await service.status();
  assert.equal(calls, 6);
  assert.equal(status.active, false);
  assert.equal(status.run.state, 'completed');
  assert.equal(status.events.filter(item => item.kind === 'proposal-saved').length, 3);
  const restarted = await runner(t, { file: service.file });
  assert.equal((await restarted.status()).active, false);
});
test('Stop during inference prevents subsequent calls, proposals and application', async t => {
  let release, entered, saves = 0, applies = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const inference = new Promise(resolve => { release = resolve; });
  const service = await runner(t, {
    generate: async () => { entered(); await inference; return 'draft'; },
    saveProposal: async () => { saves++; return randomUUID(); },
    applyDraft: async () => { applies++; return { changed: false }; }
  });
  await service.start(request);
  await started;
  await service.stop();
  release();
  await service.task;
  assert.equal(saves + applies, 0);
  assert.equal((await service.status()).run.state, 'stopped');
});
test('source changes, model errors, invalid history and expired budgets fail visibly', async t => {
  let contextCalls = 0;
  const changed = await runner(t, { context: async () => ({
    modelReady: true, modelId: 'local', fingerprint: (++contextCalls < 3 ? 'a' : 'b').repeat(64)
  }) });
  await changed.start(request); await changed.task;
  assert.match((await changed.status()).error, /changed/);
  const failed = await runner(t, { generate: async () => { throw new Error('model failed'); } });
  await failed.start(request); await failed.task;
  assert.match((await failed.status()).error, /model failed/);
  let clock = 100;
  const expired = await runner(t, { now: () => clock, generate: async () => { clock += 600001; return 'draft'; } });
  await expired.start(request); await expired.task;
  assert.match((await expired.status()).error, /budget/);
  const content = JSON.parse(await fs.readFile(changed.file, 'utf8'));
  content.events[0].message = 'tampered';
  await fs.writeFile(changed.file, JSON.stringify(content));
  await assert.rejects(changed.status(), /validation/);
});
