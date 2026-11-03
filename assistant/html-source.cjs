'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { buildStaticReport } = require('./mod-report.cjs');

const MAX_HTML_BYTES = 512 * 1024;
const MAX_HTML_ANALYSIS_CHARS = 30000;

async function inspectHtmlSource(filePath) {
  if (!['.html', '.htm'].includes(path.extname(filePath).toLowerCase())) {
    throw new Error('Choose an HTML or HTM source file.');
  }
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Choose a regular HTML file, not a link or folder.');
  const handle = await fs.open(filePath, 'r');
  let data;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size < 1 || opened.size > MAX_HTML_BYTES) {
      throw new Error('HTML files must be between 1 byte and 512 KiB.');
    }
    const buffer = Buffer.alloc(MAX_HTML_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_HTML_BYTES) throw new Error('HTML files must not exceed 512 KiB.');
    data = buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw new Error('HTML source must be readable UTF-8 text.');
  }
  return inspectHtmlText(source, path.basename(filePath), data);
}

function inspectHtmlText(source, name, data = Buffer.from(source, 'utf8')) {
  if (!source.trim() || source.includes('\0') || data.length > MAX_HTML_BYTES) throw new Error('HTML source must be nonempty UTF-8 text without null bytes, up to 512 KiB.');
  const sha256 = createHash('sha256').update(data).digest('hex');
  const lines = source.split(/\r\n|\n|\r/);
  const report = buildStaticReport({
    entryNames: [name], documents: [], sources: [{ path: name, text: source }], executablePaths: []
  });
  report.metadata.loader = 'HTML source (inert)';
  report.metadata.description = 'Static source inspection only. Linked files are not read or fetched. Counts are lexical hints, not a parsed DOM or proof of behavior.';
  report.inventory = [
    ['scripts', /<script\b/gi], ['style blocks', /<style\b/gi],
    ['stylesheet links', /<link\b/gi], ['forms', /<form\b/gi],
    ['frames', /<iframe\b/gi], ['images', /<img\b/gi],
    ['headings', /<h[1-6]\b/gi], ['semantic regions', /<(?:main|nav|header|footer|section|article|aside)\b/gi],
    ['inline event attributes', /\bon[a-z]+\s*=/gi]
  ].map(([category, pattern]) => ({ category, count: [...source.matchAll(pattern)].length }));
  report.notes = [{ level: 'info', text: report.metadata.description }];
  report.verdict = { level: 'check-details', summary: 'HTML held as source text only. Scripts, frames and assets have not been executed or loaded.', metadataFound: true };
  const numbered = lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
  const analysisText = `--- untrusted HTML source: ${name} ---\n${numbered.slice(0, MAX_HTML_ANALYSIS_CHARS)}`;
  const reportMarkdown = [
    `# HTML source review: ${name}`, '', `SHA-256: ${sha256}`, '',
    report.metadata.description, '',
    ...report.inventory.map(item => `- ${item.category}: ${item.count}`),
    '', ...report.signals.flatMap(signal => [
      `## ${signal.label} (pattern match only)`,
      ...signal.hits.map(hit => `- ${hit.path}:${hit.line} ${hit.excerpt}`)
    ]), '', 'No execution, linked-file access, model training, or automatic changes.'
  ].join('\n');
  return {
    kind: 'html', name, packageSha256: sha256, entryCount: 1,
    documentPaths: [], sourcePaths: [name],
    sourceEvidence: [{ path: name, sha256, lineCount: lines.length }],
    executablePaths: [], skippedDocuments: 0, skippedSources: 0,
    analysisTruncated: numbered.length > MAX_HTML_ANALYSIS_CHARS,
    analysisText, sourceText: source, report, reportMarkdown
  };
}

module.exports = { inspectHtmlSource, inspectHtmlText, MAX_HTML_BYTES, MAX_HTML_ANALYSIS_CHARS };
