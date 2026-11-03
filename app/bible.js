export const BIBLE_EDITION = 'toolbox-bible-2026-11-02';
export const BIBLE_PRINCIPLES = Object.freeze([
  { id: 'truth', title: 'Truthfulness', citation: 'Ephesians 4:25', behavior: 'Cite the real source. Do not invent evidence or claim an untested result.' },
  { id: 'discernment', title: 'Discernment', citation: '1 Thessalonians 5:21', behavior: 'Check the evidence before changing anything. Keep what is supported; correct what fails.' },
  { id: 'care', title: 'Care for others', citation: 'Philippians 2:4', behavior: 'Consider the user, their privacy and the consequences of a change.' },
  { id: 'stewardship', title: 'Stewardship', citation: 'Luke 16:10', behavior: 'Prefer small, reversible changes. Preserve work and use resources responsibly.' },
  { id: 'humility', title: 'Humility', citation: 'James 1:5', behavior: 'Admit uncertainty and seek wisdom instead of pretending to know.' }
]);
const COLORS = new Set(['gold', 'green', 'blue', 'rose']);
const DAILY_VERSES = [
  'John 1:1', 'John 3:16', 'Romans 8:28', 'Philippians 4:13', 'Hebrews 11:1',
  'Matthew 11:28', 'John 14:6', 'Acts 1:8', 'Galatians 5:22', '1 Corinthians 13:4',
  'Revelation 22:21', 'Matthew 5:9', 'Luke 15:7', 'John 8:12', 'Romans 12:2',
  'Ephesians 2:8', 'James 1:5', '1 Peter 5:7', '2 Timothy 3:16', 'Colossians 3:23',
  'Mark 10:27', 'John 10:10', 'Titus 2:11', 'Jude 1:24', 'Genesis 1:1', 'Psalms 23:1',
  'Psalms 46:1', 'Psalms 118:24', 'Proverbs 3:5', 'Isaiah 40:31', 'Jeremiah 29:11', 'Micah 6:8'
];
const PRAYERS = [
  'Heavenly Father, guide our thoughts and work today. Help us speak truth, act with care, and use what You have entrusted to us wisely. Give us humility to correct our mistakes and courage to do what is right. In Jesus’ name, amen.',
  'Lord Jesus, teach us to love our neighbors in the choices we make today. Let our work serve rather than burden others. Give us patience, honesty, and a willing heart. Amen.',
  'Father, grant us wisdom where the path is uncertain. Keep us from pride and careless promises. Help us listen, test what we hear, and hold firmly to what is good. In Jesus’ name, amen.',
  'God of peace, quiet our anxious thoughts. Help us attend faithfully to the next good thing, without rushing past the people who need our care. In Jesus’ name, amen.',
  'Lord, thank You for the gifts and opportunities of this day. Teach us to steward our time, our tools, and our responsibilities with gratitude and integrity. In Jesus’ name, amen.',
  'Merciful Father, forgive our mistakes and help us repair the harm we cause. Make us quick to listen, slow to speak, and ready to choose kindness. In Jesus’ name, amen.',
  'Lord Jesus, let truth and compassion shape our work. May what we build bring help, not harm, and may our confidence rest in You rather than in ourselves. Amen.'
];
const normalize = text => text.trim().toLowerCase().replace(/\s+/g, ' ');

