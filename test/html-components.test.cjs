'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const components = require('../assistant/html-components.cjs');
const { validateRequest, CONTRACT_VERSION } = require('../capsule/companion-bridge.cjs');
const source = '<!doctype html><html><head><style>.ball{color:red}</style></head><body><main id="shell"><section id="ball"><p>keep me</p></section><aside id="docs">omit me</aside></main><script>throw new Error("never execute")</script></body></html>';
const hash = createHash('sha256').update(source).digest('hex');

test('parser supplies exact source ranges; selective export omits unrelated siblings and never duplicates parents', async () => {
  const document = await components.decomposeHtml(source, 'scene.html', hash);
  const ball = document.components.find(part => part.label === 'section#ball');
  const shell = document.components.find(part => part.label === 'main#shell');
  assert.equal(ball.source, source.slice(ball.start, ball.end));
  assert.equal(ball.parentId, shell.id);
  const output = components.exportSelection(document, hash, [ball.id]);
  assert.match(output.html, /keep me/);
  assert.doesNotMatch(output.html, /omit me|throw new Error/);
  assert.match(output.html, /script-src 'none'/);
  assert.equal(components.exportSelection(document, hash, [ball.id, shell.id]).selected.length, 1);
  assert.throws(() => components.exportSelection(document, '0'.repeat(64), [ball.id]), /changed/);
  assert.throws(() => components.exportSelection(document, hash, ['unknown']), /does not belong/);
  const proposal = { summary: 'Retain the ball only', components: [{ id: ball.id, reason: 'Matches the requested visualization' }] };
  assert.deepEqual(components.parseSelectionProposal(document, JSON.stringify(proposal)), proposal);
  assert.throws(() => components.parseSelectionProposal(document, '{"summary":"x","components":[{"id":"unknown","reason":"x"}]}'), /does not belong/);
  assert.throws(() => components.parseSelectionProposal(document, JSON.stringify({ ...proposal, command: 'anything' })), /bounded/);
});

test('only approved selected source persists; originals remain unchanged and forget removes retained source', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-component-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const original = path.join(directory, 'scene.html'), library = path.join(directory, 'components.json');
  await fs.writeFile(original, source);
  const document = await components.decomposeHtml(source, 'scene.html', hash);
  const ball = document.components.find(part => part.label === 'section#ball');
  const request = { sourceSha256: hash, componentIds: [ball.id], confirmed: false };
  await assert.rejects(components.retainSelection(library, document, request), /approve/);
  const entries = await components.retainSelection(library, document, { ...request, confirmed: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].html, ball.source);
  assert.doesNotMatch(await fs.readFile(library, 'utf8'), /omit me|never execute/);
  assert.equal((await components.retainSelection(library, document, { ...request, confirmed: true })).length, 1);
  assert.equal(await fs.readFile(original, 'utf8'), source);
  assert.equal((await components.forgetComponent(library, entries[0].id)).length, 0);
});

test('component bridge enforces exact fields, fingerprints and explicit retention approval', () => {
  const token = 'a'.repeat(64);
  const request = (action, payload) => validateRequest({ version: CONTRACT_VERSION, token, operation: 'html-components', action, payload }, token);
  assert.equal(request('inspect', {}), null);
  assert.equal(request('import', { name: 'scene.html', source }), null);
  assert.ok(request('import', { name: '..\\scene.html', source }));
  assert.ok(request('import', { name: 'scene.html', source, path: 'C:\\private.html' }));
  assert.ok(request('import', { name: 'scene.html', source: 'é'.repeat(128 * 1024 + 1) }));
  assert.ok(request('import', { name: 'scene.html', source: '<p>\0</p>' }));
  assert.equal(request('retain', { sourceSha256: hash, componentIds: ['part-1'], confirmed: true }), null);
  assert.ok(request('retain', { sourceSha256: hash, componentIds: ['part-1'], confirmed: false }));
  assert.ok(request('export', { sourceSha256: hash, componentIds: ['part-1'], path: 'C:\\anything' }));
  assert.ok(request('shell', {}));
  assert.ok(request('export', { sourceSha256: hash, componentIds: ['part-1', 'part-1'] }));
});

