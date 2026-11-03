const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable, Readable } = require('node:stream');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');
const {
  DEFAULT_SETTINGS, validateSettings, parseDistributions, inspectDistributions,
  readSettings, writeSettings, WslWorker, inspectHost, manageDistribution
} = require('../assistant/wsl-runtime.cjs');
const { AssistantController } = require('../assistant/controller.cjs');
const { validateRequest, CONTRACT_VERSION } = require('../capsule/companion-bridge.cjs');

test('WSL2 is explicit opt-in with bounded distro names and no command arguments', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { policy: 'windows', distro: '' });
  assert.deepEqual(validateSettings({ policy: 'prefer-wsl', distro: 'Pengwin' }), { policy: 'prefer-wsl', distro: 'Pengwin' });
  for (const value of [
    null, [], {}, { policy: 'auto', distro: 'Ubuntu' },
    { policy: 'prefer-wsl', distro: '' }, { policy: 'prefer-wsl', distro: '-e' },
    { policy: 'prefer-wsl', distro: 'Ubuntu;whoami' }, { policy: 'prefer-wsl', distro: 'a b' },
    { policy: 'windows', distro: '', command: 'anything' }
  ]) assert.throws(() => validateSettings(value));
  assert.deepEqual(parseDistributions('  NAME STATE VERSION\r\n* Pengwin Running 2\r\n Ubuntu-24.04 Stopped 2\r\n Legacy Stopped 1\r\n docker-desktop Running 2\r\n'), ['Pengwin', 'Ubuntu-24.04']);
  assert.deepEqual(parseDistributions('No distributions installed'), []);
});

test('inventory reads only registered WSL2 distros with timeout and UTF16 decoding', async () => {
  let invocation;
  const run = (file, args, options, callback) => {
    invocation = { file, args, options };
    callback(null, Buffer.from(args.includes('--verbose') ? '* Pengwin Running 2\r\n Legacy Stopped 1' : 'Pengwin\r\nLegacy\r\n', 'utf16le'), Buffer.alloc(0));
  };
  assert.deepEqual(await inspectDistributions(run, 'win32'), ['Pengwin']);
  assert.deepEqual(invocation.args, ['--list', '--quiet']);
  assert.match(invocation.file, /\\System32\\wsl.exe$/);
  assert.equal(invocation.options.timeout, 10000);
  await assert.rejects(inspectDistributions(run, 'linux'), /Windows host/);
  await assert.rejects(inspectDistributions((_file, _args, _options, callback) => {
    callback(new Error('exit'), Buffer.from('WSL is not installed', 'utf16le'), Buffer.alloc(0));
  }, 'win32'), /not installed/);
});

test('runtime preference persists without changing defaults on malformed storage', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-runtime-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'runtime.json');
  assert.deepEqual(await readSettings(file), DEFAULT_SETTINGS);
  const settings = { policy: 'prefer-wsl', distro: 'Pengwin' };
  await writeSettings(file, settings);
  assert.deepEqual(await readSettings(file), settings);
  await fs.writeFile(file, '{broken');
  await assert.rejects(readSettings(file), /could not be read/);
});

test('host inventory distinguishes running state and management allows only confirmed registered distro actions', async () => {
  const calls = [];
  const run = (_exe, args, _options, callback) => {
    calls.push(args);
    callback(null, Buffer.from(args.includes('--verbose') ? ' Pengwin Stopped 2\r\n Ubuntu Running 2\r\n'
      : args.includes('--running') ? 'Ubuntu\r\n' : args.includes('--quiet') ? 'Pengwin\r\nUbuntu\r\n' : '', 'utf16le'), Buffer.alloc(0));
  };
  assert.deepEqual(await inspectHost(run, 'win32'), { distributions: ['Pengwin', 'Ubuntu'], unavailable: [], running: ['Ubuntu'] });
  await manageDistribution({ action: 'start', distro: 'Pengwin', confirmed: true }, run, 'win32');
  assert.deepEqual(calls.at(-1), ['--distribution', 'Pengwin', '--cd', '~', '--exec', '/bin/true']);
  await manageDistribution({ action: 'stop', distro: 'Pengwin', confirmed: true }, run, 'win32');
  assert.deepEqual(calls.at(-1), ['--terminate', 'Pengwin']);
  const count = calls.length;
  for (const action of ['shutdown', 'unregister', 'install', 'exec']) {
    await assert.rejects(manageDistribution({ action, distro: 'Pengwin', confirmed: true }, run, 'win32'), /Confirm/);
  }
  await assert.rejects(manageDistribution({ action: 'stop', distro: 'Pengwin', confirmed: false }, run, 'win32'), /Confirm/);
  assert.equal(calls.length, count);
  await assert.rejects(manageDistribution({ action: 'stop', distro: 'missing', confirmed: true }, run, 'win32'), /not registered/);
  assert.deepEqual(calls.at(-1), ['--list', '--quiet']);
});

