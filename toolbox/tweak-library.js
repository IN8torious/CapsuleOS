import { TWEAKS } from '../app/playbook.js';

const KEY = 'capsule-approved-tweaks-v1';
const ids = new Set(TWEAKS.map(tweak => tweak.id));

export function readTweakLibrary(storage = localStorage) {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  let doc;
  try { doc = JSON.parse(raw); }
  catch { throw new Error('Your Tweak+ library is malformed. It was not overwritten.'); }
  if (doc.version !== 1 || !Array.isArray(doc.entries) || doc.entries.length > 100 ||
    doc.entries.some(entry => !entry || typeof entry.id !== 'string' || entry.id.length > 80 ||
      typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 120 ||
      typeof entry.reason !== 'string' || !entry.reason.trim() || entry.reason.length > 600 ||
      !Number.isSafeInteger(entry.approvedAt) ||
      !(entry.tweakId === null || ids.has(entry.tweakId))) ||
    new Set(doc.entries.map(entry => entry.id)).size !== doc.entries.length) {
    throw new Error('Your Tweak+ library is unsupported or exceeds its limits. It was not overwritten.');
  }
  return doc.entries;
}

function save(entries, storage) {
  storage.setItem(KEY, JSON.stringify({ version: 1, entries }));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('capsule-tweak-library'));
  return entries;
}

export function addApprovedTweak({ tweakId = null, title, reason, confirmed }, storage = localStorage) {
  if (confirmed !== true) throw new Error('Explicit approval is required to add a Tweak+ item.');
  if (tweakId !== null && !ids.has(tweakId)) throw new Error('Unknown tweaks can be saved only as review-only ideas.');
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 600) throw new Error('Describe the proposal in 1-600 characters.');
  const supported = TWEAKS.find(item => item.id === tweakId);
  const name = supported?.title || title;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) throw new Error('Give the proposal a title of 1-120 characters.');
  const entries = readTweakLibrary(storage);
  if (supported && entries.some(entry => entry.tweakId === tweakId)) throw new Error('This supported tweak is already in your Tweak+ list.');
  if (entries.length >= 100) throw new Error('Your Tweak+ library is full (100 entries). Remove an entry first.');
  const entry = {
    id: crypto.randomUUID(), tweakId, title: name.trim(), reason: reason.trim(), approvedAt: Date.now()
  };
  return save([...entries, entry], storage);
}

export function removeApprovedTweak(id, storage = localStorage) {
  const entries = readTweakLibrary(storage);
  if (!entries.some(entry => entry.id === id)) throw new Error('That Tweak+ item is no longer available.');
  return save(entries.filter(entry => entry.id !== id), storage);
}

export function requestSupportedTweakApproval(tweakId, reason) {
  const tweak = TWEAKS.find(item => item.id === tweakId);
  if (!tweak) throw new Error('This is not a supported compiled tweak.');
  if (!window.confirm(`Add "${tweak.title}" to your personal Tweak+ list?\n\n${reason}\n\nThis saves a proposal only. Applying it still requires a fresh registry preview, confirmation and UAC.`)) {
    return 'Tweak+ approval cancelled. No settings were changed.';
  }
  addApprovedTweak({ tweakId, reason, confirmed: true });
  return 'Approved and added to Tweak+. No registry values were changed.';
}
