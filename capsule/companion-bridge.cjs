'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { validateSettings } = require('../assistant/wsl-runtime.cjs');
const { getModelById } = require('../assistant/model-catalog.cjs');

const CONTRACT_VERSION = 2;
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
const MAX_REPLY_BYTES = 1024 * 1024;
const PIPE_PREFIX = '\\\\.\\pipe\\capsule-os-browser-';
const OPERATION_KEYS = new Map([
  ['snapshot', []],
  ['route-catalog-task', ['taskId']],
  ['assistant-status', []],
  ['agent-runtime-inspect', []],
  ['agent-runtime-configure', ['settings']],
  ['wsl-distribution-action', ['action', 'distro', 'confirmed']],
  ['wsl-setup-plan', ['distro']],
  ['wsl-setup-execute', ['distro', 'approvalId', 'confirmed']],
  ['assistant-catalog', []],
  ['html-components', ['action', 'payload']],
  ['orchestrator', ['action', 'payload']],
  ['workspace-access', ['action', 'payload']],
  ['bible-reference', ['action', 'payload']],
  ['assistant-load-model', ['modelId']],
  ['assistant-unload-model', []],
  ['assistant-download-model', ['modelId']],
  ['assistant-cancel-download', []],
  ['appearance-tweak-proposals', ['goal', 'settings']],
  ['scene-html-edit', ['source', 'goal']],
  ['mod-inspect-package', ['filePath']],
  ['mod-analysis-start', []],
  ['mod-analysis-status', ['jobId']],
  ['learning-list', []],
  ['learning-approve', ['findingId', 'sourceSha256', 'text', 'category', 'confirmed']],
  ['learning-forget', ['lessonId']],
  ['review-cache-status', []],
  ['review-cache-clear', ['confirmed']],
  ['mod-save-auditor-proposal', ['findingIds']],
  ['mod-list-kernel-proposals', []],
  ['mod-create-kernel-proposal', ['name', 'parentId']]
]);

function isValidPipePath(value) {
  return typeof value === 'string' &&
    value.startsWith(PIPE_PREFIX) &&
    /^[a-f0-9]{24}$/.test(value.slice(PIPE_PREFIX.length));
}

function constantTimeTokenMatch(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  return expectedBytes.length === actualBytes.length &&
    crypto.timingSafeEqual(expectedBytes, actualBytes);
}