test('installing WSL2 entries stay visible but cannot be selected, started or stopped', async () => {
  const calls = [];
  const run = (_exe, args, _options, callback) => {
    calls.push(args);
    callback(null, Buffer.from(args.includes('--verbose')
      ? ' Pengwin Installing 2\r\n Ubuntu Stopped 2\r\n'
      : args.includes('--running') ? '' : 'Ubuntu\r\n', 'utf16le'), Buffer.alloc(0));
  };
  assert.deepEqual(await inspectHost(run, 'win32'), {
    distributions: ['Ubuntu'], unavailable: ['Pengwin'], running: []
  });
  for (const action of ['start', 'stop']) {
    await assert.rejects(manageDistribution({ action, distro: 'Pengwin', confirmed: true }, run, 'win32'), /not registered/);
  }
  assert.ok(calls.every(args => args[0] === '--list'));
});

function fakeTransport() {
  const child = new EventEmitter(), writes = [];
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({ write(chunk, _encoding, callback) { writes.push(chunk.toString()); callback(); } });
  child.kill = () => { child.emit('close', 0); };
  let invocation;
  const worker = new WslWorker({
    distro: 'Pengwin', bootstrap: 'fixed bootstrap', workerSource: 'trusted source',
    model: { id: 'approved' }, timeoutMs: 2000,
    spawnProcess(file, args, options) { invocation = { file, args, options }; return child; }
  });
  return { worker, child, writes, invocation };
}

test('Linux transport passes source as data, routes responses and closes only its own process', t => {
  const { worker, child, writes, invocation } = fakeTransport();
  t.after(() => { worker.terminate(); child.emit('close', 0); });
  const messages = []; worker.on('message', message => messages.push(message));
  assert.deepEqual(invocation.args.slice(0, 7), ['--distribution', 'Pengwin', '--cd', '~', '--exec', '/bin/sh', '-c']);
  assert.match(invocation.args[7], /capsule-agent\/node-v22\.23\.4-linux-x64\/bin\/node/);
  assert.match(invocation.args[7], /exec node "\$@"/);
  assert.deepEqual(invocation.args.slice(8), ['capsule-inference', '--input-type=module', '-e', 'fixed bootstrap']);
  assert.equal(invocation.options.shell, undefined);
  assert.equal(JSON.parse(writes[0]).workerSource, 'trusted source');
  assert.throws(() => worker.postMessage({ type: 'generate' }), /not ready/);
  child.stdout.write('{"type":"rea'); child.stdout.write('dy"}\n');
  const request = { type: 'generate', requestId: 'one', prompt: '$(never executed)' };
  worker.postMessage(request);
  assert.deepEqual(JSON.parse(writes[1]), request);
  child.stdout.write('{"type":"response","requestId":"one","text":"4"}\n');
  assert.equal(messages.at(-1).text, '4');
  worker.terminate();
  assert.equal(child.stdin.writableEnded, true);
  assert.throws(() => worker.postMessage(request), /not ready/);
});

