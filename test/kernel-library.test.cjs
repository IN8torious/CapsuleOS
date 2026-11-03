const assert = require('node:assert/strict');
const test = require('node:test');

test('curated kernel cards are provenance-linked and create bounded data-only drafts', async () => {
  const { kernelLibrary, sourceArchive, nimbusisArchive } = await import('../toolbox/kernel-library.js');
  assert.equal(sourceArchive.entryCount, 497);
  assert.match(sourceArchive.sha256, /^[a-f0-9]{64}$/);
  assert.equal(new Set(kernelLibrary.map((kernel) => kernel.id)).size, kernelLibrary.length);
  assert.ok(kernelLibrary.length >= 5);

  for (const kernel of kernelLibrary) {
    if (kernel.id === 'ringflow') {
      assert.equal(kernel.archive.name, 'RingFlow.zip');
      assert.equal(kernel.sourcePath, 'RingFlow/ringflow.js');
      assert.match(kernel.archive.sha256, /^[a-f0-9]{64}$/);
    } else if (kernel.id === 'nimbusis-phase4') {
      assert.equal(kernel.archive, nimbusisArchive);
      assert.equal(kernel.sourcePath, 'Nimbusis-Kernel-Phase4.zip / KERNEL-SPEC.md');
      assert.match(nimbusisArchive.sha256, /^[a-f0-9]{64}$/);
    } else {
      assert.match(kernel.sourcePath, /^raijin-kernels\//);
    }
    assert.match(kernel.sourceSha256, /^[a-f0-9]{64}$/);
    assert.ok(kernel.workflow.name.length <= 80);
    assert.ok(kernel.workflow.description.length <= 240);
    assert.ok(kernel.workflow.steps.length >= 1 && kernel.workflow.steps.length <= 20);
    assert.ok(kernel.workflow.steps.every((step) => step.length > 0 && step.length <= 240));
  }
});
