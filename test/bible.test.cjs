const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { ASSETS, loadBible, validateBibleRequest, readBiblePolicy, configureBiblePolicy, bibleReviewContext, verifyBibleReview } = require('../assistant/bible-canon.cjs');
const { AssistantController } = require('../assistant/controller.cjs');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-bible-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'bible-reference.json');
}
test('the exact complete Toolbox edition is pinned by full hashes, not a weak text/count fingerprint', async () => {
  const { index } = await loadBible();
  assert.deepEqual(index.counts, { books: 66, chapters: 1189, verses: 31098 });
  assert.equal(index.verse('Genesis 1:1').text, 'In the beginning, God created the heavens and the earth.');
  assert.ok(index.verse('Song of Solomon 2:1'));
  assert.ok(index.verse('1 Thessalonians 5:21'));
  assert.equal(index.verse('Revelation 22:21').book, 'Revelation');
  for (const asset of ASSETS) {
    const bytes = await fs.readFile(path.join(__dirname, '..', 'assistant', asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    const changed = Buffer.from(bytes); changed[Math.floor(changed.length / 2)] ^= 1;
    assert.notEqual(createHash('sha256').update(changed).digest('hex'), asset.sha256);
  }
});
test('chapter navigation and bounded plain-text search preserve exact multiword/numbered references', async () => {
  const { index } = await loadBible();
  assert.equal(index.search('1 Corinthians 13:4')[0].citation, '1 Corinthians 13:4');
  assert.equal(index.search('john 3:16')[0].text, index.verse('John 3:16').text);
  assert.ok(index.search('God', 5).length <= 5);
  assert.deepEqual(index.search('<not a scripture phrase>'), []);
  assert.throws(() => index.search('ab'), /3-160/);
  assert.throws(() => index.search('God', 101), /limit/);
  assert.throws(() => index.chapter('Unknown', 1), /valid/);
  assert.throws(() => index.chapter('John', 100), /valid/);
  assert.equal(index.chapters[0].book, 'Genesis');
  assert.equal(index.chapters.at(-1).book, 'Revelation');
});
test('bookmarks and highlights round-trip locally with canonical IDs, bounds, removal and corruption refusal', async () => {
  const { index } = await loadBible();
  const { emptyBibleState, parseBibleState, changeBibleState } = await import('../app/bible.js');
  let state = emptyBibleState();
  state = changeBibleState(state, index, { type: 'navigate', book: 'John', chapter: 3 });
  state = changeBibleState(state, index, { type: 'bookmark', citation: 'John 3:16' });
  state = changeBibleState(state, index, { type: 'highlight', citation: 'John 3:16', color: 'gold' });
  assert.deepEqual(parseBibleState(JSON.stringify(state), index), state);
  assert.deepEqual(state.bookmarks, ['John 3:16']);
  const removed = changeBibleState(state, index, { type: 'bookmark', citation: 'John 3:16' });
  assert.deepEqual(removed.bookmarks, []);
  assert.equal(removed.highlights['John 3:16'], 'gold');
  assert.deepEqual(changeBibleState(removed, index, { type: 'highlight', citation: 'John 3:16', color: 'none' }).highlights, {});
  assert.equal(state.bookmarks.length, 1, 'state changes do not mutate a previous saved state');
  for (const invalid of [
    { ...state, version: 2 }, { ...state, book: 'john' }, { ...state, chapter: 900 },
    { ...state, bookmarks: ['John 3:16', 'John 3:16'] }, { ...state, bookmarks: ['john 3:16'] },
    { ...state, bookmarks: ['Unknown 1:1'] }, { ...state, highlights: { 'John 3:16': 'invalid' } },
    { ...state, highlights: [] }
  ]) assert.throws(() => parseBibleState(JSON.stringify(invalid), index));
  assert.throws(() => parseBibleState('invalid JSON', index));
  assert.throws(() => changeBibleState(state, index, { type: 'highlight', citation: 'John 3:16', color: 'invalid' }), /supported/);
  const full = { ...state, bookmarks: index.books[0].chapters.flat().slice(0, 500).map(verse => verse.citation) };
  assert.throws(() => changeBibleState(full, index, { type: 'bookmark', citation: 'John 1:1' }), /500/);
});
test('daily prayer and verse are date-stable; chapter sequence crosses year and DST boundaries without reset', async () => {
  const { index } = await loadBible();
  const { dailyReading } = await import('../app/bible.js');
  assert.deepEqual(dailyReading(index, new Date(2026, 6, 1, 0, 1)), dailyReading(index, new Date(2026, 6, 1, 23, 59)));
  for (const date of [new Date(2026, 11, 31, 12), new Date(2026, 2, 7, 12), new Date(2026, 9, 31, 12)]) {
    const next = new Date(date); next.setDate(next.getDate() + 1);
    const first = dailyReading(index, date), second = dailyReading(index, next);
    const position = reading => index.chapters.findIndex(entry => entry.book === reading.book && entry.chapter === reading.chapter);
    assert.equal(position(second), (position(first) + 1) % index.chapters.length);
  }
  for (let day = 1; day <= 32; day++) {
    const reading = dailyReading(index, new Date(2026, 0, day));
    assert.equal(reading.verse.text, index.verse(reading.verse.citation).text);
    assert.match(reading.prayer, /amen/i);
  }
  assert.throws(() => dailyReading(index, new Date('invalid')), /valid/);
});
test('Bible context is canonical only, optional and fingerprinted; malformed policy is never silently replaced', async t => {
  const file = await fixture(t);
  const enabled = await bibleReviewContext(file);
  assert.equal(enabled.enabled, true);
  assert.match(enabled.context, /not a software test or a grant of authority/);
  assert.equal(enabled.references.length, 5);
  assert.doesNotMatch(JSON.stringify(enabled), /bookmarks|highlights|localStorage/);
  await configureBiblePolicy(file, false);
  assert.deepEqual(await readBiblePolicy(file), { version: 1, enabled: false });
  const disabled = await bibleReviewContext(file);
  assert.equal(disabled.context, '');
  assert.notEqual(disabled.fingerprint, enabled.fingerprint);
  await fs.writeFile(file, 'invalid');
  await assert.rejects(configureBiblePolicy(file, true));
  assert.equal(await fs.readFile(file, 'utf8'), 'invalid');
  assert.equal(validateBibleRequest('configure', { enabled: true, approved: true }), false);
  assert.equal(validateBibleRequest('execute', {}), false);
});
test('an exact scripture reference never bypasses technical evidence, model objections or the named workspace grant', async t => {
  const { index } = await loadBible();
  const source = { bible: await bibleReviewContext(await fixture(t)) };
  const scripture = { citation: 'Ephesians 4:25', text: index.verse('Ephesians 4:25').text };
  const review = { safe: true, principle: 'truth', scripture };
  assert.equal((await verifyBibleReview(review, source.bible)).ok, true);
  assert.equal((await verifyBibleReview({ ...review, scripture: { ...scripture, text: 'Invented quotation' } }, source.bible)).ok, false);
  assert.equal((await verifyBibleReview({ safe: true }, source.bible)).ok, false);
  const controller = Object.create(AssistantController.prototype);
  const ungranted = await controller.applyOrchestratorDraft({ source, draft: '{"edit":{"path":"index.html"}}', review: JSON.stringify(review) });
  assert.equal(ungranted.changed, false);
  assert.match(ungranted.message, /No document workspace/);
  const refused = await controller.applyOrchestratorDraft({
    source: { ...source, workspace: { files: [] } }, draft: '{"edit":{"path":"index.html"},"claims":[]}', review: JSON.stringify(review)
  });
  assert.equal(refused.changed, false);
  assert.match(refused.message, /Evidence refused/);
});
