const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CONTRACT_VERSION,
  CompanionBridge,
  isValidPipePath,
  validateRequest
} = require('../capsule/companion-bridge.cjs');

async function exchange(pipePath, request) {
  const socket = net.createConnection(pipePath);
  let response = '';
  return new Promise((resolve, reject) => {
    socket.setTimeout(3000, () => reject(new Error('bridge test timed out')));
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', (chunk) => { response += chunk.toString('utf8'); });
    socket.on('end', () => {
      try {
        resolve(JSON.parse(response));
      } catch (error) {
        reject(error);
      }
    });
    socket.on('error', reject);
  });
}

test('authenticated workflow operations cannot mint tool authority or an unconfirmed folder grant', () => {
  const token = 'a'.repeat(64);
  const request = (operation, action, payload) => validateRequest({ version: CONTRACT_VERSION, token, operation, action, payload }, token);
  assert.equal(request('orchestrator', 'start', { goal: 'Improve one document', maxCycles: 1, confirmed: true }), null);
  assert.notEqual(request('orchestrator', 'apply', {}), null);
  assert.equal(request('workspace-access', 'status', {}), null);
  assert.equal(request('workspace-access', 'grant', { folder: os.tmpdir(), confirmed: true }), null);
  assert.notEqual(request('workspace-access', 'grant', { folder: os.tmpdir(), confirmed: false }), null);
  assert.notEqual(request('workspace-access', 'undo', { file: 'arbitrary' }), null);
  assert.equal(request('bible-reference', 'status', {}), null);
  assert.equal(request('bible-reference', 'configure', { enabled: false }), null);
  assert.equal(request('bible-reference', 'verse', { citation: 'John 3:16' }), null);
  assert.notEqual(request('bible-reference', 'configure', { enabled: true, folder: os.tmpdir() }), null);
  assert.notEqual(request('bible-reference', 'execute', {}), null);
});

test('bridge request validation allows only authenticated versioned catalog and Toolbox operations', () => {
  const token = 'a'.repeat(64);
  assert.equal(validateRequest({ version: CONTRACT_VERSION, token, operation: 'snapshot' }, token), null);
  assert.equal(
    validateRequest({ version: CONTRACT_VERSION, token, operation: 'route-catalog-task', taskId: 2 }, token),
    null
  );
  assert.equal(
    validateRequest({ version: CONTRACT_VERSION, token, operation: 'assistant-status' }, token),
    null
  );
  assert.equal(
    validateRequest({
      version: CONTRACT_VERSION,
      token,
      operation: 'mod-save-auditor-proposal',
      findingIds: ['package-reader', 'toolbox-auditor']
    }, token),
    null
  );
  assert.equal(
    validateRequest({
      version: CONTRACT_VERSION,
      token,
      operation: 'appearance-tweak-proposals',
      goal: 'Reduce window motion',
      settings: { transparency: true, windowAnimations: false }
    }, token),
    null
  );
  assert.match(
    validateRequest({ version: CONTRACT_VERSION, token: 'b'.repeat(64), operation: 'snapshot' }, token),
    /authentication failed/
  );
  assert.match(
    validateRequest({ version: CONTRACT_VERSION + 1, token, operation: 'snapshot' }, token),
    /version/
  );
  assert.match(
    validateRequest({ version: CONTRACT_VERSION, token, operation: 'shell', command: 'whoami' }, token),
    /unsupported/i
  );
  assert.match(
    validateRequest({ version: CONTRACT_VERSION, token, operation: 'route-catalog-task', taskId: -1 }, token),
    /non-negative/
  );
  assert.match(
    validateRequest({ version: CONTRACT_VERSION, token, operation: 'mod-inspect-package', filePath: '' }, token),
    /package file/
  );
  assert.match(
    validateRequest({
      version: CONTRACT_VERSION,
      token,
      operation: 'mod-save-auditor-proposal',
      findingIds: ['same', 'same']
    }, token),
    /review findings/
  );
  assert.match(
    validateRequest({
      version: CONTRACT_VERSION,
      token,
      operation: 'appearance-tweak-proposals',
      goal: 'Reduce motion',
      settings: { transparency: true, windowAnimations: false, command: true }
    }, token),
    /supported appearance settings/
  );
  assert.equal(isValidPipePath('\\\\.\\pipe\\capsule-os-browser-0123456789abcdef01234567'), true);
  assert.equal(isValidPipePath('\\\\.\\pipe\\capsule-os-browser-relative'), false);
});

