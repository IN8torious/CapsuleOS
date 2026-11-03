const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const test = require('node:test');
const AdmZip = require('adm-zip');
const { AssistantController } = require('../assistant/controller.cjs');
const { getModelById, getModelDownloadBytes, getPublicModelCatalog } = require('../assistant/model-catalog.cjs');
const { hashContent } = require('../assistant/css-proposals.cjs');
const {
  createFileVerifier,
  downloadModel,
  fetchTrustedAsset,
  getInstalledModelIds,
  modelDirectory
} = require('../assistant/model-store.cjs');

test('model catalog exposes pinned, licensed choices without downloading weights', () => {
  const catalog = getPublicModelCatalog();
  assert.equal(catalog.length, 2);
  for (const model of catalog) {
    const pinned = getModelById(model.id);
    assert.ok(pinned.revision.length >= 40);
    assert.equal(model.revision, pinned.revision);
    assert.equal(model.license, 'MIT');
    assert.ok(model.downloadBytes >= model.weightsBytes);
    assert.equal(model.downloadBytes, getModelDownloadBytes(pinned));
    assert.ok(pinned.files.every((file) => file.sha1 || file.sha256));
  }
});

test('model paths are available only for catalog ids', () => {
  assert.throws(() => modelDirectory(os.tmpdir(), '..'), /approved catalog/);
});

test('appearance recommendations are restricted to current fixed settings and exact model output', async () => {
  const controller = Object.create(AssistantController.prototype);
  controller.activeModel = { id: 'phi-3-mini-4k-q4' };
  let generatedRequest;
  controller.generate = async (request) => {
    generatedRequest = request;
    return {
      ok: true,
      text: JSON.stringify({
        recommendations: [{
          setting: 'windowAnimations',
          value: false,
          reason: 'Disabling this preference removes the classic minimize and restore animation.'
        }]
      })
    };
  };
  const settings = { transparency: true, windowAnimations: true };
  const result = await controller.proposeAppearanceTweaks({
    goal: 'Reduce window motion',
    settings
  });
  assert.equal(generatedRequest.mode, 'appearance-tweak-proposal');
  assert.deepEqual(result, {
    ok: true,
    modelId: 'phi-3-mini-4k-q4',
    recommendations: [{
      setting: 'windowAnimations',
      value: false,
      expectedValue: true,
      reason: 'Disabling this preference removes the classic minimize and restore animation.'
    }]
  });

  controller.generate = async () => ({
    ok: true,
    text: JSON.stringify({
      recommendations: [{ setting: 'shell', value: true, reason: 'Run a command.' }]
    })
  });
  assert.equal((await controller.proposeAppearanceTweaks({ goal: 'Reduce motion', settings })).ok, false);

  controller.generate = async () => ({ ok: true, text: '{"recommendations":[],"command":"whoami"}' });
  assert.equal((await controller.proposeAppearanceTweaks({ goal: 'Reduce motion', settings })).ok, false);

  let generated = false;
  controller.generate = async () => {
    generated = true;
    return { ok: true, text: '{"recommendations":[]}' };
  };
  assert.equal((await controller.proposeAppearanceTweaks({
    goal: 'x'.repeat(241),
    settings: { ...settings, command: false }
  })).ok, false);
  assert.equal(generated, false);
});

test('installed model discovery requires a matching pinned install record', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'si-model-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const model = getModelById('phi-3-mini-4k-q4');
  const installed = modelDirectory(root, model.id);
  await fs.mkdir(installed, { recursive: true });
  await fs.writeFile(
    path.join(installed, 'si-model-install.json'),
    JSON.stringify({ id: model.id, revision: model.revision })
  );
  await fs.mkdir(path.join(root, 'unapproved-model'), { recursive: true });
  assert.deepEqual(await getInstalledModelIds(root), [model.id]);
});

test('asset verifier accepts exact bytes and rejects mismatched payloads', async () => {
  const payload = Buffer.from('small');
  const verifier = createFileVerifier({
    size: payload.length,
    sha256: crypto.createHash('sha256').update(payload).digest('hex')
  });
  await pipeline(
    Readable.from([payload]),
    verifier.meter,
    new Writable({ write(_chunk, _encoding, callback) { callback(); } })
  );
  assert.equal(verifier.result(), payload.length);

  const invalid = createFileVerifier({ size: payload.length, sha256: '0'.repeat(64) });
  await pipeline(
    Readable.from([payload]),
    invalid.meter,
    new Writable({ write(_chunk, _encoding, callback) { callback(); } })
  );
  assert.throws(() => invalid.result(), /verification failed/);
});

