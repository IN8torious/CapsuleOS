'use strict';

const { EventEmitter } = require('node:events');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const WSL_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe');
const DEFAULT_SETTINGS = Object.freeze({ policy: 'windows', distro: '' });
const MAX_LINE_BYTES = 1024 * 1024;

function validateSettings(settings) {
  if (!settings || Array.isArray(settings) || Object.keys(settings).length !== 2 ||
      !['windows', 'prefer-wsl'].includes(settings.policy) ||
      typeof settings.distro !== 'string' ||
      (settings.distro !== '' && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(settings.distro)) ||
      (settings.policy === 'prefer-wsl' && !settings.distro)) {
    throw new Error('Choose Windows or an explicitly selected existing WSL2 distribution.');
  }
  return { policy: settings.policy, distro: settings.distro };
}

function parseDistributions(output) {
  return output.replace(/\0/g, '').split(/\r?\n/).flatMap(line => {
    const match = /^\s*\*?\s*([a-zA-Z0-9][a-zA-Z0-9._-]{0,79})\s+.+?\s+2\s*$/.exec(line);
    return match && !/^docker-desktop(?:-data)?$/i.test(match[1]) ? [match[1]] : [];
  });
}

async function runWsl(args, run = execFile, platform = process.platform) {
  if (platform !== 'win32') throw new Error('The WSL2 backend requires a Windows host.');
  const output = await new Promise((resolve, reject) => {
    run(WSL_EXE, args, {
      windowsHide: true, encoding: 'buffer', timeout: 10000, maxBuffer: 128 * 1024
    }, (error, stdout, stderr) => {
      const decode = bytes => Buffer.isBuffer(bytes)
        ? bytes.toString(bytes.includes(0) ? 'utf16le' : 'utf8') : String(bytes || '').replace(/\0/g, '');
      if (error) reject(new Error(`WSL operation failed: ${(decode(stderr) || decode(stdout) || error.message).trim().slice(0, 500)}`));
      else resolve(decode(stdout));
    });
  });
  return output;
}

async function inspectInventory(run = execFile, platform = process.platform) {
  const listed = [...new Set(parseDistributions(await runWsl(['--list', '--verbose'], run, platform)))];
  // Verbose output can include Installing/Uninstalling entries that cannot be launched.
  const registered = (await runWsl(['--list', '--quiet'], run, platform))
    .replace(/\0/g, '').split(/\r?\n/).map(name => name.trim());
  return {
    distributions: listed.filter(name => registered.includes(name)),
    unavailable: listed.filter(name => !registered.includes(name))
  };
}

async function inspectDistributions(run = execFile, platform = process.platform) {
  return (await inspectInventory(run, platform)).distributions;
}

async function inspectHost(run = execFile, platform = process.platform) {
  const { distributions, unavailable } = await inspectInventory(run, platform);
  const runningNames = (await runWsl(['--list', '--running', '--quiet'], run, platform))
    .replace(/\0/g, '').split(/\r?\n/).map(name => name.trim());
  return { distributions, unavailable, running: distributions.filter(name => runningNames.includes(name)) };
}

async function manageDistribution({ action, distro, confirmed }, run = execFile, platform = process.platform) {
  validateSettings({ policy: 'prefer-wsl', distro });
  if (!['start', 'stop'].includes(action) || confirmed !== true) throw new Error('Confirm a listed WSL2 Start or Stop action.');
  if (!(await inspectDistributions(run, platform)).includes(distro)) throw new Error('The selected WSL2 distribution is not registered or is managed by another application.');
  const args = action === 'start'
    ? ['--distribution', distro, '--cd', '~', '--exec', '/bin/true']
    : ['--terminate', distro];
  await runWsl(args, run, platform);
  return { ok: true, message: action === 'start'
    ? `Start request completed for ${distro}. Agent models are not automatically loaded; WSL may idle down.`
    : `${distro} was terminated. Its processes were stopped; files and the registered distribution were not deleted.` };
}

