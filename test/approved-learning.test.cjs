const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readLessons, approveLesson, forgetLesson, lessonContext } = require('../assistant/approved-learning.cjs');
const { AssistantController } = require('../assistant/controller.cjs');

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-learning-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return path.join(root, 'approved-learning.json');
}
const sample = text => ({
  text, category: 'style', sourceName: 'example.html', sourceSha256: 'a'.repeat(64),
  reviewer: 'Style Reader', citations: [{ path: 'example.html', lineStart: 1, lineEnd: 2 }]
});

test('approved learning persists across reload, rejects duplicates, and forgets explicitly', async t => {
  const file = await setup(t);
  assert.deepEqual(await readLessons(file), []);
  await approveLesson(file, sample('Use clear visual hierarchy.'));
  const lessons = await readLessons(file);
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].text, 'Use clear visual hierarchy.');
  await assert.rejects(approveLesson(file, sample('Use clear visual hierarchy.')), /already approved/);
  assert.match(lessonContext(lessons), /Approved reference/);
  assert.deepEqual(await forgetLesson(file, lessons[0].id), []);
  assert.deepEqual(await readLessons(file), []);
  await assert.rejects(forgetLesson(file, lessons[0].id), /no longer/);
});

test('lesson storage is bounded and malformed storage never resets silently', async t => {
  const file = await setup(t);
  assert.throws(() => approveLesson(file, sample('x'.repeat(601))), /1-600/);
  await Promise.all(Array.from({ length: 10 }, (_, i) => approveLesson(file, sample(`Lesson ${i}`))));
  assert.equal((await readLessons(file)).length, 10);
  const context = lessonContext(await readLessons(file));
  assert.doesNotMatch(context, /\nLesson 0\b/);
  assert.match(context, /Lesson 9/);
  await fs.writeFile(file, '{"version":42,"lessons":[]}');
  await assert.rejects(readLessons(file), /unsupported format/);
});

test('controller requires explicit approval, current source hash, and range-checked citations', async t => {
  const c = Object.create(AssistantController.prototype);
  c.learningPath = await setup(t);
  c.lastModAnalysis = {
    package: { name: 'example.html', packageSha256: 'a'.repeat(64),
      sourceEvidence: [{ path: 'example.html', sha256: 'a'.repeat(64), lineCount: 3 }] },
    results: [{ id: 'reader', name: 'Reader', text: 'Semantic main region [example.html:L1-L2]' }]
  };
  const request = { findingId: 'reader', sourceSha256: 'a'.repeat(64), confirmed: true, text: 'Use semantic landmarks.', category: 'structure' };
  await assert.rejects(c.approveLearning({ ...request, confirmed: false }), /Explicit/);
  await assert.rejects(c.approveLearning({ ...request, sourceSha256: 'b'.repeat(64) }), /no longer current/);
  assert.equal((await c.approveLearning(request)).lessons.length, 1);
  c.lastModAnalysis.results[0].text = 'Uncited inference [example.html:L1-L400]';
  await assert.rejects(c.approveLearning(request), /no valid source citation/);
});

test('approved profile grows deterministically and forgetting restores its previous identity', async () => {
  const { learningProfile } = await import('../app/learning-profile.js');
  const first = { id: 'one', category: 'style' }, second = { id: 'two', category: 'structure' };
  const before = learningProfile([first]);
  assert.deepEqual(before, learningProfile([first]));
  assert.equal(learningProfile([first, second]).stars.length, 2);
  assert.deepEqual(before, learningProfile([first, second].filter(item => item.id !== 'two')));
  assert.equal(learningProfile([]).accent, null);
});

test('HTML reviews use only approved context and cache by source, model and learning state', async t => {
  const file = await setup(t);
  const c = new AssistantController({
    ipcMain: { handle() {} }, dialog: {}, getWindow: () => null,
    getPageView: () => null, isHome: () => true,
    userDataPath: path.dirname(file), workspacePath: path.dirname(file), isTrustedChrome: () => true
  });
  t.after(() => c.dispose());
  const source = path.join(path.dirname(file), 'page.html');
  await fs.writeFile(source, '<main><h1>A heading</h1></main>\n<style>main{display:grid}</style>');
  c.worker = { terminate() {} };
  c.activeModel = { id: 'test-model', revision: 'fixed' };
  c.sendState = () => {};
  const requests = [];
  c.generate = async request => {
    requests.push(request);
    return { ok: true, text: 'Use semantic landmarks [page.html:L1-L1]' };
  };
  await c.inspectModPackagePath(source);
  const first = await c.performModAnalysis();
  assert.deepEqual(first.results.map(item => item.name), [
    'HTML Structure Reader', 'Style & Behavior Reader', 'Learning Planner', 'Evidence Reviewer'
  ]);
  assert.equal(requests.length, 4);
  assert.equal(requests[0].learningContext, '');
  const cached = await c.performModAnalysis();
  assert.ok(cached.cachedAt);
  assert.equal(requests.length, 4);
  await c.approveLearning({
    confirmed: true, findingId: first.results[0].id,
    sourceSha256: c.selectedModPackage.packageSha256,
    text: 'Use semantic landmarks.', category: 'structure'
  });
  await c.performModAnalysis();
  assert.equal(requests.length, 8);
  assert.match(requests[4].learningContext, /Use semantic landmarks/);
  const approved = await readLessons(c.learningPath);
  await forgetLesson(c.learningPath, approved[0].id);
  const restored = await c.performModAnalysis();
  assert.ok(restored.cachedAt);
  assert.equal(requests.length, 8);
  await c.reviewCache.clear();
  await c.performModAnalysis();
  assert.equal(requests.length, 12);
  assert.equal(requests[8].learningContext, '');
});