function validateRequest(request, token) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return 'Invalid request.';
  if (request.version !== CONTRACT_VERSION) return 'Unsupported Capsule bridge version.';
  if (!constantTimeTokenMatch(token, request.token)) return 'Capsule bridge authentication failed.';

  const operationKeys = OPERATION_KEYS.get(request.operation);
  const allowedKeys = new Set(['version', 'token', 'operation', ...(operationKeys || [])]);
  if (!operationKeys || Object.keys(request).some((key) => !allowedKeys.has(key)) ||
      operationKeys.some((key) => !(key in request))) {
    return 'Unsupported Capsule bridge operation.';
  }
  if (request.operation === 'orchestrator' &&
      !require('../assistant/orchestrator.cjs').validateRequest(request.action, request.payload)) {
    return 'Choose a bounded orchestrator action; no arbitrary tools or administrator authority are available.';
  }
  if (request.operation === 'workspace-access'
      && !require('../assistant/workspace-autonomy.cjs').validateWorkspaceRequest(request.action, request.payload)) return 'Unsupported workspace permission action.';
  if (request.operation === 'bible-reference'
      && !require('../assistant/bible-canon.cjs').validateBibleRequest(request.action, request.payload)) return 'Unsupported Bible reference action.';
  if (request.operation === 'route-catalog-task' &&
      (!Number.isSafeInteger(request.taskId) || request.taskId < 0 || request.taskId > 10000)) {
    return 'Task ID must be a non-negative catalog identifier.';
  }
  if (
    ['assistant-load-model', 'assistant-download-model'].includes(request.operation) &&
    (typeof request.modelId !== 'string' || !getModelById(request.modelId))
  ) return 'Choose a model from the approved local catalog.';
  if (request.operation === 'appearance-tweak-proposals') {
    const settings = request.settings;
    if (
      typeof request.goal !== 'string' ||
      !request.goal.trim() ||
      request.goal.length > 240 ||
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).length !== 2 ||
      !Object.keys(settings).every((key) => ['transparency', 'windowAnimations'].includes(key)) ||
      !['transparency', 'windowAnimations'].every((key) =>
        settings[key] === null || typeof settings[key] === 'boolean'
      )
    ) return 'Provide a short goal and only the current values for supported appearance settings.';
  }
  if (request.operation === 'html-components') {
    const { action, payload } = request;
    if (action === 'import') {
      if (!payload || Object.keys(payload).length !== 2 || typeof payload.name !== 'string'
        || !payload.name.trim() || payload.name.length > 120 || /[\\/\x00-\x1f]/.test(payload.name)
        || !['source', 'name'].every(key => Object.hasOwn(payload, key))
        || typeof payload.source !== 'string' || !payload.source.trim() || payload.source.includes('\0')
        || Buffer.byteLength(payload.source) > 256 * 1024) return 'Scene component review requires a name and nonempty source up to 256 KiB; no file paths or tools.';
      return null;
    }
    const fields = { inspect: [], library: [], discard: ['confirmed'], forget: ['id', 'confirmed'],
      propose: ['sourceSha256', 'goal'], export: ['sourceSha256', 'componentIds'], retain: ['sourceSha256', 'componentIds', 'confirmed'] }[action];
    if (!fields || !payload || Array.isArray(payload) || typeof payload !== 'object'
        || Object.keys(payload).length !== fields.length || fields.some(key => !Object.hasOwn(payload, key))) return 'Invalid component action fields.';
    if (fields.includes('confirmed') && payload.confirmed !== true) return 'Explicit component approval is required.';
    if (fields.includes('sourceSha256') && !/^[a-f0-9]{64}$/.test(payload.sourceSha256)) return 'Invalid source fingerprint.';
    if (fields.includes('goal') && (typeof payload.goal !== 'string' || !payload.goal.trim() || payload.goal.length > 600)) return 'Provide a bounded retention goal.';
    if (fields.includes('id') && (typeof payload.id !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.id))) return 'Invalid component identifier.';
    if (fields.includes('componentIds') && (!Array.isArray(payload.componentIds) || payload.componentIds.length < 1 || payload.componentIds.length > 80
      || new Set(payload.componentIds).size !== payload.componentIds.length || payload.componentIds.some(id => typeof id !== 'string' || !/^part-[1-9][0-9]?$/.test(id)))) return 'Choose valid unique component IDs.';
  }
  if (request.operation === 'scene-html-edit' && (
    typeof request.source !== 'string' || !request.source.trim() || request.source.length > 8000 ||
    typeof request.goal !== 'string' || !request.goal.trim() || request.goal.length > 600
  )) return 'Provide bounded scene HTML and a short editing goal.';
  if (request.operation === 'agent-runtime-configure') {
    try { validateSettings(request.settings); }
    catch (error) { return error.message; }
  }
  if (['wsl-setup-plan', 'wsl-setup-execute'].includes(request.operation)) {
    try { validateSettings({ policy: 'prefer-wsl', distro: request.distro }); }
    catch (error) { return error.message; }
    if (request.operation === 'wsl-setup-execute' && (request.confirmed !== true
      || typeof request.approvalId !== 'string' || !/^[a-f0-9-]{36}$/.test(request.approvalId))) return 'Explicit approval of the current WSL setup plan is required.';
  }
  if (request.operation === 'wsl-distribution-action') {
    if (!['start', 'stop'].includes(request.action) || request.confirmed !== true) return 'Confirm a listed WSL2 Start or Stop action.';
    try { validateSettings({ policy: 'prefer-wsl', distro: request.distro }); }
    catch (error) { return error.message; }
  }
  if (
    request.operation === 'mod-inspect-package' &&
    (typeof request.filePath !== 'string' || !request.filePath.trim() || request.filePath.length > 32768)
  ) return 'Choose a valid local package file.';
  if (request.operation === 'learning-approve' && (
    typeof request.findingId !== 'string' || request.findingId.length > 80 ||
    typeof request.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(request.sourceSha256) ||
    typeof request.text !== 'string' || !request.text.trim() || request.text.length > 600 ||
    !['structure', 'style', 'interaction', 'accessibility', 'performance', 'evidence'].includes(request.category) ||
    request.confirmed !== true
  )) return 'Approve a cited current finding with a category and 1-600 character lesson.';
  if (request.operation === 'learning-forget' &&
    (typeof request.lessonId !== 'string' || !/^[a-f0-9-]{36}$/i.test(request.lessonId))) {
    return 'Choose an existing approved lesson.';
  }
  if (request.operation === 'review-cache-clear' && request.confirmed !== true) return 'Confirm before clearing the review cache.';
  if (
    request.operation === 'mod-analysis-status' &&
    (typeof request.jobId !== 'string' || !/^[a-f0-9-]{36}$/i.test(request.jobId))
  ) return 'The mod-analysis job identifier is invalid.';
  if (request.operation === 'mod-save-auditor-proposal' &&
      (!Array.isArray(request.findingIds) || request.findingIds.length < 1 ||
        request.findingIds.length > 4 ||
        request.findingIds.some((id) => typeof id !== 'string') ||
        new Set(request.findingIds).size !== request.findingIds.length)) {
    return 'Select one to four available review findings.';
  }
  if (
    request.operation === 'mod-create-kernel-proposal' &&
    (typeof request.name !== 'string' || !request.name.trim() || request.name.length > 100 ||
      (request.parentId !== null && request.parentId !== undefined &&
        (typeof request.parentId !== 'string' || !/^[a-f0-9-]{36}$/i.test(request.parentId))))
  ) return 'The kernel proposal details are invalid.';
  return null;
}