test('asset fetch refuses unapproved hosts and limits every redirect hop', async (t) => {
  let fetchCalls = 0;
  t.mock.method(global, 'fetch', async () => {
    fetchCalls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: 'https://example.invalid/asset' }
    });
  });

  await assert.rejects(
    fetchTrustedAsset('https://huggingface.co/repository/resolve/revision/file'),
    /unapproved host/
  );
  assert.equal(fetchCalls, 1);
  await assert.rejects(
    fetchTrustedAsset('https://example.invalid/asset'),
    /unapproved host/
  );
  assert.equal(fetchCalls, 1);
});

test('asset fetch follows a pinned Hugging Face CDN redirect over HTTPS', async (t) => {
  const visited = [];
  t.mock.method(global, 'fetch', async (input, options) => {
    visited.push(new URL(input).origin);
    assert.equal(options.redirect, 'manual');
    if (visited.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://us.aws.cdn.hf.co/asset' }
      });
    }
    return new Response('asset');
  });

  const response = await fetchTrustedAsset('https://huggingface.co/repository/resolve/revision/file');
  assert.deepEqual(visited, ['https://huggingface.co', 'https://us.aws.cdn.hf.co']);
  assert.equal(await response.text(), 'asset');
});

test('cancelled model downloads remove staging files without fetching assets', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'si-model-cancel-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    downloadModel({ root, modelId: 'phi-3-mini-4k-q4', signal: controller.signal }),
    /cancelled/
  );
  assert.deepEqual(await fs.readdir(root), []);
});

