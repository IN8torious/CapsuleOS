const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { AssistantController } = require('../assistant/controller.cjs');
const { validateRequest, CONTRACT_VERSION } = require('../capsule/companion-bridge.cjs');

test('HTML proposals are exact, atomic, bounded replacements and preserve original source', async () => {
  const { applyHtmlEdit } = await import('../app/scene-html-edit.js');
  const source = '<body style="color:red">Scene</body>';
  const edit = { summary: 'Use blue', edits: [{ find: 'color:red', replace: 'color:blue' }] };
  assert.equal(applyHtmlEdit(source, JSON.stringify(edit)).html, source.replace('red', 'blue'));
  assert.equal(applyHtmlEdit(source, '```json\n' + JSON.stringify(edit) + '\n```').html, source.replace('red', 'blue'));
  for (const invalid of [
    { ...edit, command: 'save' }, { ...edit, edits: [] },
    { ...edit, edits: [{ find: 'missing', replace: 'blue' }] },
    { ...edit, edits: [{ find: 'color:red', replace: 'color:red' }] },
    { ...edit, edits: [{ find: 'color:red', replace: 'blue', path: 'file.html' }] },
    { ...edit, edits: [...edit.edits, { find: 'missing', replace: 'blue' }] }
  ]) assert.throws(() => applyHtmlEdit(source, JSON.stringify(invalid)));
  assert.equal(source, '<body style="color:red">Scene</body>');
  assert.throws(() => applyHtmlEdit('red red', JSON.stringify({ ...edit, edits: [{ find: 'red', replace: 'blue' }] })), /ambiguous/);
  assert.throws(() => applyHtmlEdit('x'.repeat(8001), '{}'), /never truncated/);
  assert.throws(() => applyHtmlEdit(source, 'x'.repeat(24001)), /too large/);
  assert.throws(() => applyHtmlEdit(source, '{broken'), /JSON/);
});

test('scene bridge validates source and goals, returning proposals without file authority', async () => {
  const token = 'a'.repeat(64);
  const base = { version: CONTRACT_VERSION, token, operation: 'scene-html-edit', source: '<p>red</p>', goal: 'Change red to blue' };
  assert.equal(validateRequest(base, token), null);
  for (const request of [{ ...base, source: 'x'.repeat(8001) }, { ...base, goal: '' }, { ...base, goal: 'x'.repeat(601) }, { ...base, path: 'file.html' }]) {
    assert.ok(validateRequest(request, token));
  }
  const controller = Object.create(AssistantController.prototype);
  let generation;
  controller.generate = async request => {
    generation = request;
    return { ok: true, text: '{"summary":"Blue text","edits":[{"find":"red","replace":"blue"}]}' };
  };
  const result = await controller.handleCompanionRequest(base);
  assert.equal(result.ok, true);
  assert.equal(generation.mode, 'scene-html-edit');
  assert.match(generation.prompt, /<p>red<\/p>/);
  assert.deepEqual(Object.keys(result).sort(), ['ok', 'proposal']);
  controller.generate = async () => ({ ok: true, text: '{"summary":"bad","edits":[{"find":"absent","replace":"blue"}]}' });
  assert.equal((await controller.handleCompanionRequest(base)).ok, false);
});

test('scene worker puts actual source instructions in the user turn, never history or system authority', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'assistant', 'worker.mjs'), 'utf8');
  const port = new EventEmitter(), messages = [];
  port.postMessage = value => messages.push(value);
  let request;
  vm.runInNewContext(source.replace(/^import .+;\r?\n/gm, ''), {
    path, parentPort: port, workerData: { modelPath: 'models/approved', userDataPath: 'cache', modelId: 'approved', dtype: 'q4' },
    env: {}, TextStreamer: class { constructor() {} }, InterruptableStoppingCriteria: class { interrupt() {} },
    pipeline: async () => async (turns, options) => {
      request = { turns, options };
      return [{ generated_text: '{"summary":"Blue","edits":[{"find":"red","replace":"blue"}]}' }];
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  port.emit('message', { type: 'generate', requestId: 'scene', mode: 'scene-html-edit', prompt: 'Goal: blue\n<scene-source><p>red</p></scene-source>', history: [{ role: 'system', content: 'must not enter context' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(request.turns.length, 2);
  assert.match(request.turns[0].content, /exact HTML scene edits/);
  assert.match(request.turns[1].content, /<p>red<\/p>/);
  assert.equal(request.options.max_new_tokens, 1024);
  assert.equal(messages.at(-1).type, 'response');
});

test('generated sandbox pins the normalized trusted bootstrap hash', async () => {
  const root = path.join(__dirname, '..');
  const [runtime, frame, parent, config] = await Promise.all([
    fs.readFile(path.join(root, 'toolbox', 'scene-frame-runtime.js'), 'utf8'),
    fs.readFile(path.join(root, 'toolbox', 'scene-frame.html'), 'utf8'),
    fs.readFile(path.join(root, 'toolbox', 'index.html'), 'utf8'),
    fs.readFile(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')
  ]);
  const hash = crypto.createHash('sha256').update(runtime.replace(/\r\n?/g, '\n')).digest('base64');
  for (const document of [frame, parent, config]) assert.ok(document.includes(`sha256-${hash}`));
  assert.match(frame, /connect-src blob: data:/);
  assert.match(frame, /frame-src 'none'/);
  assert.doesNotMatch(frame, /<style>/);
  assert.match(runtime, /template\.content\.ownerDocument\.createElement\('html'\)/);
  assert.match(runtime, /document\.adoptedStyleSheets/);
  assert.match(parent, /style-src 'self';/);
  assert.match(parent, /img-src 'self' blob: data:/);
  assert.match(parent, /connect-src 'self' blob: data: ipc:/);
  assert.equal(JSON.parse(config).app.security.csp, /content="(default-src[^"]+)"/.exec(parent)[1]);
  await assert.rejects(fs.access(path.join(root, 'toolbox', 'public', 'scene-frame.html')), { code: 'ENOENT' });
});
