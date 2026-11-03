import { Ledger } from '../kernel/si-kernel.js';

export const CYCLE_MS = 5 * 60 * 1000;
export const SIGNAL_COOLDOWN_MS = 60 * 1000;
export const SIGNAL_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SIGNALS = 200, MAX_IDEAS = 50, MAX_KERNELS = 12, MAX_RECEIPTS = 200;
const validKey = key => typeof key === 'string' && /^[a-z][a-z0-9:_.-]{0,119}$/i.test(key)
  && !['__proto__', 'constructor', 'prototype'].includes(key);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
const boundedText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;

export function emptyLedger() {
  return { version: 2, enabled: false, signals: {}, ideas: [], kernels: [], accepted: {}, rejected: {},
    receipts: [], lastCycle: 0, cycles: 0, revision: 0, processedRevision: 0 };
}

function seal(ledger, actor, event) {
  const journal = new Ledger();
  journal.entries = ledger.receipts;
  const sequence = (ledger.receipts.at(-1)?.seq || 0) + 1;
  journal.seal(actor, 'learning', event).seq = sequence;
  ledger.receipts = journal.entries;
  // Keep the bounded chain's original predecessor so its retained segment remains verifiable.
  if (ledger.receipts.length > MAX_RECEIPTS) ledger.receipts = ledger.receipts.slice(-MAX_RECEIPTS);
}

export function parseLedger(serialized) {
  if (!serialized) return emptyLedger();
  if (serialized.length > 256 * 1024) throw new Error('Local learning exceeds its storage limit.');
  const saved = JSON.parse(serialized);
  if (!record(saved) || !record(saved.signals) || !Array.isArray(saved.ideas) || !Array.isArray(saved.kernels)
    || !record(saved.accepted) || !record(saved.rejected) || !timestamp(saved.lastCycle) || !timestamp(saved.cycles)
    || Object.keys(saved.signals).length > MAX_SIGNALS || saved.ideas.length > MAX_IDEAS || saved.kernels.length > MAX_KERNELS) {
    throw new Error('Local learning has an unsupported format. It was not overwritten.');
  }
  const legacy = saved.version === undefined;
  if (!legacy && (saved.version !== 2 || typeof saved.enabled !== 'boolean' || !timestamp(saved.revision)
    || !timestamp(saved.processedRevision) || saved.processedRevision > saved.revision || !Array.isArray(saved.receipts)
    || saved.receipts.length > MAX_RECEIPTS)) throw new Error('Local learning version or receipts are invalid.');
  for (const [key, signal] of Object.entries(saved.signals)) {
    if (!validKey(key) || !record(signal) || !boundedText(signal.label, 80) || !Number.isSafeInteger(signal.count)
      || signal.count < 1 || !timestamp(signal.last) || (!legacy && (!timestamp(signal.first) || signal.first > signal.last))) {
      throw new Error('A saved learning signal is invalid.');
    }
  }
  for (const collection of [saved.accepted, saved.rejected]) {
    if (Object.keys(collection).length > 1000 || Object.entries(collection).some(([id, value]) => !validKey(id) || value !== true)) {
      throw new Error('Saved learning decisions are invalid.');
    }
  }
  const identities = new Set();
  for (const item of [...saved.ideas, ...saved.kernels]) {
    if (!record(item)) throw new Error('A saved idea or planet is invalid.');
    const name = item.title || item.name;
    if (!record(item) || !validKey(item.id) || identities.has(item.id) || !boundedText(name, 200) || !timestamp(item.createdAt)
      || (item.reason !== undefined && !boundedText(item.reason, 600)) || (item.detail !== undefined && !boundedText(item.detail, 800))
      || (item.kernelName !== undefined && !boundedText(item.kernelName, 200))) throw new Error('A saved idea or planet is invalid.');
    identities.add(item.id);
  }
  const result = { ...emptyLedger(), ...saved };
  if (legacy) {
    result.version = 2;
    result.enabled = false;
    result.receipts = [];
    for (const signal of Object.values(result.signals)) signal.first = signal.last;
    for (const planet of result.kernels) planet.detail = `Legacy usage-based organization; not verified knowledge. ${planet.detail || ''}`.slice(0, 800);
  } else {
    let previous = result.receipts[0]?.prev || 'genesis0', sequence = result.receipts[0]?.seq - 1 || 0;
    for (const receipt of result.receipts) {
      const journal = new Ledger();
      journal.entries = [{ hash: previous }];
      const expected = journal.seal(receipt.agent, 'learning', receipt.event).hash;
      if (!Number.isSafeInteger(receipt.seq) || receipt.seq !== sequence + 1 || receipt.prev !== previous || receipt.hash !== expected
        || receipt.seq < 1 || !['human', 'toolbox'].includes(receipt.agent) || !boundedText(receipt.event, 600)) throw new Error('The saved learning receipt chain is inconsistent.');
      previous = receipt.hash; sequence = receipt.seq;
    }
  }
  return result;
}