export function createBibleIndex(parts) {
  if (!Array.isArray(parts) || parts.length !== 2) throw new Error('Both Toolbox Bible testaments are required.');
  const books = [], byName = new Map(), verses = new Map(), chapters = [];
  for (const part of parts) {
    if (!part || !Array.isArray(part.books)) throw new Error('The Bible asset has an invalid book list.');
    let chapterCount = 0, verseCount = 0;
    for (const source of part.books) {
      if (typeof source.book !== 'string' || !source.book.trim() || source.book.length > 50
        || byName.has(normalize(source.book)) || !Array.isArray(source.chapters)) throw new Error('Invalid or duplicate Bible book.');
      const book = { name: source.book, chapters: [] };
      for (const [position, chapter] of source.chapters.entries()) {
        if (Number(chapter.chapter) !== position + 1 || !Array.isArray(chapter.verses) || !chapter.verses.length) throw new Error('Invalid Bible chapter.');
        const entries = [];
        for (const verse of chapter.verses) {
          const number = Number(verse.verse), citation = `${book.name} ${position + 1}:${number}`;
          if (!Number.isSafeInteger(number) || number < 1 || number > 200 || verses.has(normalize(citation))
            || typeof verse.text !== 'string' || !verse.text.trim() || verse.text.length > 4000) throw new Error('Invalid Bible verse.');
          const item = Object.freeze({ citation, book: book.name, chapter: position + 1, verse: number, text: verse.text });
          entries.push(item); verses.set(normalize(citation), item); verseCount++;
        }
        book.chapters.push(Object.freeze(entries));
        chapters.push(Object.freeze({ book: book.name, chapter: position + 1 }));
        chapterCount++;
      }
      book.chapters = Object.freeze(book.chapters);
      Object.freeze(book); books.push(book); byName.set(normalize(book.name), book);
    }
    if (part.bookCount !== part.books.length || part.chapterCount !== chapterCount || part.verseCount !== verseCount) throw new Error('Bible asset counts do not match its contents.');
  }
  if (books.length !== 66 || chapters.length !== 1189 || verses.size !== 31098) throw new Error('The complete 66-book Toolbox Bible is required.');
  const verse = citation => typeof citation === 'string' ? verses.get(normalize(citation)) || null : null;
  return Object.freeze({
    books: Object.freeze(books), chapters: Object.freeze(chapters), verse,
    counts: Object.freeze({ books: books.length, chapters: chapters.length, verses: verses.size }),
    chapter(book, number) {
      const found = typeof book === 'string' ? byName.get(normalize(book)) : null;
      if (!Number.isSafeInteger(number) || !found?.chapters[number - 1]) throw new Error('Choose a valid book and chapter.');
      return found.chapters[number - 1];
    },
    search(query, limit = 40) {
      if (typeof query !== 'string' || query.trim().length < 3 || query.length > 160) throw new Error('Search with 3-160 characters.');
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid search result limit.');
      const direct = verse(query);
      if (direct) return [direct];
      const needle = normalize(query), results = [];
      for (const entry of verses.values()) {
        if (entry.text.toLowerCase().includes(needle)) results.push(entry);
        if (results.length >= limit) break;
      }
      return results;
    }
  });
}

export function dailyReading(index, date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('A valid reading date is required.');
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2026, 0, 1)) / 86400000);
  const wrap = (number, length) => ((number % length) + length) % length;
  const verse = index.verse(DAILY_VERSES[wrap(day, DAILY_VERSES.length)]);
  if (!verse) throw new Error('The daily verse is missing from this Bible edition.');
  return { ...index.chapters[wrap(day, index.chapters.length)], verse, prayer: PRAYERS[wrap(day, PRAYERS.length)] };
}

export function emptyBibleState() {
  return { version: 1, edition: BIBLE_EDITION, book: 'Genesis', chapter: 1, bookmarks: [], highlights: {} };
}

export function parseBibleState(text, index) {
  if (!text) return emptyBibleState();
  if (typeof text !== 'string' || text.length > 192 * 1024) throw new Error('Saved Bible notes exceed their storage limit.');
  const state = JSON.parse(text);
  if (state.version !== 1 || state.edition !== BIBLE_EDITION || !Array.isArray(state.bookmarks)
    || state.bookmarks.length > 500 || new Set(state.bookmarks).size !== state.bookmarks.length
    || !state.highlights || typeof state.highlights !== 'object' || Array.isArray(state.highlights)
    || Object.keys(state.highlights).length > 1000
    || !index.books.some(book => book.name === state.book)
    || state.bookmarks.some(citation => index.verse(citation)?.citation !== citation)
    || Object.entries(state.highlights).some(([citation, color]) => index.verse(citation)?.citation !== citation || !COLORS.has(color))) {
    throw new Error('Saved Bible notes are invalid. They were not reset or overwritten.');
  }
  index.chapter(state.book, state.chapter);
  return state;
}

export function changeBibleState(state, index, action) {
  const next = structuredClone(state);
  if (action.type === 'navigate') {
    next.book = index.chapter(action.book, action.chapter)[0].book;
    next.chapter = action.chapter;
  } else {
    const verse = index.verse(action.citation);
    if (!verse) throw new Error('Choose a verse before saving it.');
    const citation = verse.citation;
    if (action.type === 'bookmark') {
      if (next.bookmarks.includes(citation)) next.bookmarks = next.bookmarks.filter(item => item !== citation);
      else {
        if (next.bookmarks.length >= 500) throw new Error('Your 500-bookmark library is full. Remove one before adding another.');
        next.bookmarks.push(citation);
      }
    } else if (action.type === 'highlight') {
      if (action.color === 'none') delete next.highlights[citation];
      else {
        if (!COLORS.has(action.color)) throw new Error('Choose a supported highlight color.');
        if (!next.highlights[citation] && Object.keys(next.highlights).length >= 1000) throw new Error('Your highlight library is full.');
        next.highlights[citation] = action.color;
      }
    } else throw new Error('Unsupported Bible note action.');
  }
  return next;
}

export function verifyScriptureClaim(index, claim) {
  if (!claim || typeof claim.citation !== 'string' || typeof claim.text !== 'string' || !claim.text.trim()) return false;
  return index.verse(claim.citation)?.text === claim.text;
}
