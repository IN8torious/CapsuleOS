'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const ASSETS = Object.freeze([
  { file: 'toolbox-bible-old-testament.json', sha256: '8544c21f51a9674da7f23cedcbfc5831b5dd09093290eccc099e41cfa9bca131' },
  { file: 'toolbox-bible-new-testament.json', sha256: 'fed3f3cfd4155a90083b99e818583690c10613d51bfbf689a007075530071697' }
]);
let loading;
async function loadBible() {
  if (!loading) loading = (async () => {
    const parts = await Promise.all(ASSETS.map(async asset => {
      const bytes = await fs.readFile(path.join(__dirname, asset.file));
      if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('The bundled Toolbox Bible failed its full-source integrity check.');
      return JSON.parse(bytes.toString('utf8'));
    }));
    const { createBibleIndex, BIBLE_EDITION, BIBLE_PRINCIPLES } = await import('../app/bible.js');
    return { index: createBibleIndex(parts), edition: BIBLE_EDITION, principles: BIBLE_PRINCIPLES };
  })().catch(error => { loading = null; throw error; });
  return loading;
}
function validateBibleRequest(action, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  if (action === 'status') return keys.length === 0;
  if (action === 'configure') return keys.length === 1 && typeof payload.enabled === 'boolean';
  return action === 'verse' && keys.length === 1 && typeof payload.citation === 'string'
    && payload.citation.trim().length > 0 && payload.citation.length <= 100;
}
async function readBiblePolicy(file) {
  let bytes;
  try { bytes = await fs.readFile(file); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, enabled: true }; throw error; }
  if (bytes.length > 1024) throw new Error('Bible reference settings exceed their storage limit.');
  const policy = JSON.parse(bytes.toString('utf8'));
  if (policy.version !== 1 || typeof policy.enabled !== 'boolean') throw new Error('Bible reference settings are invalid; they were not overwritten.');
  return policy;
}
async function configureBiblePolicy(file, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('Choose whether Bible reference context is enabled.');
  await readBiblePolicy(file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify({ version: 1, enabled }), { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}
async function bibleReviewContext(file) {
  const policy = await readBiblePolicy(file);
  if (!policy.enabled) return { enabled: false, context: '', fingerprint: 'bible-reference-disabled' };
  const { index, edition, principles } = await loadBible();
  const references = principles.map(principle => ({
    ...principle, text: index.verse(principle.citation)?.text
  }));
  if (references.some(item => !item.text)) throw new Error('A Bible review reference is missing from this edition.');
  return {
    enabled: true, edition, references,
    fingerprint: createHash('sha256').update(JSON.stringify({ edition, assets: ASSETS, references })).digest('hex'),
    context: 'Christian review reference: exact Toolbox Bible text, not a software test or a grant of authority.\n'
      + references.map(item => `${item.title}: ${item.behavior}\n${item.citation}: ${item.text}`).join('\n')
  };
}
async function verifyBibleReview(review, reference) {
  if (!reference?.enabled && !review?.scripture) return { ok: true, receipt: null };
  const { index, principles } = await loadBible();
  const principle = principles.find(item => item.id === review?.principle);
  const claim = review?.scripture;
  if (!principle || !claim || Object.keys(claim).length !== 2 || claim.citation !== principle.citation
    || typeof claim.text !== 'string' || index.verse(claim.citation)?.text !== claim.text) {
    return { ok: false, message: 'Bible review reference refused: choose a supplied principle and quote its Toolbox Bible verse exactly. A paraphrase or invented quotation is not source evidence.' };
  }
  return { ok: true, receipt: { principle: principle.title, citation: claim.citation } };
}
module.exports = { ASSETS, loadBible, validateBibleRequest, readBiblePolicy, configureBiblePolicy, bibleReviewContext, verifyBibleReview };