export function setLearningEnabled(ledger, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('Choose whether to enable local usage suggestions.');
  if (ledger.enabled !== enabled) {
    ledger.enabled = enabled;
    seal(ledger, 'human', enabled ? 'ENABLED local usage suggestions' : 'DISABLED local usage suggestions');
  }
  return ledger;
}

export function recordSignal(ledger, key, label, now = Date.now()) {
  if (!ledger.enabled) return ledger;
  if (!validKey(key) || !boundedText(label, 80) || !timestamp(now)) throw new Error('A bounded local workspace signal is required.');
  const entry = Object.hasOwn(ledger.signals, key) ? ledger.signals[key] : null;
  if (entry && now - entry.last < SIGNAL_COOLDOWN_MS) return ledger;
  for (const [old, signal] of Object.entries(ledger.signals)) if (now - signal.last > SIGNAL_EXPIRY_MS) delete ledger.signals[old];
  const fresh = Object.hasOwn(ledger.signals, key) ? ledger.signals[key] : { label, count: 0, first: now, last: now };
  fresh.label = label; fresh.count += 1; fresh.last = now;
  ledger.signals[key] = fresh;
  const keys = Object.keys(ledger.signals).sort((a, b) => ledger.signals[a].last - ledger.signals[b].last);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SIGNALS))) delete ledger.signals[old];
  ledger.revision += 1;
  return ledger;
}

export function dueForCycle(ledger, now = Date.now()) {
  return ledger.enabled && ledger.revision > ledger.processedRevision && now - ledger.lastCycle >= CYCLE_MS;
}

export function runCycle(ledger, now = Date.now()) {
  if (!dueForCycle(ledger, now)) return [];
  const fresh = [];
  for (const [key, signal] of Object.entries(ledger.signals)) {
    const id = `kernel:${key}`;
    if (now - signal.last > SIGNAL_EXPIRY_MS || signal.count < 3 || signal.last - signal.first < 2 * SIGNAL_COOLDOWN_MS
      || Object.hasOwn(ledger.rejected, id) || Object.hasOwn(ledger.accepted, id) || ledger.ideas.some(idea => idea.id === id)) continue;
    if (ledger.ideas.length + fresh.length >= MAX_IDEAS) break;
    fresh.push({ id, title: `Create a workspace planet for "${signal.label}"`,
      reason: `${signal.count} spaced local interactions. This suggests interest, not proven knowledge or successful outcomes.`,
      kernelName: `${signal.label} workspace`, createdAt: now,
      evidence: { type: 'local-usage', key, count: signal.count, first: signal.first, last: signal.last } });
  }
  ledger.ideas.push(...fresh);
  ledger.lastCycle = now;
  ledger.processedRevision = ledger.revision;
  ledger.cycles += 1;
  seal(ledger, 'toolbox', `CYCLE ${ledger.cycles}: ${fresh.length} usage suggestions; no knowledge approved`);
  return fresh;
}

export function resolveIdea(ledger, id, accept, now = Date.now()) {
  const idea = ledger.ideas.find(item => item.id === id);
  if (!idea || typeof accept !== 'boolean') throw new Error('Review an existing idea before deciding.');
  if (accept && ledger.kernels.length >= MAX_KERNELS) throw new Error('The planet library is full (12). Forget a planet before keeping another.');
  if (Object.keys(ledger.accepted).length + Object.keys(ledger.rejected).length >= 1000) throw new Error('The decision history is full. Review and reset local usage learning before adding decisions.');
  ledger.ideas = ledger.ideas.filter(item => item.id !== id);
  (accept ? ledger.accepted : ledger.rejected)[id] = true;
  if (accept) ledger.kernels.push({ id, name: idea.kernelName || idea.title,
    detail: `Human-approved workspace organization, not a trained model or operating-system kernel. ${idea.reason}`,
    createdAt: now, evidence: idea.evidence || { type: 'legacy-usage' } });
  seal(ledger, 'human', `${accept ? 'KEPT workspace planet' : 'DISMISSED usage suggestion'} ${id}`);
  return ledger;
}

export function forgetPlanet(ledger, id) {
  if (!ledger.kernels.some(planet => planet.id === id)) throw new Error('Choose an existing workspace planet.');
  ledger.kernels = ledger.kernels.filter(planet => planet.id !== id);
  seal(ledger, 'human', `FORGOT workspace planet ${id}; suggestion remains suppressed`);
  return ledger;
}

export function resetLedger() { return emptyLedger(); }
