const assert = require('node:assert/strict');
const test = require('node:test');

test('proposal notifications count pending history only and sort without mutating saved records', async () => {
  const { proposalSummary, proposalHistory } = await import('../toolbox/proposal-notifications.js');
  const proposals = [
    { id: 'a', status: 'pending', createdAt: 100 },
    { id: 'b', status: 'reviewed', createdAt: 300 },
    { id: 'c', status: 'dismissed', createdAt: 200 },
    { id: 'd', status: 'pending', createdAt: 400 }
  ];
  assert.equal(proposalSummary(proposals).pending, 2);
  assert.equal(proposalSummary(proposals).badge, '2');
  assert.deepEqual(proposalHistory(proposals).map(item => item.id), ['d', 'b', 'c', 'a']);
  assert.deepEqual(proposalHistory(proposals, 'pending').map(item => item.id), ['d', 'a']);
  assert.deepEqual(proposals.map(item => item.id), ['a', 'b', 'c', 'd']);
  assert.equal(proposalSummary(Array.from({ length: 100 }, () => ({ status: 'pending' }))).badge, '99+');
  assert.equal(proposalSummary([]).pending, 0);
  assert.throws(() => proposalHistory(proposals, 'unknown'), /supported/);
});

test('apps-grid and bell badges stay synchronized, including unavailable and cleared states', async () => {
  const { syncProposalNotifications } = await import('../toolbox/proposal-notifications.js');
  const nodes = new Map();
  for (const id of ['directory-proposal-count', 'header-proposal-count', 'agent-proposal-nav-count', 'proposal-notifications', 'directory-toggle']) {
    nodes.set(id, { setAttribute(key, value) { this[key] = value; } });
  }
  const document = { getElementById: id => nodes.get(id), querySelector: selector => nodes.get(selector.slice(1)) };
  syncProposalNotifications(document, [{ status: 'pending' }, { status: 'reviewed' }]);
  assert.equal(nodes.get('directory-proposal-count').textContent, '1');
  assert.equal(nodes.get('header-proposal-count').textContent, '1');
  assert.match(nodes.get('directory-toggle')['aria-label'], /1 pending/);
  syncProposalNotifications(document, [], true);
  assert.equal(nodes.get('header-proposal-count').textContent, '!');
  assert.equal(nodes.get('header-proposal-count').hidden, false);
  syncProposalNotifications(document, []);
  assert.equal(nodes.get('header-proposal-count').hidden, true);
  assert.equal(nodes.get('directory-proposal-count').hidden, true);
});
