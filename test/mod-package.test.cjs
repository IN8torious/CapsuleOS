const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const test = require('node:test');
const {
  inspectModPackage,
  isSafeEntryName,
  isUsefulDocument,
  isUsefulSource
} = require('../assistant/mod-package.cjs');

test('package inspection reads bounded source text without executing it and skips compiled code', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-mod-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const archivePath = path.join(root, 'sample.jar');
  const archive = new AdmZip();
  archive.addFile('fabric.mod.json', Buffer.from('{"id":"sample-mod","version":"1.0.0"}'));
  archive.addFile('README.md', Buffer.from('# Sample Mod\nAdds a decorative item.'));
  archive.addFile('LICENSE', Buffer.from('Example license text.'));
  archive.addFile('src/main.js', Buffer.from('throw new Error("never run");'));
  archive.addFile('src/Main.class', Buffer.from([0, 1, 2, 3]));
  archive.writeZip(archivePath);

  const result = await inspectModPackage(archivePath);
  assert.equal(result.name, 'sample.jar');
  assert.equal(
    result.packageSha256,
    crypto.createHash('sha256').update(await fs.readFile(archivePath)).digest('hex')
  );
  assert.deepEqual([...result.documentPaths].sort(), ['fabric.mod.json', 'README.md', 'LICENSE'].sort());
  assert.deepEqual(result.sourcePaths, ['src/main.js']);
  assert.match(result.analysisText, /sample-mod/);
  assert.match(result.analysisText, /never run/);
  assert.deepEqual(result.executablePaths, ['src/Main.class']);
  const sourceEvidence = result.sourceEvidence.find((item) => item.path === 'src/main.js');
  assert.equal(
    sourceEvidence.sha256,
    crypto.createHash('sha256').update(Buffer.from('throw new Error("never run");')).digest('hex')
  );
  assert.equal(sourceEvidence.lineCount, 1);
  assert.match(result.analysisText, /src\/main\.js[\s\S]*1: throw new Error/);
  assert.equal(isUsefulSource('src/main.js'), true);
  assert.equal(isUsefulSource('src/Main.class'), false);
});

test('package path and document selection are conservative', () => {
  assert.equal(isSafeEntryName('docs/README.md'), true);
  assert.equal(isSafeEntryName('../outside.txt'), false);
  assert.equal(isSafeEntryName('C:\\outside.txt'), false);
  assert.equal(isSafeEntryName('\\\\server\\share\\outside.txt'), false);
  assert.equal(isUsefulDocument('fabric.mod.json'), true);
  assert.equal(isUsefulDocument('assets/textures/item.json'), false);
});

test('package inspection rejects oversized inputs and unsupported formats', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-mod-limit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const unsupported = path.join(root, 'mod.exe');
  await fs.writeFile(unsupported, Buffer.alloc(32));
  await assert.rejects(inspectModPackage(unsupported), /ZIP, JAR/);

  const shortArchive = path.join(root, 'short.zip');
  await fs.writeFile(shortArchive, Buffer.alloc(8));
  await assert.rejects(inspectModPackage(shortArchive), /between 22 bytes/);
});
