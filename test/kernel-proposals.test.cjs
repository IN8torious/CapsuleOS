const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createKernelProposal, readProposals } = require('../assistant/kernel-proposals.cjs');

test('kernel proposals form immutable, parent-linked versions in a separate store', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-kernel-proposal-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const storePath = path.join(root, 'kernel-proposals.json');
  const activeKernelPath = path.join(root, 'si-kernel.js');
  const activeKernel = 'export const activeKernel = true;\n';
  await fs.writeFile(activeKernelPath, activeKernel);

  const first = await createKernelProposal({
    storePath,
    name: 'Research seed',
    content: '# Purpose\nA proposed, non-executable governance outline.',
    sourcePackage: 'sample.jar'
  });
  const second = await createKernelProposal({
    storePath,
    name: 'Network mentor',
    content: '# Changed\nA synthesized next-version proposal.',
    parentId: first.id,
    sourcePackage: 'network-tools.zip'
  });

  assert.equal(first.versionNumber, 1);
  assert.equal(first.parentId, null);
  assert.equal(second.versionNumber, 2);
  assert.equal(second.parentId, first.id);
  assert.equal(second.lineageId, first.lineageId);
  assert.deepEqual((await readProposals(storePath)).map((proposal) => proposal.id), [first.id, second.id]);
  assert.equal(await fs.readFile(activeKernelPath, 'utf8'), activeKernel);
  await assert.rejects(createKernelProposal({
    storePath,
    name: 'Invalid parent',
    content: 'No parent may be invented.',
    parentId: '00000000-0000-0000-0000-000000000000'
  }), /parent proposal no longer exists/);
});

test('kernel proposal names and agent-generated content are bounded', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-kernel-proposal-limits-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const storePath = path.join(root, 'kernel-proposals.json');
  await assert.rejects(createKernelProposal({
    storePath,
    name: '   ',
    content: 'Proposal'
  }), /Proposal names/);
  await assert.rejects(createKernelProposal({
    storePath,
    name: 'Proposal',
    content: 'x'.repeat(16001)
  }), /Agent proposals/);
});
