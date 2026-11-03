const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'toolbox', 'scene-format.js')).href);

function sampleObject(overrides = {}) {
  return {
    id: 'a1', type: 'box', name: 'Crate', color: '#AABBCC',
    position: [0, 0.5, 0], rotation: [0, 45, 0], scale: [1, 1, 1], ...overrides
  };
}

test('scene format round-trips a valid scene and normalizes colors', async () => {
  const { emptyScene, parseSceneFile } = await load();
  const scene = { ...emptyScene('Demo'), objects: [sampleObject()] };
  const result = parseSceneFile(JSON.stringify(scene));
  assert.equal(result.ok, true);
  assert.equal(result.scene.objects[0].color, '#aabbcc');
});

test('scene format rejects code-like extras, bad shapes and out-of-range values', async () => {
  const { emptyScene, validateScene, parseSceneFile, MAX_OBJECTS } = await load();
  const base = emptyScene('Demo');
  assert.equal(validateScene({ ...base, script: 'alert(1)' }).ok, false);
  assert.equal(validateScene({ ...base, objects: [sampleObject({ onload: 'x' })] }).ok, false);
  assert.equal(validateScene({ ...base, objects: [sampleObject({ type: 'mesh-from-url' })] }).ok, false);
  assert.equal(validateScene({ ...base, objects: [sampleObject({ position: [1e9, 0, 0] })] }).ok, false);
  assert.equal(validateScene({ ...base, objects: [sampleObject({ scale: [0, 1, 1] })] }).ok, false);
  assert.equal(validateScene({ ...base, objects: [sampleObject({ color: 'url(x)' })] }).ok, false);
  assert.equal(validateScene({ ...base, objects: [sampleObject(), sampleObject()] }).ok, false);
  assert.equal(validateScene({ ...base, objects: [sampleObject({ position: [NaN, 0, 0] })] }).ok, false);
  const many = Array.from({ length: MAX_OBJECTS + 1 }, (_, i) => sampleObject({ id: `o${i}` }));
  assert.equal(validateScene({ ...base, objects: many }).ok, false);
  assert.equal(parseSceneFile('{not json').ok, false);
  assert.equal(parseSceneFile('x'.repeat(300 * 1024)).ok, false);
});
