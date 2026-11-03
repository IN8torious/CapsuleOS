const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const load = async () => ({
  ...(await import(pathToFileURL(path.join(__dirname, '..', 'toolbox', 'scene-ops.js')).href)),
  ...(await import(pathToFileURL(path.join(__dirname, '..', 'toolbox', 'scene-format.js')).href))
});

const object = (overrides = {}) => ({
  type: 'box', name: 'Crate', color: '#aabbcc', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], ...overrides
});
let n = 0;
const makeId = () => `new-${++n}`;

test('scene edits apply atomically and leave the original untouched', async () => {
  const { emptyScene, applyEdit } = await load();
  const scene = emptyScene('Demo');
  const edit = { format: 'capsule-scene-edit', version: 1, ops: [
    { op: 'add', object: object() },
    { op: 'scene', set: { background: '#112233' } }
  ] };
  const result = applyEdit(scene, edit, makeId);
  assert.equal(result.ok, true);
  assert.equal(result.scene.objects.length, 1);
  assert.equal(result.scene.background, '#112233');
  assert.equal(scene.objects.length, 0);

  const id = result.scene.objects[0].id;
  const second = applyEdit(result.scene, { format: 'capsule-scene-edit', version: 1, ops: [
    { op: 'update', id, set: { color: '#ff0000' } },
    { op: 'remove', id: 'missing' }
  ] }, makeId);
  assert.equal(second.ok, false);
  assert.equal(result.scene.objects[0].color, '#aabbcc');
});

test('scene edits reject unknown operations, extra fields and invalid results', async () => {
  const { emptyScene, applyEdit, MAX_OPS } = await load();
  const scene = emptyScene('Demo');
  const wrap = (ops) => ({ format: 'capsule-scene-edit', version: 1, ops });
  assert.equal(applyEdit(scene, wrap([{ op: 'run', cmd: 'whoami' }]), makeId).ok, false);
  assert.equal(applyEdit(scene, wrap([{ op: 'add', object: object({ url: 'http://x' }) }]), makeId).ok, false);
  assert.equal(applyEdit(scene, wrap([{ op: 'add', object: object({ scale: [0, 1, 1] }) }]), makeId).ok, false);
  assert.equal(applyEdit(scene, wrap([{ op: 'scene', set: { script: 'x' } }]), makeId).ok, false);
  assert.equal(applyEdit(scene, wrap([]), makeId).ok, false);
  assert.equal(applyEdit(scene, { ...wrap([{ op: 'scene', set: { name: 'x' } }]), extra: 1 }, makeId).ok, false);
  const tooMany = Array.from({ length: MAX_OPS + 1 }, () => ({ op: 'scene', set: { name: 'x' } }));
  assert.equal(applyEdit(scene, wrap(tooMany), makeId).ok, false);
});
