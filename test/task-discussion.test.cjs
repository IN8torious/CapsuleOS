const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'task-discussion.js')).href);

test('agent discussion contains explicit potential gains, losses and evidence limits', async () => {
  const { createPerformanceDiscussion } = await load();
  const thread = createPerformanceDiscussion('gaming', [{
    tweakId: 'no-game-dvr', title: 'Turn off Game DVR capture', benefit: 'Potential capture savings',
    tradeoff: 'Recording unavailable', measure: 'Compare frame times', risk: 'low',
    evidence: [{ before: null }], unsetValues: 1,
  }], 100);
  assert.equal(thread.decision, 'pending');
  assert.equal(thread.createdAt, 100);
  assert.deepEqual(thread.messages.map((m) => m.speaker), ['Corvus', 'Veda', 'Gaven']);
  assert.equal(thread.messages[0].gain, 'Potential capture savings');
  assert.equal(thread.messages[0].loss, 'Recording unavailable');
  assert.match(thread.messages[1].text, /not a measured performance result/);
  assert.match(thread.messages[2].text, /administrator approval/);
});

test('discussion decisions are explicit non-executing user directions', async () => {
  const { createPerformanceDiscussion, decideDiscussion } = await load();
  const original = createPerformanceDiscussion('responsiveness', [], 100);
  for (const decision of ['review', 'defer', 'dismiss']) {
    assert.equal(decideDiscussion(original, decision).decision, decision);
  }
  assert.equal(original.decision, 'pending');
  assert.throws(() => decideDiscussion(original, 'execute'), /Unsupported/);
});

test('user proposals route within a fixed settings scope rather than becoming commands', async () => {
  const { routePerformanceIntent, createUserDiscussion } = await load();
  assert.equal(routePerformanceIntent('Make my laptop faster on battery'), 'laptop-battery');
  assert.equal(routePerformanceIntent('Better gaming while plugged in'), 'laptop-ac');
  assert.equal(routePerformanceIntent('Less background activity'), 'background');
  assert.equal(routePerformanceIntent('Disable Defender to boost fps'), null);
  assert.equal(routePerformanceIntent('Run this arbitrary script'), null);
  assert.throws(() => routePerformanceIntent(''), /1-240/);
  const thread = createUserDiscussion('<script>not executable</script>', 'Choose a supported direction', 100);
  assert.equal(thread.goal, null);
  assert.equal(thread.decision, 'needs-scope');
  assert.equal(thread.messages[0].text, '<script>not executable</script>');
});