async function readSettings(file) {
  try { return validateSettings(JSON.parse(await fs.readFile(file, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_SETTINGS };
    throw new Error(`Agent runtime settings could not be read: ${error.message}`);
  }
}

async function writeSettings(file, value) {
  const settings = validateSettings(value);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(settings) + '\n', { mode: 0o600 });
  try { await fs.rename(temporary, file); }
  catch (error) { await fs.rm(temporary, { force: true }); throw error; }
  return settings;
}

// Only this app-owned bootstrap is executable. Requests and source text travel as JSON on stdin.
class WslWorker extends EventEmitter {
  constructor({ distro, bootstrap, workerSource, model, spawnProcess = spawn, timeoutMs = 120000 }) {
    super();
    validateSettings({ policy: 'prefer-wsl', distro });
    this.closed = false;
    this.ready = false;
    this.buffer = '';
    this.stderr = '';
    this.child = spawnProcess(WSL_EXE, [
      '--distribution', distro, '--cd', '~', '--exec', '/bin/sh', '-c',
      'if test -x "$HOME/.local/share/capsule-agent/node-v22.23.4-linux-x64/bin/node"; then exec "$HOME/.local/share/capsule-agent/node-v22.23.4-linux-x64/bin/node" "$@"; else exec node "$@"; fi',
      'capsule-inference', '--input-type=module', '-e', bootstrap
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, WSLENV: '' } });
    this.timer = setTimeout(() => this.fail('WSL2 model initialization timed out.'), timeoutMs);
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.receive(chunk));
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-2000); });
    this.child.on('error', error => this.fail(error.message));
    this.child.stdin.on('error', error => this.fail(`WSL2 input failed: ${error.message}`));
    this.child.on('close', code => {
      if (this.closed) return;
      this.fail(`WSL2 agent exited (${code ?? 'unknown'}). ${this.stderr.trim()}`);
    });
    this.child.stdin.write(JSON.stringify({ type: 'initialize', workerSource, model }) + '\n');
  }

  receive(chunk) {
    if (this.closed) return;
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES) return this.fail('WSL2 worker sent an oversized message.');
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      let message;
      try { message = JSON.parse(line); }
      catch { return this.fail('WSL2 worker sent invalid protocol data.'); }
      if (!message || !['ready', 'response', 'request-error', 'initialization-error'].includes(message.type) ||
          (message.type === 'response' && (typeof message.text !== 'string' || typeof message.requestId !== 'string')) ||
          (['request-error', 'initialization-error'].includes(message.type) && typeof message.message !== 'string')) {
        return this.fail('WSL2 worker sent an unsupported response.');
      }
      if (message.type === 'ready') {
        if (this.ready) return this.fail('WSL2 worker initialized twice.');
        this.ready = true; clearTimeout(this.timer);
      }
      this.emit('message', message);
      if (this.closed) return;
    }
  }

  postMessage(message) {
    if (this.closed || !this.ready) throw new Error('The WSL2 model is not ready.');
    const data = JSON.stringify(message) + '\n';
    if (Buffer.byteLength(data) > MAX_LINE_BYTES) throw new Error('The WSL2 workload is too large.');
    this.child.stdin.write(data);
  }

  fail(reason) {
    if (this.closed) return;
    this.terminate();
    this.emit('message', { type: 'initialization-error', message: reason.slice(0, 2400) });
  }

  terminate() {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.timer);
    // EOF makes the bootstrap terminate its own worker, not other distro services.
    this.child.stdin.end();
    this.killTimer = setTimeout(() => this.child.kill(), 3000);
    this.killTimer.unref();
    this.child.once('close', () => clearTimeout(this.killTimer));
  }
}

module.exports = { DEFAULT_SETTINGS, validateSettings, parseDistributions, inspectDistributions, inspectHost, manageDistribution, readSettings, writeSettings, WslWorker };
