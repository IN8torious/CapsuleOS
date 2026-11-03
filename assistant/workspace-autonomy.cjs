'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID, createHash } = require('node:crypto');
const sha = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const extensions = new Set(['.html', '.css', '.md', '.txt']);
const MAX_FILE = 32 * 1024, MAX_HISTORY = 10;
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

function validateWorkspaceRequest(action, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  if (['status', 'revoke', 'undo'].includes(action)) return keys.length === 0;
  return action === 'grant' && keys.length === 2 && keys.includes('folder') && keys.includes('confirmed')
    && typeof payload.folder === 'string' && payload.folder.length <= 32768 && !payload.folder.includes('\0')
    && path.isAbsolute(payload.folder) && payload.confirmed === true;
}

class WorkspaceAutonomy {
  constructor({ directory, forbiddenRoots = [] }) {
    this.file = path.join(directory, 'workspace-autonomy.json');
    this.forbiddenRoots = [directory, ...forbiddenRoots, process.env.WINDIR, process.env.ProgramFiles, process.env.ProgramData]
      .filter(Boolean).map(item => path.resolve(item));
    this.queue = Promise.resolve();
  }
  serial(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
  async read() {
    let bytes;
    try { bytes = await fs.readFile(this.file); }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, grant: null, checkpoints: [] }; throw error; }
    if (bytes.length > 3 * 1024 * 1024) throw new Error('Workspace history exceeds its limit; it was not overwritten.');
    const doc = JSON.parse(bytes.toString('utf8'));
    const validGrant = grant => grant && uuid(grant.id) && typeof grant.folder === 'string' && path.isAbsolute(grant.folder)
      && Number.isSafeInteger(grant.at) && grant.at > 0;
    if (doc.version !== 1 || (doc.grant !== null && !validGrant(doc.grant)) || !Array.isArray(doc.checkpoints)
      || doc.checkpoints.length > MAX_HISTORY || doc.checkpoints.some(item =>
        !uuid(item.id) || !validGrant(item.grant) || typeof item.relative !== 'string'
        || !['pending', 'applied', 'undone'].includes(item.state) || !Number.isSafeInteger(item.at)
        || typeof item.before !== 'string' || Buffer.byteLength(item.before) > MAX_FILE
        || !digest(item.beforeSha256) || sha(item.before) !== item.beforeSha256 || !digest(item.afterSha256))) {
      throw new Error('Workspace history is invalid; it was not overwritten.');
    }
    return doc;
  }
  async write(doc) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(doc), { flag: 'wx' });
      await fs.rename(temporary, this.file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  async root(folder) {
    const resolved = path.resolve(folder);
    if (resolved === path.parse(resolved).root || resolved === path.resolve(os.homedir())
      || this.forbiddenRoots.some(protectedRoot => inside(protectedRoot, resolved) || inside(resolved, protectedRoot))) {
      throw new Error('Choose a project folder, not a drive, home, system, Toolbox application or runtime folder.');
    }
    let current = path.parse(resolved).root;
    for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      const stat = await fs.lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Workspace folders cannot traverse symlinks or junctions.');
    }
    if (path.relative(await fs.realpath(resolved), resolved)) throw new Error('The workspace folder changed identity.');
    return resolved;
  }
  async target(grant, relative) {
    const root = await this.root(grant.folder);
    if (typeof relative !== 'string' || !relative || relative.length > 240
      || path.isAbsolute(relative) || /[\\/:*?"<>|\0]/.test(relative)
      || relative.startsWith('.') || !extensions.has(path.extname(relative).toLowerCase())) {
      throw new Error('Automatic edits support existing top-level HTML, CSS, Markdown and text files only.');
    }
    const file = path.join(root, relative), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_FILE) {
      throw new Error('The file is linked, too large or not a regular workspace document.');
    }
    const bytes = await fs.readFile(file);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (content.includes('\0') || bytes.length > MAX_FILE || sha(content) !== sha(bytes)) throw new Error('Only bounded UTF-8 documents are supported.');
    return { file, content, sha256: sha(bytes) };
  }
  async status() {
    const doc = await this.read();
    return { ok: true, grant: doc.grant, checkpoints: doc.checkpoints.map(({ before, ...item }) => item),
      policy: 'balanced', supported: 'Existing top-level .html, .css, .md and .txt; one checkpointed file per refinement.' };
  }
  async request(action, payload) {
    if (!validateWorkspaceRequest(action, payload)) throw new Error('Unsupported workspace permission action.');
    return this.serial(async () => {
      const doc = await this.read();
      if (action === 'grant') {
        if (doc.checkpoints.some(item => item.state === 'pending')) throw new Error('Resolve the interrupted checkpoint with Undo before granting another workspace.');
        doc.grant = { id: randomUUID(), folder: await this.root(payload.folder), at: Date.now() };
        await this.write(doc);
      } else if (action === 'revoke') {
        doc.grant = null; await this.write(doc);
      } else if (action === 'undo') {
        const checkpoint = doc.checkpoints.findLast(item => item.state !== 'undone');
        if (!checkpoint) throw new Error('No workspace edit is available to Undo.');
        const target = await this.target(checkpoint.grant, checkpoint.relative);
        if (![checkpoint.beforeSha256, checkpoint.afterSha256].includes(target.sha256)) {
          throw new Error('The document changed outside this edit. Undo will not overwrite your newer work.');
        }
        if (target.sha256 === checkpoint.afterSha256) await this.replace(target, checkpoint.before);
        checkpoint.state = 'undone';
        await this.write(doc);
      }
      return this.status();
    });
  }
  async snapshot() {
    const doc = await this.read();
    if (!doc.grant) return null;
    const root = await this.root(doc.grant.folder), files = [], omitted = [];
    let chars = 0;
    for (const entry of (await fs.readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || entry.name.startsWith('.') || !extensions.has(path.extname(entry.name).toLowerCase())) continue;
      const stat = await fs.lstat(path.join(root, entry.name));
      if (files.length >= 8 || stat.nlink !== 1 || stat.size > Math.min(MAX_FILE, 12000 - chars)) {
        if (omitted.length < 20) omitted.push({ path: entry.name, reason: 'Outside the bounded local context size/file budget, or linked.' });
        continue;
      }
      const target = await this.target(doc.grant, entry.name);
      if (chars + target.content.length > 12000) continue;
      files.push({ path: entry.name, content: target.content, sha256: target.sha256 });
      chars += target.content.length;
    }
    return { grant: doc.grant, files, omitted };
  }
  async replace(target, content) {
    const temporary = `${target.file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, content, { flag: 'wx' });
      if (sha(await fs.readFile(target.file)) !== target.sha256) throw new Error('The document changed before commit; the edit was not applied.');
      await fs.rename(temporary, target.file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  async apply(grantId, candidate) {
    return this.serial(async () => {
      const doc = await this.read();
      if (!doc.grant || doc.grant.id !== grantId) throw new Error('The workspace permission changed or was revoked.');
      if (doc.checkpoints.some(item => item.state === 'pending')) throw new Error('An interrupted edit needs Undo before further writes.');
      if (!candidate || Object.keys(candidate).sort().join(',') !== 'beforeSha256,content,path'
        || !digest(candidate.beforeSha256) || typeof candidate.content !== 'string'
        || !candidate.content.trim() || candidate.content.includes('\0') || Buffer.byteLength(candidate.content) > MAX_FILE) {
        throw new Error('The proposed edit is not a bounded reversible document replacement.');
      }
      const target = await this.target(doc.grant, candidate.path);
      if (target.sha256 !== candidate.beforeSha256) throw new Error('The source changed; the stale edit was not applied.');
      if (target.content === candidate.content) return { changed: false };
      const checkpoint = { id: randomUUID(), grant: doc.grant, relative: candidate.path,
        before: target.content, beforeSha256: target.sha256, afterSha256: sha(candidate.content), at: Date.now(), state: 'pending' };
      // Persist recovery before replacing a document. Interrupted writes block later edits.
      doc.checkpoints = [...doc.checkpoints, checkpoint].slice(-MAX_HISTORY);
      await this.write(doc);
      await this.replace(target, candidate.content);
      checkpoint.state = 'applied';
      await this.write(doc);
      return { changed: true, checkpointId: checkpoint.id, file: candidate.path };
    });
  }
}

module.exports = { WorkspaceAutonomy, validateWorkspaceRequest };
