import { createBibleIndex, emptyBibleState, parseBibleState, changeBibleState, dailyReading, BIBLE_PRINCIPLES } from '../app/bible.js';
import oldUrl from '../assistant/toolbox-bible-old-testament.json?url';
import newUrl from '../assistant/toolbox-bible-new-testament.json?url';
import { invoke, inDesktopApp } from './bridge.js';

const STORAGE = 'capsule-bible-reader-v1';
const SOURCES = [
  [oldUrl, '8544c21f51a9674da7f23cedcbfc5831b5dd09093290eccc099e41cfa9bca131'],
  [newUrl, 'fed3f3cfd4155a90083b99e818583690c10613d51bfbf689a007075530071697']
];
let loading;
async function loadIndex() {
  if (!loading) loading = Promise.all(SOURCES.map(async ([url, expected]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Bible data unavailable (${response.status}).`);
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== expected) throw new Error('The Bible asset failed its complete source hash check.');
    return JSON.parse(new TextDecoder().decode(bytes));
  })).then(createBibleIndex).catch(error => { loading = null; throw error; });
  return loading;
}
const make = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const APP_GLYPHS = {
  gold: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  violet: '<path d="M12 3c3 5 7 8 7 12a7 7 0 1 1-14 0c0-4 4-7 7-12Z"/><path d="M12 12c1.5 2 3 3.5 3 5a3 3 0 0 1-6 0c0-1.5 1.5-3 3-5Z"/>',
  rust: '<path d="M12 6C8 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-6-1-10 2Zm0 0v15"/>',
  sage: '<path d="M4 6h16M6 12h12M9 18h6"/>',
  sky: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M10 7v6M7 10h6"/>',
  crimson: '<path d="M12 21C4 15 2 11 2 7a5 5 0 0 1 10-1A5 5 0 0 1 22 7c0 4-2 8-10 14Z"/>'
};

export async function mountBible(root) {
  root.innerHTML = `<div class="bible-shell">
    <div class="bible-masthead"><div class="bible-kicker">THE WORD · AT THE HEART OF YOUR TOOLBOX</div>
      <h1><svg width="30" height="30" viewBox="0 0 180 180" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" aria-hidden="true"><path d="M24 66 90 28 156 66M46 84v46M90 84v46M134 84v46M28 150h124"/></svg>Toolbox Bible</h1><p>Christian Edition</p>
    </div>
    <nav class="bible-nav" aria-label="Bible navigation"><button data-bible-tab="home" aria-current="page">Home</button><button data-bible-tab="books">Books</button><button data-bible-tab="saved">Your verses</button><button data-bible-tab="search">Search</button></nav>
    <p class="bible-status" data-bible-status role="status">Opening the local Toolbox Bible…</p>
    <p class="bible-notes-warning" data-bible-notes-warning hidden></p>
    <div class="bible-layout" hidden>
      <section data-bible-pane="home" aria-label="Bible home">
        <div class="bible-home-grid">
          <button class="bible-card bible-home-card" data-flavor="gold" data-bible-votd aria-label="Open the verse of the day"><span class="bible-meta">Verse of the day</span><span class="bible-scripture" data-bible-votd-text></span><span class="bible-ref" data-bible-votd-ref></span></button>
          <button class="bible-card bible-home-card" data-flavor="violet" data-bible-open-prayer><span class="bible-meta">Prayer for the day</span><strong>A moment with God</strong><span class="bible-prayer-preview" data-bible-prayer-preview></span><span class="bible-ref">Open today’s prayer</span></button>
          <button class="bible-card bible-home-card" data-flavor="rust" data-bible-continue><span class="bible-meta">Continue reading</span><strong data-bible-continue-title>Begin at Genesis</strong><span class="bible-ref">66 books · 1,189 chapters · the whole Bible, offline.</span></button>
          <button class="bible-card bible-home-card" data-flavor="sage" data-bible-daily><span class="bible-meta">Today’s reading</span><strong data-bible-daily-title></strong><span class="bible-ref">Walk the text, a chapter at a time.</span></button>
          <button class="bible-card bible-home-card" data-flavor="sky" data-bible-open-search><span class="bible-meta">Seek in scripture</span><strong>Search the Bible</strong><span class="bible-ref">A reference or a phrase across all 31,098 verses.</span></button>
          <button class="bible-card bible-home-card" data-flavor="crimson" data-bible-open-saved><span class="bible-meta">Your verses</span><strong data-bible-saved-title>No saved verses yet</strong><span class="bible-ref">Tap a verse while reading to bookmark or highlight it.</span></button>
        </div>
        <details class="bible-principles bible-details"><summary>Christian principles in agent work</summary><p>Truthfulness, discernment, care, stewardship and humility guide the orchestrator review. Scripture informs the principles; technical source checks and real outcomes still determine what is supported.</p><div data-bible-principles></div><label class="bible-agent-choice"><input type="checkbox" data-bible-agent disabled> Use cited Bible text in local orchestrator reviews</label><p class="bible-status" data-bible-agent-status role="status"></p><button class="bible-action" data-bible-activity>See principles in agent activity</button></details>
      </section>
      <section data-bible-pane="books" aria-label="Browse Bible books" hidden><label class="bible-filter">Find a book<input type="search" maxlength="50" data-bible-book-filter placeholder="Genesis, Psalms, John…"></label><div class="bible-book-grid" data-bible-books></div></section>
      <section data-bible-pane="chapters" aria-label="Choose a chapter" hidden><button class="bible-back" data-bible-back-books>‹ All books</button><div class="bible-card" data-flavor="word"><span class="bible-meta">Chapters</span><h2 data-bible-chapter-book></h2><div class="bible-chapter-grid" data-bible-chapters></div></div></section>
      <section data-bible-pane="read" aria-label="Bible reader" hidden>
        <article class="bible-card bible-reader" data-bible-reader data-flavor="word"><span class="bible-meta">THE WORD</span><h2 data-bible-heading></h2>
          <details class="bible-go-to"><summary>Go to another passage</summary><div class="bible-toolbar"><label>Book<select data-bible-book></select></label><label>Chapter<select data-bible-chapter></select></label></div></details>
          <div class="bible-verses" data-bible-verses></div>
          <div class="bible-reader-nav"><button data-bible-prev aria-label="Previous chapter">‹ Previous</button><button data-bible-next aria-label="Next chapter">Next ›</button></div>
        </article>
        <aside class="bible-selection" data-bible-selection aria-label="Selected verse actions" hidden><div class="bible-meta" data-bible-selected></div><p data-bible-selected-text></p><div class="bible-colors" role="group" aria-label="Verse highlight"><button data-bible-color="gold" aria-label="Highlight gold" title="Gold"></button><button data-bible-color="rose" aria-label="Highlight crimson" title="Crimson"></button><button data-bible-color="blue" aria-label="Highlight sky" title="Sky"></button><button data-bible-color="green" aria-label="Highlight sage" title="Sage"></button><button data-bible-color="none" aria-label="Remove highlight" title="No highlight">×</button></div><div class="bible-sheet-actions"><button data-bible-bookmark disabled>Bookmark</button><button data-bible-done>Done</button></div></aside>
      </section>
      <section data-bible-pane="prayer" aria-label="Daily prayer" hidden><article class="bible-card bible-prayer" data-flavor="violet"><span class="bible-meta">Prayer for the day</span><h2>A moment with God</h2><p class="bible-scripture" data-bible-prayer></p><p class="bible-ref">Original daily prayer, not a scripture quotation.</p></article></section>
      <section data-bible-pane="saved" aria-label="Saved Bible verses" hidden><div class="bible-section-heading"><h2>Your verses <span data-bible-saved-count></span></h2><p>Bookmarks and highlights stay on this device. They are never included in agent reference context.</p></div><div data-bible-saved></div><details class="bible-details"><summary>Local note storage</summary><button class="bible-action" data-bible-reset>Reset local Bible notes</button></details></section>
      <section data-bible-pane="search" aria-label="Search scripture" hidden><form class="bible-search"><label for="bible-query">Find a verse or phrase</label><div><input id="bible-query" type="search" maxlength="160" placeholder="John 3:16 or a phrase"><button type="submit">Seek</button></div></form><div class="bible-results" data-bible-results></div></section>
      <details class="bible-details bible-about"><summary>About this edition</summary><p>Toolbox Bible, N8torious AI’s Christian edition of the public-domain World English Bible. The divine name is rendered as God / the Lord God according to the supplied edition rules. 66 books, 1,189 chapters, 31,098 verses. Both complete data files are verified with SHA-256 before use. This page adapts the visual foundation of your Toolbox Bible Android app; it does not execute its Android or JavaScript code. No account, location request or external service is required.</p></details>
      <footer class="bible-footer">Toolbox Bible · Christian Edition · Read, pray and reflect</footer>
    </div></div>`;
  for (const card of root.querySelectorAll('.bible-home-card')) {
    const icon = make('span', undefined, 'bible-app-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${APP_GLYPHS[card.dataset.flavor]}</svg>`;
    card.prepend(icon);
  }
  const status = root.querySelector('[data-bible-status]');
  let index;
  try { index = await loadIndex(); }
  catch (error) {
    status.textContent = error.message;
    const retry = make('button', 'Retry Bible data', 'button secondary');
    retry.addEventListener('click', () => { void mountBible(root); });
    status.after(retry); return;
  }
  let state = emptyBibleState(), selected = null, notesHealthy = true;
  try { state = parseBibleState(localStorage.getItem(STORAGE), index); status.textContent = 'Local edition verified. Select a verse to bookmark or highlight it.'; }
  catch (error) { notesHealthy = false; status.textContent = 'Reading is available; local notes need attention.'; root.querySelector('[data-bible-notes-warning]').hidden = false; root.querySelector('[data-bible-notes-warning]').textContent = `Notes unavailable: ${error.message} Saved notes were not overwritten.`; }
  const find = name => root.querySelector(`[data-bible-${name}]`);
  const book = find('book'), chapter = find('chapter'), bookmark = find('bookmark');
  const colors = [...root.querySelectorAll('[data-bible-color]')];
  let pane = 'home';
  for (const entry of index.books) { const option = make('option', entry.name); option.value = entry.name; book.append(option); }
  function write(next) { localStorage.setItem(STORAGE, JSON.stringify(next)); }
  function show(name) {
    pane = name;
    for (const section of root.querySelectorAll('[data-bible-pane]')) section.hidden = section.dataset.biblePane !== name;
    for (const button of root.querySelectorAll('[data-bible-tab]')) {
      if (button.dataset.bibleTab === (['read', 'chapters'].includes(name) ? 'books' : name)) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    if (name !== 'read') updateSelection(null);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (name === 'search') root.querySelector('#bible-query').focus();
  }
  function renderBooks(query = '') {
    find('books').replaceChildren();
    let lastTestament = '';
    for (const [position, entry] of index.books.entries()) {
      if (!entry.name.toLowerCase().includes(query.trim().toLowerCase())) continue;
      const testament = position < 39 ? 'Old Testament' : 'New Testament';
      if (testament !== lastTestament) { find('books').append(make('h2', testament, 'bible-testament')); lastTestament = testament; }
      const button = make('button', undefined, 'bible-book-card');
      button.dataset.flavor = position < 5 ? 'gold' : position < 17 ? 'rust' : position < 22 ? 'sage' : position < 39 ? 'sky' : position < 44 ? 'crimson' : position < 65 ? 'violet' : 'gold';
      button.append(make('strong', entry.name), make('span', `${entry.chapters.length} chapters`));
      button.addEventListener('click', () => {
        find('chapter-book').textContent = entry.name; find('chapters').replaceChildren();
        entry.chapters.forEach((_, offset) => {
          const chapterButton = make('button', String(offset + 1));
          chapterButton.setAttribute('aria-label', `${entry.name} ${offset + 1}`);
          chapterButton.addEventListener('click', () => navigate(entry.name, offset + 1));
          find('chapters').append(chapterButton);
        });
        show('chapters');
      });
      find('books').append(button);
    }
    if (!find('books').children.length) find('books').append(make('p', 'No matching book.'));
  }
  function updateSelection(citation) {
    selected = index.verse(citation);
    find('selected').textContent = selected?.citation || 'Choose a verse';
    bookmark.disabled = !selected || !notesHealthy;
    bookmark.textContent = state.bookmarks.includes(selected?.citation) ? 'Remove bookmark' : 'Bookmark';
    bookmark.setAttribute('aria-pressed', String(state.bookmarks.includes(selected?.citation)));
    find('selection').hidden = !selected || pane !== 'read';
    find('selected-text').textContent = selected?.text || '';
    root.classList.toggle('bible-verse-open', Boolean(selected && pane === 'read'));
    for (const color of colors) {
      color.disabled = !selected || !notesHealthy;
      color.setAttribute('aria-pressed', String(color.dataset.bibleColor === (state.highlights[selected?.citation] || 'none')));
    }
    for (const verse of find('verses').children) verse.setAttribute('aria-pressed', String(verse.dataset.citation === citation));
  }
  function render() {
    book.value = state.book; chapter.replaceChildren();
    const currentBook = index.books.find(entry => entry.name === state.book);
    currentBook.chapters.forEach((_, position) => { const option = make('option', String(position + 1)); chapter.append(option); });
    chapter.value = String(state.chapter);
    find('heading').textContent = `${state.book} ${state.chapter}`;
    find('verses').replaceChildren();
    for (const verse of index.chapter(state.book, state.chapter)) {
      const line = make('button', undefined, 'bible-verse');
      line.type = 'button'; line.dataset.citation = verse.citation;
      line.dataset.highlight = state.highlights[verse.citation] || 'none';
      line.append(make('sup', String(verse.verse)), make('span', verse.text));
      line.addEventListener('click', () => updateSelection(verse.citation));
      find('verses').append(line);
    }
    const position = index.chapters.findIndex(entry => entry.book === state.book && entry.chapter === state.chapter);
    find('prev').disabled = position === 0; find('next').disabled = position === index.chapters.length - 1;
    updateSelection(selected?.book === state.book && selected.chapter === state.chapter ? selected.citation : null);
    const saved = [...new Set([...state.bookmarks, ...Object.keys(state.highlights)])];
    find('continue-title').textContent = `${state.book} ${state.chapter}`;
    find('saved-title').textContent = notesHealthy ? saved.length ? `${saved.length} saved passage${saved.length === 1 ? '' : 's'}` : 'Your verses, close at hand' : 'Local notes need attention';
    find('saved-count').textContent = notesHealthy ? `(${saved.length})` : '(unavailable)';
    find('saved').replaceChildren();
    if (!saved.length) find('saved').append(make('p', notesHealthy ? 'Your saved passages will appear here. Tap a verse while reading to keep it.' : 'Saved notes could not be read; the original data has not been overwritten.'));
    for (const citation of saved) {
      const verse = index.verse(citation);
      const button = make('button', undefined, 'bible-card bible-saved-card');
      button.dataset.flavor = 'crimson';
      button.append(make('span', `${citation}${state.bookmarks.includes(citation) ? ' · bookmarked' : ''}`, 'bible-meta'), make('span', verse.text, 'bible-scripture'));
      if (state.highlights[citation]) button.dataset.highlight = state.highlights[citation];
      button.addEventListener('click', () => {
        const verse = index.verse(citation); navigate(verse.book, verse.chapter, citation);
      });
      find('saved').append(button);
    }
  }
  function navigate(name, number, citation = null) {
    const next = changeBibleState(state, index, { type: 'navigate', book: name, chapter: number });
    let message = `Reading ${name} ${number}.`;
    if (notesHealthy) {
      try { write(next); }
      catch (error) { message += ` Position could not be saved: ${error.message}`; }
    }
    state = next; selected = citation ? index.verse(citation) : null; show('read'); render();
    status.textContent = message;
    if (selected) [...find('verses').children].find(element => element.dataset.citation === selected.citation)?.scrollIntoView({ block: 'center' });
  }
  function saveNote(action) {
    try {
      const next = changeBibleState(state, index, action);
      write(next); state = next; render();
      status.textContent = `${action.citation}: ${action.type === 'bookmark' ? 'bookmark updated' : 'highlight updated'} on this device.`;
    } catch (error) { status.textContent = `Notes were not saved: ${error.message}`; }
  }
  book.addEventListener('change', () => navigate(book.value, 1));
  chapter.addEventListener('change', () => navigate(state.book, Number(chapter.value)));
  for (const [name, offset] of [['prev', -1], ['next', 1]]) find(name).addEventListener('click', () => {
    const position = index.chapters.findIndex(entry => entry.book === state.book && entry.chapter === state.chapter);
    const next = index.chapters[position + offset]; if (next) navigate(next.book, next.chapter);
  });
  bookmark.addEventListener('click', () => { if (selected && notesHealthy) saveNote({ type: 'bookmark', citation: selected.citation }); });
  colors.forEach(button => button.addEventListener('click', () => { if (selected && notesHealthy) saveNote({ type: 'highlight', citation: selected.citation, color: button.dataset.bibleColor }); }));
  find('done').addEventListener('click', () => {
    const citation = selected?.citation;
    updateSelection(null);
    [...find('verses').children].find(element => element.dataset.citation === citation)?.focus();
  });
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && selected) { event.preventDefault(); find('done').click(); } });
  root.querySelectorAll('[data-bible-tab]').forEach(button => button.addEventListener('click', () => show(button.dataset.bibleTab)));
  find('book-filter').addEventListener('input', () => renderBooks(find('book-filter').value));
  find('back-books').addEventListener('click', () => show('books'));
  find('continue').addEventListener('click', () => navigate(state.book, state.chapter));
  find('open-search').addEventListener('click', () => show('search'));
  find('open-saved').addEventListener('click', () => show('saved'));
  find('open-prayer').addEventListener('click', () => show('prayer'));
  let today;
  function refreshDaily() {
    today = dailyReading(index);
    find('prayer').textContent = today.prayer;
    find('prayer-preview').textContent = today.prayer;
    find('votd-text').textContent = today.verse.text;
    find('votd-ref').textContent = `${today.verse.citation} · Toolbox Bible`;
    find('daily-title').textContent = `${today.book} ${today.chapter}`;
  }
  refreshDaily();
  window.addEventListener('capsule-view', event => { if (event.detail === 'bible') refreshDaily(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && root.classList.contains('active')) refreshDaily(); });
  find('votd').addEventListener('click', () => navigate(today.verse.book, today.verse.chapter, today.verse.citation));
  find('daily').addEventListener('click', () => navigate(today.book, today.chapter));
  root.querySelector('.bible-search').addEventListener('submit', event => {
    event.preventDefault(); find('results').replaceChildren();
    try {
      const results = index.search(root.querySelector('#bible-query').value);
      status.textContent = results.length ? `${results.length} matching passages (up to 40).` : 'No matching passage found.';
      for (const verse of results) {
        const result = make('button', undefined, 'bible-card bible-search-result');
        result.dataset.flavor = 'sky';
        result.append(make('span', verse.citation, 'bible-meta'), make('span', verse.text, 'bible-scripture'));
        result.addEventListener('click', () => { navigate(verse.book, verse.chapter, verse.citation); find('results').replaceChildren(); });
        find('results').append(result);
      }
    } catch (error) { status.textContent = error.message; }
  });
  for (const principle of BIBLE_PRINCIPLES) {
    const button = make('button', `${principle.title} · ${principle.citation}`, 'bible-action');
    button.title = principle.behavior;
    button.addEventListener('click', () => {
      const verse = index.verse(principle.citation); navigate(verse.book, verse.chapter, verse.citation);
      status.textContent = `${principle.title}: ${principle.behavior}`;
    });
    find('principles').append(button);
  }
  find('activity').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('capsule-navigate', { detail: 'auditor' }));
    document.querySelector('[data-notification-tab="activity"]')?.click();
  });
  find('reset').addEventListener('click', () => {
    if (!window.confirm('Erase bookmarks, highlights and the saved reading position on this device? This cannot be undone.')) return;
    try { localStorage.removeItem(STORAGE); state = emptyBibleState(); notesHealthy = true; selected = null; find('notes-warning').hidden = true; render(); status.textContent = 'Local Bible notes reset.'; }
    catch (error) { status.textContent = `Notes were not reset: ${error.message}`; }
  });
  const agent = find('agent'), agentStatus = find('agent-status');
  renderBooks(); render(); root.querySelector('.bible-layout').hidden = false;
  if (!inDesktopApp) agentStatus.textContent = 'Local agent reference settings are available in the desktop app. Personal bookmarks and highlights stay separate.';
  else {
    try {
      const policy = await invoke('bible_reference_action', { action: 'status', payload: {} });
      if (!policy.ok) throw new Error(policy.message || 'Bible reference settings unavailable.');
      agent.checked = policy.enabled; agent.disabled = false;
      agentStatus.textContent = policy.enabled ? 'Local orchestrator reviews use cited Toolbox Bible principles. No personal annotations are shared.' : 'Bible context paused. Technical evidence and permission checks still apply.';
    } catch (error) { agentStatus.textContent = typeof error === 'string' ? error : error.message; }
    agent.addEventListener('change', async () => {
      agent.disabled = true;
      try {
        const result = await invoke('bible_reference_action', { action: 'configure', payload: { enabled: agent.checked } });
        if (!result.ok) throw new Error(result.message || 'Bible reference preference was not saved.');
        agentStatus.textContent = result.enabled ? 'Cited Bible principles enabled for local reviews.' : 'Bible reference context paused.';
      } catch (error) { agent.checked = !agent.checked; agentStatus.textContent = typeof error === 'string' ? error : error.message; }
      finally { agent.disabled = false; }
    });
  }
}