class CompanionBridge {
  constructor({ directory, getSnapshot, routeCatalogTask, handleAssistantRequest }) {
    if (
      typeof getSnapshot !== 'function' || typeof routeCatalogTask !== 'function' ||
      typeof handleAssistantRequest !== 'function'
    ) {
      throw new TypeError('Capsule bridge handlers are required.');
    }
    this.directory = directory;
    this.getSnapshot = getSnapshot;
    this.routeCatalogTask = routeCatalogTask;
    this.handleAssistantRequest = handleAssistantRequest;
    this.pipePath = `${PIPE_PREFIX}${crypto.randomBytes(12).toString('hex')}`;
    this.token = crypto.randomBytes(32).toString('hex');
    this.server = null;
    this.endpointPath = path.join(directory, 'bridge.json');
  }

  async start() {
    await fs.mkdir(this.directory, { recursive: true });
    this.server = net.createServer((socket) => this.handleSocket(socket));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.pipePath, resolve);
    });
    const temporaryPath = `${this.endpointPath}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporaryPath, JSON.stringify({
        version: CONTRACT_VERSION,
        pipePath: this.pipePath,
        token: this.token,
        pid: process.pid
      }), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporaryPath, this.endpointPath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      await this.stop();
      throw error;
    }
  }

  async handleSocket(socket) {
    socket.setTimeout(720_000, () => socket.destroy());
    let input = Buffer.alloc(0);
    let handled = false;
    socket.on('data', async (chunk) => {
      if (handled) return;
      input = Buffer.concat([input, chunk]);
      if (input.length > MAX_MESSAGE_BYTES) {
        socket.end(JSON.stringify({ ok: false, message: 'Capsule bridge request is too large.' }) + '\n');
        return;
      }
      const newline = input.indexOf(0x0a);
      if (newline < 0) return;
      handled = true;
      socket.pause();
      let response;
      try {
        const request = JSON.parse(input.subarray(0, newline).toString('utf8'));
        const invalid = validateRequest(request, this.token);
        if (invalid) {
          response = { ok: false, message: invalid };
        } else if (request.operation === 'snapshot') {
          response = { ok: true, snapshot: await this.getSnapshot(), contractVersion: CONTRACT_VERSION };
        } else if (request.operation === 'route-catalog-task') {
          response = {
            ...await this.routeCatalogTask(request.taskId),
            contractVersion: CONTRACT_VERSION
          };
        } else {
          response = {
            ...await this.handleAssistantRequest(request),
            contractVersion: CONTRACT_VERSION
          };
        }
      } catch (error) {
        response = {
          ok: false,
          message: error instanceof Error ? error.message : 'Capsule bridge request failed.'
        };
      }
      const serialized = `${JSON.stringify(response)}\n`;
      if (Buffer.byteLength(serialized, 'utf8') > MAX_REPLY_BYTES) {
        socket.end(`${JSON.stringify({
          ok: false,
          message: 'Capsule browser sent an oversized bridge response.',
          contractVersion: CONTRACT_VERSION
        })}\n`);
        return;
      }
      socket.end(serialized);
    });
  }

  async stop() {
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      const endpoint = JSON.parse(await fs.readFile(this.endpointPath, 'utf8'));
      if (endpoint.pid === process.pid && endpoint.pipePath === this.pipePath) {
        await fs.unlink(this.endpointPath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = {
  CONTRACT_VERSION,
  MAX_MESSAGE_BYTES,
  MAX_REPLY_BYTES,
  PIPE_PREFIX,
  CompanionBridge,
  constantTimeTokenMatch,
  isValidPipePath,
  validateRequest
};
