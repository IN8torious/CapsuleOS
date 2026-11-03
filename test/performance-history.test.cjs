const assert = require('node:assert/strict');
const test = require('node:test');

test('resource history requires measured samples and compares only supported batch markers', async () => {
  const { createPerformanceHistory } = await import('../toolbox/performance-history.js');
  const history = createPerformanceHistory();
  const start = 1800000000000;
  for (let n = 0; n < 6; n++) history.add({ timestamp: start + n * 2000, cpuPercent: 60, memoryPercent: 70 });
  history.mark({ kind: 'apply', id: 'real-native-receipt', at: start + 11000 });
  for (let n = 0; n < 6; n++) history.add({ timestamp: start + 12000 + n * 2000, cpuPercent: 40, memoryPercent: 65 });
  const saved = history.snapshot();
  assert.equal(saved.changes[0].before.cpu, 60);
  assert.equal(saved.changes[0].after.cpu, 40);
  assert.equal(saved.changes[0].before.memory, 70);
  assert.equal(saved.changes[0].after.memory, 65);
  assert.equal(createPerformanceHistory(saved).snapshot().changes.length, 1);
  assert.throws(() => history.add({ timestamp: start, cpuPercent: NaN, memoryPercent: 1 }), /invalid/);
  assert.throws(() => history.mark({ kind: 'automatic-speedup', id: 'x', at: start }), /Invalid/);
});

test('resource history stays bounded, leaves warming-up CPU unknown and surfaces damaged stores', async () => {
  const { createPerformanceHistory, readPerformanceHistory, savePerformanceHistory } = await import('../toolbox/performance-history.js');
  const history = createPerformanceHistory();
  const start = 1800000000000;
  history.add({ timestamp: start, cpuPercent: null, memoryPercent: 50 });
  assert.equal(history.snapshot().minutes.length, 0);
  history.mark({ kind: 'rollback', id: 'no-baseline', at: start });
  assert.equal(history.snapshot().changes[0].before, null);
  for (let n = 0; n < 1600; n++) history.add({ timestamp: start + n * 60000, cpuPercent: 20, memoryPercent: 50 });
  assert.equal(history.snapshot().minutes.length, 1440);
  for (let n = 0; n < 30; n++) history.mark({ kind: 'apply', id: String(n), at: start + 1600 * 60000 });
  assert.equal(history.snapshot().changes.length, 20);
  assert.throws(() => readPerformanceHistory({ getItem: () => '{"version":99}' }), /invalid/);
  assert.throws(() => savePerformanceHistory(history, { setItem() { throw new Error('disk blocked'); } }), /blocked/);
});

test('comparisons distinguish percentage points, insufficient samples and a closed observation window', async () => {
  const { createPerformanceHistory, comparisonDeltas } = await import('../toolbox/performance-history.js');
  const history = createPerformanceHistory();
  const start = 1800000000000;
  for (let n = 0; n < 6; n++) history.add({ timestamp: start + n * 2000, cpuPercent: 60, memoryPercent: 40 });
  const marker = { kind: 'apply', id: 'verified-batch', at: start + 11000, ids: ['no-transparency'] };
  history.mark(marker);
  history.mark(marker);
  assert.equal(history.snapshot().changes.length, 1, 'a receipt must not be counted twice');
  for (let n = 0; n < 6; n++) history.add({ timestamp: start + 12000 + n * 2000, cpuPercent: 40, memoryPercent: 45 });
  let change = history.snapshot().changes[0];
  assert.equal(change.state, 'sampling');
  assert.equal(comparisonDeltas(change).cpu.delta, -20);
  assert.equal(comparisonDeltas(change).memory.delta, 5);
  history.add({ timestamp: start + 90000, cpuPercent: 99, memoryPercent: 99 });
  change = history.snapshot().changes[0];
  assert.equal(change.state, 'complete');
  assert.equal(change.after.cpu, 40, 'late samples must never enter the following-minute result');
  assert.deepEqual(change.ids, ['no-transparency']);
  assert.equal(comparisonDeltas({ before: change.before, after: null }), null);
  assert.equal(comparisonDeltas({ before: { ...change.before, samples: 4 }, after: change.after }), null);
});

test('new batches and reloads mark incomplete comparisons instead of waiting forever', async () => {
  const { createPerformanceHistory } = await import('../toolbox/performance-history.js');
  const history = createPerformanceHistory();
  const start = 1800000000000;
  history.mark({ kind: 'apply', id: 'first', at: start });
  history.mark({ kind: 'rollback', id: 'second', at: start + 1000 });
  assert.equal(history.snapshot().changes[0].state, 'interrupted');
  assert.equal(createPerformanceHistory(history.snapshot()).snapshot().changes[1].state, 'interrupted');
  assert.throws(() => history.mark({ kind: 'apply', id: 'bad', at: start, ids: ['not a setting'] }), /Invalid/);
});