test('Linux transport fails closed on malformed output, startup timeout and exit', async t => {
  for (const kind of ['malformed', 'oversize', 'exit']) {
    const { worker, child } = fakeTransport();
    t.after(() => { worker.terminate(); child.emit('close', 0); });
    const messages = []; worker.on('message', message => messages.push(message));
    if (kind === 'malformed') child.stdout.write('not json\n');
    if (kind === 'oversize') child.stdout.write('x'.repeat(1024 * 1024 + 1));
    if (kind === 'exit') child.emit('close', 3);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'initialization-error');
    assert.equal(worker.closed, true);
  }
  const { worker, child } = fakeTransport();
  t.after(() => { worker.terminate(); child.emit('close', 0); });
  const message = await new Promise(resolve => worker.once('message', resolve));
  assert.match(message.message, /timed out/);
});

function controllerFixture() {
  const controller = Object.create(AssistantController.prototype);
  Object.assign(controller, {
    runtimeSettingsReady: Promise.resolve(), runtimeSettings: { ...DEFAULT_SETTINGS },
    runtimeStatus: { backend: 'windows', phase: 'idle', message: 'Windows default' },
    pending: new Map(), activeModel: null, worker: null, loadVersion: 0,
    wslProvisioner: { busy: false },
    lastAssistantState: { type: 'model-idle' }, getWindows: () => []
  });
  return controller;
}

test('controller retries initialization on Windows, but never replays failed in-flight Linux work', async () => {
  const controller = controllerFixture(), worker = { capsuleReady: false, terminate() {} };
  controller.worker = worker; controller.activeModel = { id: 'phi-3-mini-4k-q4' };
  controller.runtimeStatus.backend = 'wsl2';
  let fallback;
  controller.loadModel = async (id, options) => { fallback = { id, options }; };
  controller.onWorkerMessage({ type: 'initialization-error', message: 'Missing Linux Node' }, worker);
  assert.equal(fallback.options.windowsOnly, true);
  assert.match(fallback.options.fallbackReason, /Missing Linux Node/);
  fallback = null;
  worker.capsuleReady = true;
  let response;
  controller.pending.set('one', { timer: setTimeout(() => {}, 1000), resolve: value => { response = value; } });
  controller.onWorkerMessage({ type: 'initialization-error', message: 'Linux process crashed' }, worker);
  assert.equal(fallback, null);
  assert.equal(response.ok, false);
  assert.equal(controller.worker, null);
  assert.equal(controller.runtimeStatus.phase, 'error');
});

test('Windows default load does not need WSL and rejects missing fallback assets explicitly', async () => {
  const controller = controllerFixture();
  controller.modelLocations = async () => new Map();
  const result = await controller.loadModel('phi-3-mini-4k-q4');
  assert.equal(result.ok, false);
  assert.match(result.message, /Windows fallback model/);
  assert.equal(controller.runtimeStatus.backend, 'windows');
  assert.equal(controller.getAssistantStatus().modelReady, false);
});

test('runtime settings retain authenticated, exact-field bridge validation', () => {
  const token = 'a'.repeat(64), request = settings => ({
    version: CONTRACT_VERSION, token, operation: 'agent-runtime-configure', settings
  });
  assert.equal(validateRequest(request({ policy: 'prefer-wsl', distro: 'Pengwin' }), token), null);
  assert.ok(validateRequest(request({ policy: 'prefer-wsl', distro: 'Pengwin', command: 'bash' }), token));
  assert.ok(validateRequest({ ...request({ policy: 'windows', distro: '' }), token: 'bad' }, token));
  const lifecycle = { version: CONTRACT_VERSION, token, operation: 'wsl-distribution-action', action: 'stop', distro: 'Pengwin', confirmed: true };
  assert.equal(validateRequest(lifecycle, token), null);
  assert.ok(validateRequest({ ...lifecycle, confirmed: false }, token));
  assert.ok(validateRequest({ ...lifecycle, action: 'shutdown' }, token));
  assert.ok(validateRequest({ ...lifecycle, distro: 'Pengwin;whoami' }, token));
  assert.ok(validateRequest({ ...lifecycle, command: 'bash' }, token));
});

test('production Linux bootstrap rejects a non-WSL host instead of running inference', { skip: process.platform === 'linux' }, async () => {
  const bootstrap = await fs.readFile(path.join(__dirname, '..', 'assistant', 'wsl-bootstrap.mjs'), 'utf8');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], { stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error('bootstrap did not exit')); }, 5000);
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', () => { clearTimeout(timer); resolve(stdout); });
    child.stdin.write(JSON.stringify({ type: 'initialize', model: {}, workerSource: '' }) + '\n');
  });
  assert.match(JSON.parse(result).message, /WSL2 Linux runtime/);
});

