const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'app', 'consolidation.js')).href);

test('older agents fold into the agent that supersedes them', async () => {
  const { consolidate } = await load();
  const result = consolidate([
    { id: 'old', supersededBy: 'new' },
    { id: 'new' },
    { id: 'other' },
  ]);
  assert.deepEqual(result.active.map((a) => a.id), ['new', 'other']);
  assert.deepEqual(result.absorbed.get('new').map((a) => a.id), ['old']);
  assert.equal(result.redirect.get('old'), 'new');
});

test('chains resolve to the newest agent and `replaces` works from the successor', async () => {
  const { consolidate } = await load();
  const result = consolidate([
    { id: 'a', supersededBy: 'b' },
    { id: 'b', supersededBy: 'c' },
    { id: 'c' },
    { id: 'd', replaces: ['e'] },
    { id: 'e' },
  ]);
  assert.deepEqual(result.active.map((x) => x.id), ['c', 'd']);
  assert.equal(result.redirect.get('a'), 'c');
  assert.equal(result.redirect.get('e'), 'd');
});

test('cycles, self references and missing successors never hide an agent', async () => {
  const { consolidate } = await load();
  const result = consolidate([
    { id: 'x', supersededBy: 'y' },
    { id: 'y', supersededBy: 'x' },
    { id: 'z', supersededBy: 'z' },
    { id: 'w', supersededBy: 'ghost' },
  ]);
  assert.deepEqual(result.active.map((a) => a.id).sort(), ['w', 'x', 'y', 'z']);
  assert.equal(result.absorbed.size, 0);
});
