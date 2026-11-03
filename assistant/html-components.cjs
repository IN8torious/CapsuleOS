'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const MAX_LIBRARY_BYTES = 512 * 1024;
const MAX_COMPONENTS = 80;
const digest = value => createHash('sha256').update(value).digest('hex');
const keysAre = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

async function decomposeHtml(source, name, sourceSha256) {
  const { parse } = await import('parse5');
  const tree = parse(source, { sourceCodeLocationInfo: true });
  const components = [];
  function walk(node, parentId = null, inHead = false) {
    const location = node.sourceCodeLocation;
    const tag = node.tagName;
    const attributes = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
    let id = parentId;
    const isComponent = location && tag && !['html', 'head', 'body'].includes(tag)
      && (inHead ? ['style', 'script', 'link', 'title'].includes(tag)
        : node.parentNode?.tagName === 'body' || ['main', 'nav', 'header', 'footer', 'section', 'article', 'aside', 'script', 'style'].includes(tag)
          || Boolean(attributes.id));
    if (isComponent) {
      if (components.length >= MAX_COMPONENTS) throw new Error('This document exceeds 80 source components. Split it into smaller HTML files; nothing was silently discarded.');
      id = `part-${components.length + 1}`;
      const text = source.slice(location.startOffset, location.endOffset);
      components.push({
        id, parentId, tag, label: `${tag}${attributes.id ? `#${attributes.id}` : ''}`,
        kind: ['script', 'style', 'link'].includes(tag) ? 'dependency' : 'markup',
        start: location.startOffset, end: location.endOffset,
        startLine: location.startLine, endLine: location.endLine,
        bytes: Buffer.byteLength(text), sha256: digest(text), source: text,
        hint: text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100),
        external: attributes.src || attributes.href || null
      });
    }
    for (const child of node.childNodes || []) walk(child, id, inHead || tag === 'head');
  }
  walk(tree);
  if (!components.length) throw new Error('No source-located HTML components were found.');
  return { name, sourceSha256, components };
}

function publicDecomposition(document) {
  return {
    name: document.name, sourceSha256: document.sourceSha256,
    warning: 'Source-only decomposition. Shared scripts/styles are indivisible dependencies, not proven safe or necessary. Selection does not guarantee a working reduced scene. No linked file is fetched.',
    components: document.components.map(({ source, start, end, ...component }) => component)
  };
}

function validateSelection(document, sourceSha256, componentIds) {
  if (sourceSha256 !== document?.sourceSha256) throw new Error('The imported source changed. Deconstruct and review the current source again.');
  if (!Array.isArray(componentIds) || componentIds.length < 1 || componentIds.length > MAX_COMPONENTS
      || new Set(componentIds).size !== componentIds.length || componentIds.some(id => typeof id !== 'string')) {
    throw new Error('Select 1-80 unique components.');
  }
  const selected = componentIds.map(id => {
    const component = document.components.find(part => part.id === id);
    if (!component) throw new Error('A selected component does not belong to the current source.');
    return component;
  });
  // An outer selection already contains its nested components; never duplicate their source.
  return selected.filter(part => !selected.some(parent => parent.id !== part.id && parent.start <= part.start && parent.end >= part.end));
}

function parseSelectionProposal(document, output) {
  if (typeof output !== 'string' || output.length > 24000) throw new Error('Component proposal is oversized or missing.');
  const value = JSON.parse(output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!keysAre(value, ['summary', 'components']) || typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 600
      || !Array.isArray(value.components) || !value.components.length
      || value.components.some(part => !keysAre(part, ['id', 'reason']) || typeof part.reason !== 'string' || !part.reason.trim() || part.reason.length > 300)) {
    throw new Error('The model must return a bounded summary and component IDs with reasons. No source was retained.');
  }
  validateSelection(document, document.sourceSha256, value.components.map(part => part.id));
  return value;
}

function exportSelection(document, sourceSha256, componentIds) {
  const selected = validateSelection(document, sourceSha256, componentIds).sort((a, b) => a.start - b.start);
  const head = selected.filter(part => ['style', 'link', 'title'].includes(part.tag)).map(part => part.source).join('\n');
  const body = selected.filter(part => !['style', 'link', 'title'].includes(part.tag)).map(part => part.source).join('\n');
  // Exports are inert by default even if the user explicitly retained source scripts.
  const html = `<!doctype html>\n<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'">\n${head}</head><body>\n${body}\n</body></html>`;
  if (Buffer.byteLength(JSON.stringify(html)) > 768 * 1024) throw new Error('The selected source exceeds the transport limit. Export smaller selections.');
  const covered = document.components.filter(part => selected.some(parent => parent.start <= part.start && parent.end >= part.end));
  return {
    html, selected: selected.map(({ id, label, sha256 }) => ({ id, label, sha256 })),
    omitted: document.components.filter(part => !covered.includes(part)).map(part => part.id),
    warning: 'Only explicitly selected source is copied. Exported scripts and external resources are disabled by CSP. Parent wrappers, styles, handlers and model assets may require manual adaptation. Originals are unchanged.'
  };
}

async function readComponentLibrary(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_LIBRARY_BYTES) throw new Error('Component library must be a regular file no larger than 512 KiB.');
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    if (record.version !== 1 || !Array.isArray(record.entries) || record.entries.length > 20
        || record.entries.some(entry => !entry || typeof entry.id !== 'string' || typeof entry.html !== 'string'
          || entry.sha256 !== digest(entry.html))) throw new Error('Component library data is invalid.');
    return record.entries;
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function retainSelection(file, document, { sourceSha256, componentIds, confirmed }) {
  if (confirmed !== true) throw new Error('Review and explicitly approve components before retaining source.');
  const selected = validateSelection(document, sourceSha256, componentIds);
  const entries = await readComponentLibrary(file);
  const additions = selected.map(part => ({
    id: randomUUID(), sourceName: document.name, sourceSha256, label: part.label,
    startLine: part.startLine, endLine: part.endLine, sha256: part.sha256,
    html: part.source, savedAt: new Date().toISOString()
  })).filter(part => !entries.some(entry => entry.sourceSha256 === sourceSha256 && entry.sha256 === part.sha256));
  const next = [...entries, ...additions];
  if (next.length > 20) throw new Error('The component library holds at most 20 entries. Forget existing entries before adding more.');
  const content = JSON.stringify({ version: 1, entries: next });
  if (Buffer.byteLength(content) > MAX_LIBRARY_BYTES) throw new Error('Selected components exceed the 512-KiB library limit. Retain less source.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, content, { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
  return next;
}

async function forgetComponent(file, id) {
  const entries = await readComponentLibrary(file);
  if (typeof id !== 'string' || !entries.some(entry => entry.id === id)) throw new Error('Select an existing retained component.');
  const next = entries.filter(entry => entry.id !== id);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify({ version: 1, entries: next }), { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
  return next;
}

module.exports = { decomposeHtml, publicDecomposition, parseSelectionProposal, exportSelection, retainSelection, readComponentLibrary, forgetComponent };
