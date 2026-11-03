const assert = require('node:assert/strict');
const test = require('node:test');

test('cockpit counts real configured items without inventing offline kernel health', async () => {
  const { cockpitMetrics } = await import('../toolbox/cockpit-metrics.js');
  const offline = cockpitMetrics(null, [{}, {}, {}], [{}, {}]);
  assert.equal(offline.agents, 3);
  assert.equal(offline.workflows, 2);
  assert.equal(offline.health, 'OFFLINE');
  const connected = cockpitMetrics({ agents: [{}], tasks: [{}, {}], health: { one: 85, two: 97 }, ledgerValid: true }, [], [{}]);
  assert.equal(connected.agents, 1);
  assert.equal(connected.workflows, 3);
  assert.equal(connected.health, '85%');
  assert.match(connected.healthLabel, /verified/);
  assert.equal(cockpitMetrics({ health: { bad: Infinity, impossible: 101, negative: -1 } }, [], []).health, 'UNKNOWN');
});

test('receipt tickets deduplicate refreshes and reset display without changing ledger', async () => {
  const { createReceiptTickets } = await import('../toolbox/cockpit-metrics.js');
  const tickets = createReceiptTickets();
  const receipts = [{ seq: 1, hash: 'a' }, { seq: 2, hash: 'b' }];
  const original = JSON.stringify(receipts);
  assert.equal(tickets.update(receipts), 2);
  assert.equal(tickets.update(receipts), 2);
  assert.equal(tickets.reset(), 0);
  assert.equal(tickets.update(receipts), 0);
  assert.equal(tickets.update([...receipts, { seq: 3, hash: 'c' }]), 1);
  assert.equal(tickets.update([]), 1);
  assert.equal(JSON.stringify(receipts), original);
});
