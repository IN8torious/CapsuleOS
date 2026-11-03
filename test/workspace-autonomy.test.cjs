const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { WorkspaceAutonomy, validateWorkspaceRequest } = require('../assistant/workspace-autonomy.cjs');
const { Orchestrator } = require('../assistant/orchestrator.cjs');
const { AssistantController } = require('../assistant/controller.cjs');
const hash = text => createHash('sha256').update(text).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-workspace-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'), directory = path.join(root, 'state');
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'index.html'), '<h1>Before</h1>');
  return { root, project, directory, service: new WorkspaceAutonomy({ directory }) };
}
test('workspace permission is explicit, persistent, revocable and cannot include runtime/application roots', async t => {
  const { service, project, directory } = await fixture(t);
  assert.equal((await service.status()).grant, null);
  assert.equal(await service.snapshot(), null);
  assert.equal(validateWorkspaceRequest('grant', { folder: project, confirmed: false }), false);
  assert.equal(validateWorkspaceRequest('apply', {}), false);
  assert.equal(validateWorkspaceRequest('status', { file: 'secret' }), false);
  await assert.rejects(service.request('grant', { folder: directory, confirmed: true }), /project folder/);
  await service.request('grant', { folder: project, confirmed: true });
  const reloaded = new WorkspaceAutonomy({ directory });
  assert.equal((await reloaded.status()).grant.folder, project);
  await reloaded.request('revoke', {});
  assert.equal(await reloaded.snapshot(), null);
});
test('document edits checkpoint automatically, detect conflicts and Undo survives reload and revocation', async t => {
  const { service, project, directory } = await fixture(t);
  const grant = (await service.request('grant', { folder: project, confirmed: true })).grant;
  const edit = { path: 'index.html', beforeSha256: hash('<h1>Before</h1>'), content: '<h1>After</h1>' };
  const result = await service.apply(grant.id, edit);
  assert.ok(result.checkpointId);
  assert.equal(await fs.readFile(path.join(project, 'index.html'), 'utf8'), edit.content);
  await assert.rejects(service.apply(grant.id, edit), /stale/);
  await fs.writeFile(path.join(project, 'index.html'), 'external change');
  await assert.rejects(service.request('undo', {}), /newer work/);
  await fs.writeFile(path.join(project, 'index.html'), edit.content);
  await service.request('revoke', {});
  await assert.rejects(service.apply(grant.id, edit), /revoked/);
  await new WorkspaceAutonomy({ directory }).request('undo', {});
  assert.equal(await fs.readFile(path.join(project, 'index.html'), 'utf8'), '<h1>Before</h1>');
});
test('automatic edits cannot escape their scope, delete files or run scripts; history stays bounded', async t => {
  const { service, project, root } = await fixture(t);
  const grant = (await service.request('grant', { folder: project, confirmed: true })).grant;
  for (const filename of ['..\\outside.txt', '../outside.txt', '.env', 'script.js', 'script.ps1', 'sub\\doc.txt']) {
    await assert.rejects(service.apply(grant.id, { path: filename, beforeSha256: hash('before'), content: 'after' }), /top-level/);
  }
  await assert.rejects(service.apply(grant.id, { path: 'index.html', beforeSha256: hash('<h1>Before</h1>'), content: '' }), /bounded/);
  await fs.writeFile(path.join(project, 'big.txt'), 'a'.repeat(33000));
  await fs.link(path.join(project, 'index.html'), path.join(root, 'linked.html'));
  await assert.rejects(service.apply(grant.id, { path: 'index.html', beforeSha256: hash('<h1>Before</h1>'), content: 'after' }), /linked/);
  await fs.rm(path.join(root, 'linked.html'));
  const snapshot = await service.snapshot();
  assert.equal(snapshot.files.length, 1);
  assert.equal(snapshot.omitted[0].path, 'big.txt');
  for (let i = 0; i < 12; i++) {
    const before = await fs.readFile(path.join(project, 'index.html'), 'utf8');
    await service.apply(grant.id, { path: 'index.html', beforeSha256: hash(before), content: `revision ${i}` });
  }
  assert.equal((await service.status()).checkpoints.length, 10);
  for (let i = 0; i < 10; i++) await service.request('undo', {});
  assert.equal(await fs.readFile(path.join(project, 'index.html'), 'utf8'), 'revision 1');
});
test('an interrupted commit blocks new writes and its durable checkpoint permits recovery', async t => {
  const { service, project } = await fixture(t);
  const grant = (await service.request('grant', { folder: project, confirmed: true })).grant;
  service.replace = async () => { throw new Error('injected write failure'); };
  await assert.rejects(service.apply(grant.id, { path: 'index.html', beforeSha256: hash('<h1>Before</h1>'), content: 'after' }), /injected/);
  const restarted = new WorkspaceAutonomy({ directory: path.dirname(service.file) });
  await assert.rejects(restarted.apply(grant.id, {}), /interrupted/);
  await restarted.request('undo', {});
  assert.equal((await restarted.status()).checkpoints[0].state, 'undone');
});
test('controller orchestration applies only structured current granted documents and records checkpoints', async t => {
  const { service, project, directory } = await fixture(t);
  const { index } = await require('../assistant/bible-canon.cjs').loadBible();
  await service.request('grant', { folder: project, confirmed: true });
  const controller = Object.assign(Object.create(AssistantController.prototype), {
    workspaceAutonomy: service, learningPath: path.join(directory, 'lessons.json'),
    biblePolicyPath: path.join(directory, 'bible-reference.json'),
    auditorProposalPath: path.join(directory, 'proposals.json'), activeModel: { id: 'test-model', revision: '1' },
    runtimeStatus: { backend: 'windows', phase: 'idle' }, pending: new Map(), selectedModPackage: null,
    getAssistantStatus: () => ({ modelReady: true }), sendState() {},
    async generate(input) {
      assert.equal(input.mode, 'orchestrator');
      assert.match(input.prompt, /Christian review reference/);
      if (input.prompt.startsWith('Act as Sentinel')) return { ok: true, text: JSON.stringify({ safe: true, reason: 'One current document edit.', principle: 'truth', scripture: { citation: 'Ephesians 4:25', text: index.verse('Ephesians 4:25').text } }) };
      const file = JSON.parse(input.packageText)[0];
      return { ok: true, text: JSON.stringify({ summary: 'Improve heading',
        claims: [{ path: file.path, sha256: file.sha256, lineStart: 1, lineEnd: 1, text: file.content }],
        edit: { path: file.path, beforeSha256: file.sha256, content: file.content + ' updated' } }) };
    }
  });
  const runner = new Orchestrator({
    file: path.join(directory, 'runs.json'), context: () => controller.orchestratorContext(),
    generate: input => controller.generateOrchestratorDraft(input),
    saveProposal: input => controller.saveOrchestratorProposal(input),
    applyDraft: input => controller.applyOrchestratorDraft(input)
  });
  await runner.start({ goal: 'Improve document', maxCycles: 2, confirmed: true });
  await runner.task;
  const status = await runner.status();
  assert.equal(status.error, null);
  assert.equal(status.run.state, 'completed');
  assert.equal(status.events.filter(event => event.kind === 'workspace-edited').length, 2);
  assert.equal(status.events.filter(event => event.kind === 'principle-checked').length, 2);
  assert.equal(status.events.filter(event => event.kind === 'evidence-verified').length, 2);
  assert.equal(await fs.readFile(path.join(project, 'index.html'), 'utf8'), '<h1>Before</h1> updated updated');
  assert.equal((await service.status()).checkpoints.length, 2);
  const ungranted = await controller.applyOrchestratorDraft({ source: {}, draft: '{}', review: '{"safe":true}' });
  assert.equal(ungranted.changed, false);
});
