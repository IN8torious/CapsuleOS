const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { inspectModPackage } = require('../assistant/mod-package.cjs');
const { MAX_HTML_BYTES, MAX_HTML_ANALYSIS_CHARS } = require('../assistant/html-source.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-html-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('HTML import deconstructs inert source without executing scripts or fetching assets', async t => {
  const root = await fixture(t);
  const file = path.join(root, 'sample.HTML');
  const source = '<!doctype html>\n<main><h1>Example</h1><form></form></main>\n<style>main{display:grid}</style>\n<script src="https://invalid.example/script.js">throw new Error("never execute");fetch("/secret")</script>\n<img src="file:///private" onload="alert(1)">';
  await fs.writeFile(file, source);
  const result = await inspectModPackage(file);
  assert.equal(result.kind, 'html');
  assert.equal(result.packageSha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(result.sourceEvidence[0].lineCount, 5);
  assert.equal(result.report.inventory.find(i => i.category === 'scripts').count, 1);
  assert.equal(result.report.inventory.find(i => i.category === 'forms').count, 1);
  assert.equal(result.report.inventory.find(i => i.category === 'style blocks').count, 1);
  assert.match(result.analysisText, /4: <script/);
  assert.match(result.reportMarkdown, /No execution/);
  assert.equal(result.analysisTruncated, false);
  assert.deepEqual(result.sourcePaths, ['sample.HTML']);
  assert.equal(result.report.signals.some(s => s.id === 'network'), true);
});

test('HTML import enforces byte, text and inference limits', async t => {
  const root = await fixture(t);
  const file = path.join(root, 'source.htm');
  for (const data of [Buffer.alloc(0), Buffer.alloc(MAX_HTML_BYTES + 1), Buffer.from([0xff, 0xfe]), Buffer.from('<p>\0</p>')]) {
    await fs.writeFile(file, data);
    await assert.rejects(inspectModPackage(file), /512 KiB|UTF-8|null bytes/);
  }
  await fs.writeFile(file, '<main>' + 'x'.repeat(MAX_HTML_ANALYSIS_CHARS + 100) + '</main>');
  const result = await inspectModPackage(file);
  assert.equal(result.analysisTruncated, true);
  assert.ok(result.analysisText.length < MAX_HTML_ANALYSIS_CHARS + 100);
  await assert.rejects(inspectModPackage(root), /ZIP, JAR/);
});
