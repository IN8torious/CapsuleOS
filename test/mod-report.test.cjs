const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const test = require('node:test');
const { inspectModPackage } = require('../assistant/mod-package.cjs');
const { buildStaticReport, reportToMarkdown } = require('../assistant/mod-report.cjs');

async function makeJar(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-report-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const archive = new AdmZip();
  for (const [name, body] of Object.entries(files)) archive.addFile(name, Buffer.from(body));
  const file = path.join(root, 'sample.jar');
  archive.writeZip(file);
  return file;
}

test('static report reads Fabric metadata, inventory and flags without a model', async (t) => {
  const file = await makeJar(t, {
    'fabric.mod.json': JSON.stringify({
      id: 'dragons', version: '2.1.0', name: 'Dragons', authors: ['Nate', { name: 'Sam' }],
      license: 'MIT', depends: { minecraft: '>=1.20', fabricloader: '*' }
    }),
    'assets/dragons/textures/entity/dragon.png': 'x',
    'assets/dragons/textures/entity/wing.png': 'x',
    'data/dragons/recipes/egg.json': '{}',
    'natives/hook.dll': 'MZ',
    'src/Main.java': 'class A {\n  void go() { Runtime.getRuntime().exec("calc"); }\n}'
  });
  const info = await inspectModPackage(file);
  const m = info.report.metadata;
  assert.equal(m.loader, 'Fabric');
  assert.equal(m.id, 'dragons');
  assert.deepEqual(m.authors, ['Nate', 'Sam']);
  assert.equal(m.minecraft, '>=1.20');
  assert.ok(m.dependencies.includes('fabricloader'));
  assert.equal(info.report.inventory.find((i) => i.category === 'textures').count, 2);
  assert.equal(info.report.inventory.find((i) => i.category === 'recipes').count, 1);
  const exec = info.report.signals.find((s) => s.id === 'process-exec');
  assert.equal(exec.hits[0].line, 2);
  assert.ok(info.report.notes.some((n) => /native binary/.test(n.text)));
  assert.equal(info.report.verdict.level, 'review-carefully');
  assert.match(info.reportMarkdown, /# Static review: Dragons/);
  assert.match(info.reportMarkdown, /src\/Main\.java:2/);
});

test('a clean pack reports no flags and tolerates missing metadata', () => {
  const report = buildStaticReport({
    entryNames: ['pack.mcmeta', 'assets/x/lang/en_us.json'],
    documents: [{ path: 'pack.mcmeta', text: '{"pack":{"pack_format":15,"description":"Hi"}}' }],
    sources: [], executablePaths: []
  });
  assert.equal(report.metadata.loader, 'Resource/data pack');
  assert.equal(report.verdict.level, 'no-flags');
  const broken = buildStaticReport({
    entryNames: [], documents: [{ path: 'fabric.mod.json', text: '{not json' }], sources: [], executablePaths: []
  });
  assert.equal(broken.metadata.loader, 'Fabric');
  assert.match(reportToMarkdown('a.jar', 'abc', broken), /Static review/);
});