test('Scene Studio reviews the current in-memory draft independently of package review and rejects stale selections', async t => {
  const { AssistantController } = require('../assistant/controller.cjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-scene-components-'));
  const controller = new AssistantController({ ipcMain: { handle() {} }, getWindow: () => null, getWindows: () => [],
    getPageView: () => null, isHome: () => true, isTrustedChrome: () => false, userDataPath: directory, workspacePath: directory });
  t.after(async () => { controller.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  const unrelatedPackage = { kind: 'package', name: 'other.zip', packageSha256: 'a'.repeat(64) };
  controller.selectedModPackage = unrelatedPackage;
  const first = await controller.handleHtmlComponents({ action: 'import', payload: { name: 'scene.html', source } });
  const ball = first.document.components.find(part => part.label === 'section#ball');
  const selected = { sourceSha256: first.document.sourceSha256, componentIds: [ball.id], confirmed: true };
  await controller.handleHtmlComponents({ action: 'retain', payload: selected });
  const changedSource = source.replace('keep me', 'updated draft');
  const second = await controller.handleHtmlComponents({ action: 'import', payload: { name: 'scene.html', source: changedSource } });
  assert.notEqual(first.document.sourceSha256, second.document.sourceSha256);
  await assert.rejects(controller.handleHtmlComponents({ action: 'export', payload: selected }), /changed/);
  assert.equal(controller.selectedModPackage, unrelatedPackage);
  assert.equal((await controller.reviewCache.status()).itemCount, 0);
  await controller.handleHtmlComponents({ action: 'discard', payload: { confirmed: true } });
  assert.equal(controller.htmlSource, null);
  assert.equal(controller.selectedModPackage, unrelatedPackage);
  assert.equal((await controller.handleHtmlComponents({ action: 'library', payload: {} })).entries.length, 1);
});

test('controller retains only explicit components and rejects stale inference proposals after a source switch', async t => {
  const { AssistantController } = require('../assistant/controller.cjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-components-controller-'));
  const controller = new AssistantController({ ipcMain: { handle() {} }, getWindow: () => null, getWindows: () => [],
    getPageView: () => null, isHome: () => true, isTrustedChrome: () => false, userDataPath: directory, workspacePath: directory });
  t.after(async () => { controller.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  const file = path.join(directory, 'scene.html');
  await fs.writeFile(file, source);
  await controller.inspectModPackagePath(file);
  assert.equal((await controller.reviewCache.status()).itemCount, 0);
  const inspected = await controller.handleHtmlComponents({ action: 'inspect', payload: {} });
  const ball = inspected.document.components.find(part => part.label === 'section#ball');
  controller.generate = async () => ({ ok: true, text: JSON.stringify({ summary: 'Retain ball', components: [{ id: ball.id, reason: 'Requested' }] }) });
  const proposed = await controller.handleHtmlComponents({ action: 'propose', payload: { sourceSha256: hash, goal: 'retain ball' } });
  assert.equal(proposed.proposal.components[0].id, ball.id);
  const output = await controller.handleHtmlComponents({ action: 'export', payload: { sourceSha256: hash, componentIds: [ball.id] } });
  assert.doesNotMatch(output.html, /omit me/);
  await controller.handleHtmlComponents({ action: 'retain', payload: { sourceSha256: hash, componentIds: [ball.id], confirmed: true } });
  controller.generate = async () => {
    controller.selectedModPackage = null;
    return { ok: true, text: JSON.stringify(proposed.proposal) };
  };
  await assert.rejects(controller.handleHtmlComponents({ action: 'propose', payload: { sourceSha256: hash, goal: 'ball' } }), /changed during/);
});