async function bootstrapFixture({ badHash = false, filesystem = 0xef53 } = {}) {
  const source = await fs.readFile(path.join(__dirname, '..', 'assistant', 'wsl-bootstrap.mjs'), 'utf8');
  const messages = [], workers = [], mkdirs = [], exits = [];
  const input = new EventEmitter();
  input.setEncoding = () => {};
  input.destroy = () => input.emit('close');
  class FixtureWorker extends EventEmitter {
    constructor(url, options) {
      super(); this.url = url; this.options = options;
      this.stdout = new PassThrough(); this.stderr = new PassThrough();
      workers.push(this); queueMicrotask(() => this.emit('message', { type: 'ready' }));
    }
    postMessage(request) { this.emit('message', { type: 'response', requestId: request.requestId, text: 'fixture response' }); }
    async terminate() { this.terminated = true; }
  }
  const payload = Buffer.from('safe');
  vm.runInNewContext(source.replace(/^import .+;\r?\n/gm, ''), {
    fs: { createReadStream: () => Readable.from([payload]) },
    fsp: {
      async realpath(value) { return value; }, async statfs() { return { type: filesystem }; },
      async mkdir(value) { mkdirs.push(value); }, async stat() { return { size: 4, isFile: () => true }; },
      async readFile() { return '{"version":"4.3.2"}'; }
    },
    os: { release: () => '6.6.87-microsoft-standard-WSL2', homedir: () => '/home/crew' },
    path: path.posix, crypto, pathToFileURL, Worker: FixtureWorker, Buffer, URL,
    createRequire: () => ({ resolve: () => '/home/crew/.local/share/capsule-agent/node_modules/@huggingface/transformers/dist/transformers.node.cjs' }),
    process: {
      platform: 'linux', versions: { node: '22.20.0' }, stdin: input, chdir() {},
      stdout: { write(line) { messages.push(JSON.parse(line)); } }, stderr: { write() {} },
      exit(code) { exits.push(code); }
    }
  });
  input.emit('data', JSON.stringify({
    type: 'initialize', workerSource: "import { pipeline } from '@huggingface/transformers';",
    model: { id: 'approved', dtype: 'q4', files: [{
      path: 'config.json', size: 4, sha256: badHash ? '0'.repeat(64) : crypto.createHash('sha256').update(payload).digest('hex')
    }] }
  }) + '\n');
  await new Promise(resolve => setImmediate(resolve));
  return { messages, workers, input, mkdirs, exits };
}

test('production Linux bootstrap verifies assets, uses Linux dependency paths and routes one shared worker', async () => {
  const fixture = await bootstrapFixture();
  assert.equal(fixture.messages[0].type, 'ready');
  assert.equal(fixture.workers.length, 1);
  const worker = fixture.workers[0];
  assert.equal(worker.options.workerData.modelPath, '/home/crew/.local/share/capsule-agent/models/approved');
  const transportedSource = Buffer.from(worker.url.href.split(',')[1], 'base64').toString();
  assert.match(transportedSource, /file:.*transformers\.node\.mjs/);
  assert.deepEqual(fixture.mkdirs, ['/home/crew/.local/share/capsule-agent/transformers-cache']);
  fixture.input.emit('data', '{"type":"generate","requestId":"one","prompt":"read only"}\n');
  assert.equal(fixture.messages.at(-1).text, 'fixture response');
  fixture.input.emit('end');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(worker.terminated, true);
});

test('production Linux bootstrap refuses changed weights and non-ext4 storage before creating a worker', async () => {
  for (const options of [{ badHash: true }, { filesystem: 0x9fa0 }]) {
    const fixture = await bootstrapFixture(options);
    assert.equal(fixture.workers.length, 0);
    assert.equal(fixture.messages[0].type, 'initialization-error');
    assert.match(fixture.messages[0].message, /hash mismatch|ext4/);
  }
});