test('learning and cache bridge operations remain fixed, bounded and explicitly confirmed', () => {
  const token = 'b'.repeat(64);
  const base = { version: CONTRACT_VERSION, token };
  for (const operation of ['learning-list', 'review-cache-status']) {
    assert.equal(validateRequest({ ...base, operation }, token), null);
    assert.match(validateRequest({ ...base, operation, path: 'C:\\private' }, token), /Unsupported/);
  }
  const request = {
    ...base, operation: 'learning-approve', findingId: 'package-reader',
    sourceSha256: 'a'.repeat(64), text: 'Review semantic structure.', category: 'structure', confirmed: true
  };
  assert.equal(validateRequest(request, token), null);
  assert.match(validateRequest({ ...request, confirmed: false }, token), /Approve/);
  assert.match(validateRequest({ ...request, text: 'x'.repeat(601) }, token), /1-600/);
  assert.match(validateRequest({ ...request, category: 'shell' }, token), /Approve/);
  assert.equal(validateRequest({ ...base, operation: 'review-cache-clear', confirmed: true }, token), null);
  assert.match(validateRequest({ ...base, operation: 'review-cache-clear', confirmed: false }, token), /Confirm/);
});

test('named-pipe bridge serves a live snapshot and delegates only catalog task ids', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-bridge-test-'));
  const bridge = new CompanionBridge({
    directory,
    getSnapshot: async () => ({ tasks: [{ id: 2 }], ledgerValid: true }),
    routeCatalogTask: async (taskId) => taskId === 2
      ? { ok: true, message: 'Receipt sealed.' }
      : { ok: false, message: 'Choose a task ID from the published Capsule catalog.' },
    handleAssistantRequest: async (request) => ({
      ok: true,
      status: { state: 'model-idle' },
      handledOperation: request.operation
    })
  });
  t.after(async () => {
    await bridge.stop();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await bridge.start();

  const snapshot = await exchange(bridge.pipePath, {
    version: CONTRACT_VERSION,
    token: bridge.token,
    operation: 'snapshot'
  });
  assert.equal(snapshot.contractVersion, CONTRACT_VERSION);
  assert.deepEqual(snapshot.snapshot, { tasks: [{ id: 2 }], ledgerValid: true });

  const receipt = await exchange(bridge.pipePath, {
    version: CONTRACT_VERSION,
    token: bridge.token,
    operation: 'route-catalog-task',
    taskId: 2
  });
  assert.deepEqual(receipt, {
    ok: true,
    message: 'Receipt sealed.',
    contractVersion: CONTRACT_VERSION
  });

  const rejected = await exchange(bridge.pipePath, {
    version: CONTRACT_VERSION,
    token: bridge.token,
    operation: 'route-catalog-task',
    taskId: 400
  });
  assert.equal(rejected.ok, false);

  const assistantStatus = await exchange(bridge.pipePath, {
    version: CONTRACT_VERSION,
    token: bridge.token,
    operation: 'assistant-status'
  });
  assert.deepEqual(assistantStatus, {
    ok: true,
    status: { state: 'model-idle' },
    handledOperation: 'assistant-status',
    contractVersion: CONTRACT_VERSION
  });

  const appearanceProposal = await exchange(bridge.pipePath, {
    version: CONTRACT_VERSION,
    token: bridge.token,
    operation: 'appearance-tweak-proposals',
    goal: 'Reduce window motion',
    settings: { transparency: true, windowAnimations: true }
  });
  assert.deepEqual(appearanceProposal, {
    ok: true,
    status: { state: 'model-idle' },
    handledOperation: 'appearance-tweak-proposals',
    contractVersion: CONTRACT_VERSION
  });

  const unauthenticated = await exchange(bridge.pipePath, {
    version: CONTRACT_VERSION,
    token: '0'.repeat(64),
    operation: 'snapshot'
  });
  assert.equal(unauthenticated.ok, false);
  assert.match(unauthenticated.message, /authentication failed/);
});
