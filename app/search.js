// Pure helpers for the browser home search. The native side (browser.rs) does the real
// hardening; this mirrors it so the home page can preview exactly what will happen.

export const TRACKING_PARAMS = ['fbclid', 'gclid', 'dclid', 'msclkid', 'yclid', 'igshid', 'mc_eid', '_hsenc', '_hsmi', 'ref_src', 'twclid', 'wbraid'];

export const isTracking = (name) => name.startsWith('utm_') || TRACKING_PARAMS.includes(name);

export function classifyQuery(raw) {
  const text = String(raw || '').trim();
  if (!text) return { kind: 'empty' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return { kind: 'url', value: text };
  if (text.includes('.') && !/\s/.test(text)) return { kind: 'url', value: `https://${text}` };
  return { kind: 'search', value: text };
}

export function hardenUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { url: raw, removed: [], upgraded: false };
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  let upgraded = false;
  if (url.protocol === 'http:' && !local) {
    url.protocol = 'https:';
    upgraded = true;
  }
  const removed = [];
  for (const key of [...url.searchParams.keys()]) {
    if (isTracking(key)) {
      removed.push(key);
      url.searchParams.delete(key);
    }
  }
  return { url: url.toString(), removed, upgraded };
}

// On-device hints only: no query is sent anywhere to produce them.
export function assist(raw) {
  const q = classifyQuery(raw);
  if (q.kind === 'empty') return [];
  if (q.kind === 'url') {
    const h = hardenUrl(q.value);
    const notes = [`Open ${new URL(h.url).hostname}`];
    if (h.upgraded) notes.push('Upgraded to HTTPS');
    if (h.removed.length) notes.push(`Strip ${h.removed.length} tracker${h.removed.length === 1 ? '' : 's'}`);
    return notes;
  }
  const hints = ['Private search · no account, no profile'];
  if (/^(how|what|why|when|where|who)\b/i.test(q.value)) hints.push('Question detected: try adding a site name for focused results');
  if (/\b(error|exception|fix|bug|undefined|failed)\b/i.test(q.value)) hints.push('Looks like a code problem: add the language or tool name');
  if (/\b(buy|price|cheap|deal|review)\b/i.test(q.value)) hints.push('Shopping intent: trackers are stripped from result links');
  return hints;
}

export const PRIVACY_BADGES = [
  ['Trackers stripped', 'Click-tracking parameters (utm_*, fbclid, gclid and more) are removed from every address.'],
  ['HTTPS first', 'Plain http addresses are upgraded to https, except localhost.'],
  ['Private search', 'Searches go to DuckDuckGo, which keeps no search profile.'],
  ['Sandboxed pages', 'Web pages run in their own view with no access to Toolbox commands.'],
  ['On-device assist', 'Suggestions are computed locally. Nothing you type is sent to an AI service.']
];
