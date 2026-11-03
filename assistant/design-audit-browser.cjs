// Serialized into the isolated audit browser; no application or host state is changed.
function measureDesign() {
  const samples = [], geometry = [], excluded = { hiddenTextNodes: 0, nonTextNodes: 0 };
  let textNodes = 0;
  const bibleUI = element => !!element.closest('.bible-nav, .bible-details > summary, .bible-action, .bible-shell input, .bible-shell select, .bible-search > label, .bible-search button, .bible-filter, .bible-verse sup');
  const selector = element => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const parts = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      parts.unshift(`${node.localName}:nth-child(${[...node.parentElement.children].indexOf(node) + 1})`);
      if (node.matches('.view')) { parts[0] = `.view[data-view="${node.dataset.view}"]`; break; }
    }
    return parts.join(' > ');
  };
  const visible = element => {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    return [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
  };
  const role = (element, text) => {
    if (element.closest('.bible-scripture, .bible-verse > span, [data-bible-selected-text]')) return 'scripture';
    if (element.closest('.brand')) return 'brand';
    const style = getComputedStyle(element);
    if (element.closest('.eyebrow, .rail-section-label, .bible-kicker, .bible-meta, .bible-testament, .bible-footer, .build-pill, .runtime-health, .bw-state, .source-badge, .admin-badge, .local-only-badge, .read-only-label') ||
        (style.textTransform === 'uppercase' && text.length <= 80)) return 'metadata';
    if (element.closest('h1,h2,h3,h4,h5,h6')) return 'heading';
    if (element.closest('button,input,textarea,select,summary,[role="button"]')) return 'control';
    return 'prose';
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const measuredElements = new Set();
  for (let node; (node = walker.nextNode());) {
    const text = node.textContent.trim(), element = node.parentElement;
    if (!text || element.closest('script,style,svg,canvas,option')) { excluded.nonTextNodes++; continue; }
    if (!visible(element)) { excluded.hiddenTextNodes++; continue; }
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(rect => rect.width && rect.height);
    if (!rects.length) { excluded.hiddenTextNodes++; continue; }
    textNodes++;
    const style = getComputedStyle(element), sampleRole = role(element, text);
    samples.push({ selector: selector(element), role: sampleRole, fontSize: Number.parseFloat(style.fontSize), letterSpacing: style.letterSpacing, fontStretch: style.fontStretch, fontFamily: style.fontFamily,
      bibleUI: bibleUI(element) });
    measuredElements.add(element);
    // Text may scroll in intentional scrollports. Only hidden/clip ancestors are clipping failures.
    for (let ancestor = element; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const css = getComputedStyle(ancestor), box = ancestor.getBoundingClientRect();
      const x = ['hidden', 'clip'].includes(css.overflowX), y = ['hidden', 'clip'].includes(css.overflowY);
      if (!x && !y) continue;
      const clipped = rects.some(rect => (x && (rect.left < box.left - 2 || rect.right > box.right + 2)) || (y && (rect.top < box.top - 2 || rect.bottom > box.bottom + 2)));
      // This two-line teaser has a separately required full-prayer audit state.
      if (ancestor.matches('.bible-prayer-preview') && css.webkitLineClamp === '2') {
        geometry.push({ check: 'prayer-preview-two-line-clamp', selector: selector(element), pass: true, value: 'Full content measured in bible/prayer; intentional two-line teaser' });
        continue;
      }
      geometry.push({ check: 'text-not-clipped', selector: selector(element), pass: !clipped, value: { clippingAncestor: selector(ancestor), overflowX: css.overflowX, overflowY: css.overflowY } });
    }
  }
  for (const element of document.querySelectorAll('button,input,textarea,select,summary,[role="button"]')) {
    if (!visible(element)) continue;
    const style = getComputedStyle(element);
    if (!measuredElements.has(element)) {
      const sampleRole = role(element, element.value || element.textContent.trim());
      samples.push({ selector: selector(element), role: sampleRole, fontSize: Number.parseFloat(style.fontSize), letterSpacing: style.letterSpacing, fontStretch: style.fontStretch, fontFamily: style.fontFamily, bibleUI: bibleUI(element) });
    }
    const clippedX = element.scrollWidth > element.clientWidth + 2 && !['auto', 'scroll'].includes(style.overflowX);
    const clippedY = element.scrollHeight > element.clientHeight + 2 && !['auto', 'scroll'].includes(style.overflowY);
    geometry.push({ check: 'control-not-clipped', selector: selector(element), pass: !clippedX && !clippedY, value: { scroll: [element.scrollWidth, element.scrollHeight], client: [element.clientWidth, element.clientHeight] } });
  }
  let directoryCaptions = 0;
  for (const element of document.querySelectorAll('#page-directory .nav-item[data-caption]')) {
    if (!visible(element)) continue;
    const style = getComputedStyle(element, '::after');
    const rendered = style.content !== 'none' && style.content !== 'normal' && style.content !== '""' && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    geometry.push({ check: 'directory-caption-rendered', selector: selector(element) + '::after', pass: rendered && !!element.dataset.caption.trim(), value: style.content });
    if (!rendered) continue;
    directoryCaptions++;
    samples.push({ selector: selector(element) + '::after', role: 'prose', fontSize: Number.parseFloat(style.fontSize), letterSpacing: style.letterSpacing, fontStretch: style.fontStretch, fontFamily: style.fontFamily, bibleUI: false });
  }
  geometry.push({ check: 'document-no-horizontal-overflow', selector: 'html', pass: document.documentElement.scrollWidth <= innerWidth + 2, value: { width: innerWidth, scrollWidth: document.documentElement.scrollWidth } });
  const root = document.querySelector('.workspace > .view.active');
  geometry.push({ check: 'active-page-rendered', selector: '.view.active', pass: !!root && visible(root) && root.innerText.trim().length > 0, value: root?.dataset.view });
  return { samples, geometry, textNodes, directoryCaptions, excluded };
}
module.exports = { measureDesign };
