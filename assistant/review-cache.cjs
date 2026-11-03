'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const MAX_CACHE_BYTES = 2 * 1024 ** 3;
const MAX_ITEM_BYTES = 1024 ** 2;
const MAX_ITEMS = 4096;
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

class ReviewCache {
  constructor(root, { maxBytes = MAX_CACHE_BYTES, expiryMs = EXPIRY_MS, now = Date.now } = {}) {
    this.root = root;
    this.maxBytes = maxBytes;
    this.expiryMs = expiryMs;
    this.now = now;
    this.queue = Promise.resolve();
  }

  serial(task) {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  async entries() {
    await fs.mkdir(this.root, { recursive: true });
    const rootStat = await fs.lstat(this.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Review cache must be a regular local directory.');
    const names = await fs.readdir(this.root);
    const entries = [];
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) {
        if (/^[a-f0-9]{64}\.[a-f0-9-]{36}\.tmp$/.test(name)) {
          const temporary = path.join(this.root, name);
          const stat = await fs.lstat(temporary);
          if (stat.isFile() && !stat.isSymbolicLink()) await fs.unlink(temporary);
        }
        continue;
      }
      const file = path.join(this.root, name);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Review cache contains an unsupported file or link.');
      entries.push({ file, name, size: stat.size, accessed: stat.mtimeMs });
    }
    return entries.sort((a, b) => a.accessed - b.accessed || a.name.localeCompare(b.name));
  }

  async sweep(reserve = 0, reserveItems = 0) {
    let entries = await this.entries();
    const retained = [];
    for (const entry of entries) {
      if (this.now() - entry.accessed >= this.expiryMs || entry.size > MAX_ITEM_BYTES) await fs.unlink(entry.file);
      else retained.push(entry);
    }
    entries = retained;
    let used = entries.reduce((sum, entry) => sum + entry.size, 0);
    while (entries.length && (used + reserve > this.maxBytes || entries.length + reserveItems > MAX_ITEMS)) {
      const entry = entries.shift();
      await fs.unlink(entry.file);
      used -= entry.size;
    }
    return { usedBytes: used, itemCount: entries.length, maxBytes: this.maxBytes, expiryDays: this.expiryMs / 86400000 };
  }

  filename(key) {
    return path.join(this.root, `${createHash('sha256').update(key).digest('hex')}.json`);
  }

  status() { return this.serial(() => this.sweep()); }

  get(key) {
    return this.serial(async () => {
      await this.sweep();
      const file = this.filename(key);
      let bytes;
      try { bytes = await fs.readFile(file); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      let item;
      try { item = JSON.parse(bytes.toString('utf8')); }
      catch { throw new Error('A cached review is malformed. Clear the review cache in settings.'); }
      if (item.version !== 1 || item.key !== key || !Number.isSafeInteger(item.savedAt) || !('value' in item)) {
        throw new Error('A cached review has an unsupported format. Clear the review cache in settings.');
      }
      const time = new Date(this.now());
      await fs.utimes(file, time, time);
      return item;
    });
  }

  put(key, value) {
    return this.serial(async () => {
      const bytes = Buffer.from(JSON.stringify({ version: 1, key, savedAt: this.now(), value }));
      if (bytes.length > MAX_ITEM_BYTES || bytes.length > this.maxBytes) throw new Error('This review exceeds the cache item limit.');
      const file = this.filename(key);
      await this.entries();
      // Replacement is disposable, but never touches approved learning or source files.
      await fs.rm(file, { force: true });
      await this.sweep(bytes.length, 1);
      const temporary = file.replace(/\.json$/, `.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, bytes, { flag: 'wx' });
        await fs.rename(temporary, file);
        const time = new Date(this.now());
        await fs.utimes(file, time, time);
      } finally { await fs.rm(temporary, { force: true }); }
    });
  }

  clear() {
    return this.serial(async () => {
      for (const entry of await this.entries()) await fs.unlink(entry.file);
      return this.sweep();
    });
  }
}

module.exports = { ReviewCache, MAX_CACHE_BYTES, EXPIRY_MS };