test('assistant IPC and stylesheet writes stay inside the trusted app UI boundary', async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'si-assistant-test-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const appDirectory = path.join(workspace, 'app');
  await fs.mkdir(appDirectory);
  const stylesheet = path.join(appDirectory, 'styles.css');
  const outsideStylesheet = path.join(workspace, 'outside.css');
  await fs.writeFile(stylesheet, '.toolbox { color: white; }\n');
  await fs.writeFile(outsideStylesheet, 'body { color: black; }\n');

  const handlers = new Map();
  const controller = new AssistantController({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: {},
    getWindow: () => null,
    getPageView: () => null,
    isHome: () => true,
    userDataPath: path.join(workspace, 'user-data'),
    workspacePath: workspace,
    isTrustedChrome: (event) => event.sender === 'trusted-chrome'
  });

  test('Toolbox bridge runs static review and saves only inert proposals', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'si-mod-forge-test-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const packagePath = path.join(root, 'sample.jar');
    const archive = new AdmZip();
    archive.addFile('fabric.mod.json', Buffer.from('{"id":"sample","version":"1"}'));
    archive.addFile('README.md', Buffer.from('A small test package.'));
    archive.addFile('src/main.js', Buffer.from('registerItem("example");'));
    archive.writeZip(packagePath);

    const handlers = new Map();
    const controller = new AssistantController({
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      dialog: {},
      getWindow: () => null,
      getPageView: () => null,
      isHome: () => true,
      userDataPath: path.join(root, 'app-data'),
      workspacePath: root,
      isTrustedChrome: (event) => event.sender === 'trusted-chrome'
    });
    t.after(() => controller.dispose());

    const workerMessages = [];
    const worker = {
      postMessage(message) {
        workerMessages.push(message);
        setImmediate(() => controller.onWorkerMessage({
          type: 'response',
          requestId: message.requestId,
          text: '# Evidence\\n- Review README.md before reuse.'
        }, worker));
      },
      terminate() {}
    };
    controller.worker = worker;
    controller.activeModel = { id: 'local-test-model' };
    const selected = await controller.handleCompanionRequest({
      operation: 'mod-inspect-package',
      filePath: packagePath
    });
    assert.equal(selected.ok, true);
    assert.deepEqual(selected.documentPaths, ['fabric.mod.json', 'README.md']);
    assert.deepEqual(selected.sourcePaths, ['src/main.js']);
    const started = await controller.handleCompanionRequest({ operation: 'mod-analysis-start' });
    assert.equal(started.ok, true);
    let response;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      response = controller.getModAnalysisStatus(started.jobId);
      if (response.job.state !== 'running') break;
    }
    assert.equal(response.job.state, 'complete');
    assert.deepEqual(response.job.results.map((item) => item.name), [
      'Package Reader', 'Usefulness Reviewer', 'Capsule Planner', 'Toolbox Auditor'
    ]);
    assert.equal(workerMessages.filter((message) => message.mode === 'mod-analysis').length, 4);
    assert.match(workerMessages[1].packageText, /registerItem\("example"\)/);

    const auditor = await controller.handleCompanionRequest({
      operation: 'mod-save-auditor-proposal',
      findingIds: ['toolbox-auditor', 'usefulness-reviewer']
    });
    assert.equal(auditor.ok, true);
    const stored = JSON.parse(await fs.readFile(path.join(root, 'auditor-proposals.json'), 'utf8'));
    assert.equal(stored.proposals.length, 1);
    assert.deepEqual(stored.proposals[0].sourcePaths, ['fabric.mod.json', 'README.md', 'src/main.js']);
    assert.equal(stored.proposals[0].findings.length, 2);
    assert.equal(stored.proposals[0].findings[0].reviewer, 'Toolbox Auditor');
    assert.doesNotMatch(JSON.stringify(stored), /process\.spawn|shell\.exec/);

    const proposal = await controller.handleCompanionRequest({
      operation: 'mod-create-kernel-proposal',
      name: 'Reviewed kernel idea',
      parentId: null
    });
    assert.equal(proposal.ok, true);
    assert.match(proposal.proposal.content, /Evidence/);
    assert.doesNotMatch(proposal.proposal.content, /User-supplied text/);
    assert.equal(proposal.proposal.versionNumber, 1);
    assert.equal(proposal.proposal.lineageId.length, 36);
  });
  t.after(() => controller.dispose());

  assert.equal((await controller.readStylesheet(stylesheet)).content, '.toolbox { color: white; }\n');
  await assert.rejects(controller.readStylesheet(outsideStylesheet), /inside the SI Core app UI folder/);
  await assert.rejects(
    handlers.get('assistant:catalog')({ sender: 'remote-page' }),
    /Assistant request rejected/
  );
  assert.equal(handlers.has('assistant:select-mod-package'), false);
  assert.equal(handlers.has('assistant:analyze-mod-package'), false);
  controller.worker = {};
  controller.activeModel = { id: 'test-model' };
  assert.deepEqual(
    await handlers.get('assistant:send')(
      { sender: 'trusted-chrome' },
      { prompt: 'Summarize this page', includePageContext: true }
    ),
    { ok: false, message: 'Open a website before including page context.' }
  );
  controller.worker = null;
  controller.activeModel = null;

  const original = await fs.readFile(stylesheet, 'utf8');
  controller.styleProposals.set('approved-proposal', {
    id: 'approved-proposal',
    path: stylesheet,
    originalHash: hashContent(original),
    css: '.toolbox { border-color: crimson; }'
  });
  const applied = await handlers.get('assistant:apply-style')(
    { sender: 'trusted-chrome' },
    'approved-proposal'
  );
  assert.equal(applied.ok, true);
  assert.match(await fs.readFile(stylesheet, 'utf8'), /border-color: crimson/);
  assert.equal(
    await fs.readFile(path.join(workspace, 'user-data', 'assistant-backups', applied.backupName), 'utf8'),
    original
  );

  const staleContent = await fs.readFile(stylesheet, 'utf8');
  controller.styleProposals.set('stale-proposal', {
    id: 'stale-proposal',
    path: stylesheet,
    originalHash: hashContent(original),
    css: '.toolbox { color: red; }'
  });
  assert.deepEqual(
    await handlers.get('assistant:apply-style')(
    { sender: 'trusted-chrome' },
    'stale-proposal'
    ),
    { ok: false, message: 'The stylesheet changed after review. Draft a fresh proposal before applying it.' }
  );
  assert.equal(await fs.readFile(stylesheet, 'utf8'), staleContent);
});
