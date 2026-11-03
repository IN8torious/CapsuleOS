const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { appendAuditorProposal, extractLineCitations } = require('../assistant/auditor-proposals.cjs');

function proposal(id = '01234567-89ab-cdef-0123-456789abcdef') {
  return {
    id,
    name: 'Example mod · Mod audit references',
    sourcePackage: 'example.jar',
    sourcePaths: ['src/main.js', 'README.md'],
    findings: [{
      reviewer: 'Toolbox Auditor',
      text: 'The source suggests a feature that may be useful as an audit reference.'
    }],
    createdAt: 1
  };
}

test('stores bounded inert auditor proposals without losing concurrent additions', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-auditor-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const storePath = path.join(root, 'auditor-proposals.json');
  await Promise.all([
    appendAuditorProposal(storePath, proposal()),
    appendAuditorProposal(storePath, proposal('11234567-89ab-cdef-0123-456789abcdef'))
  ]);
  const document = JSON.parse(await fs.readFile(storePath, 'utf8'));
  assert.equal(document.version, 1);
  assert.equal(document.proposals.length, 2);
  assert.equal(document.proposals[0].findings[0].reviewer, 'Toolbox Auditor');
});

test('rejects unsafe package paths and malformed proposal data', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-auditor-invalid-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const invalid = proposal();
  invalid.sourcePaths = ['../../outside.js'];
  await assert.rejects(
    appendAuditorProposal(path.join(root, 'auditor-proposals.json'), invalid),
    /proposal is invalid/
  );
});

test('only stores line citations that resolve within inspected file evidence', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-auditor-citations-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceEvidence = [{
    path: 'src/main.js',
    sha256: 'a'.repeat(64),
    lineCount: 6
  }];
  const citations = extractLineCitations(
    'Verified [src/main.js:L1-L3] and [src/main.js:L5]. Ignore [src/main.js:L0], [missing.md:L1], and [src/main.js:L1-L99].',
    sourceEvidence
  );
  assert.deepEqual(citations, [
    { path: 'src/main.js', lineStart: 1, lineEnd: 3 },
    { path: 'src/main.js', lineStart: 5, lineEnd: 5 }
  ]);
  const candidate = proposal();
  candidate.packageSha256 = 'b'.repeat(64);
  candidate.sourceEvidence = sourceEvidence;
  candidate.findings[0].citations = citations;
  await appendAuditorProposal(path.join(root, 'auditor-proposals.json'), candidate);
  const document = JSON.parse(await fs.readFile(path.join(root, 'auditor-proposals.json'), 'utf8'));
  assert.deepEqual(document.proposals[0].findings[0].citations, citations);
  assert.equal(document.proposals[0].packageSha256, candidate.packageSha256);
});
