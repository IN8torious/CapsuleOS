'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const AdmZip = require('adm-zip');
const { buildStaticReport, reportToMarkdown } = require('./mod-report.cjs');

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_DOCUMENTS = 24;
const MAX_DOCUMENT_BYTES = 96 * 1024;
const MAX_TOTAL_TEXT_BYTES = 256 * 1024;
const MAX_ANALYSIS_CHARS = 14000;
const MAX_SOURCE_FILES = 12;
const MAX_SOURCE_BYTES = 32 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 128 * 1024;
const MAX_SOURCE_ANALYSIS_CHARS = 16000;
const ALLOWED_EXTENSIONS = new Set(['.zip', '.jar', '.mrpack', '.mcpack']);
const TEXT_EXTENSIONS = new Set([
  '.cfg', '.json', '.md', '.properties', '.toml', '.txt', '.xml', '.yaml', '.yml'
]);
const EXECUTABLE_EXTENSIONS = new Set([
  '.class', '.dll', '.exe', '.jar', '.so', '.wasm'
]);
const SOURCE_EXTENSIONS = new Set([
  '.bat', '.c', '.cc', '.cpp', '.cs', '.cmd', '.cjs', '.go', '.h', '.hpp',
  '.java', '.js', '.jsx', '.kt', '.lua', '.mjs', '.php', '.pl', '.ps1',
  '.py', '.rb', '.rs', '.scala', '.sh', '.ts', '.tsx'
]);

function isSafeEntryName(name) {
  if (!name || name.includes('\0')) return false;
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return false;
  return !normalized.split('/').some((part) => part === '..');
}

function isUsefulDocument(name) {
  const normalized = name.replace(/\\/g, '/');
  const basename = path.posix.basename(normalized).toLowerCase();
  if (/^(readme|license|licence|notice|mods\.toml|fabric\.mod\.json|quilt\.mod\.json|mcmod\.info|pack\.mcmeta|modrinth\.index\.json|manifest\.json)(\.|$)/.test(basename)) {
    return true;
  }
  return TEXT_EXTENSIONS.has(path.posix.extname(basename)) &&
    /(^|\/)(meta-inf|docs?|documentation|config|data)(\/|$)/i.test(normalized);
}

function isUsefulSource(name) {
  return SOURCE_EXTENSIONS.has(path.posix.extname(name.replace(/\\/g, '/')).toLowerCase());
}

function numberedLines(text) {
  return text.split(/\r\n|\n|\r/).map((line, index) => `${index + 1}: ${line}`).join('\n');
}

async function inspectModPackage(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html' || extension === '.htm') {
    return require('./html-source.cjs').inspectHtmlSource(filePath);
  }
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('Choose a ZIP, JAR, MCPACK, or MRPACK package.');
  }
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Choose a regular package file, not a link or folder.');
  }
  if (stat.size < 22 || stat.size > MAX_ARCHIVE_BYTES) {
    throw new Error('Package archives must be between 22 bytes and 50 MiB.');
  }

  const packageSha256 = createHash('sha256')
    .update(await fs.readFile(filePath))
    .digest('hex');
  let entries;
  try {
    entries = new AdmZip(filePath).getEntries();
  } catch {
    throw new Error('The selected file is not a readable ZIP-compatible package.');
  }
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`The package contains too many entries (maximum ${MAX_ENTRIES}).`);
  }

  const documents = [];
  const sourceFiles = [];
  const sourceEvidence = [];
  const executablePaths = [];
  const entryNames = [];
  let declaredTextBytes = 0;
  let declaredSourceBytes = 0;
  let skippedDocuments = 0;
  let skippedSources = 0;
  for (const entry of entries) {
    const name = entry.entryName;
    if (!isSafeEntryName(name) || entry.isDirectory) continue;
    entryNames.push(name);
    const normalizedName = name.replace(/\\/g, '/');
    const extensionName = path.posix.extname(normalizedName).toLowerCase();
    if (EXECUTABLE_EXTENSIONS.has(extensionName)) {
      if (executablePaths.length < 20) executablePaths.push(name);
      continue;
    }
    if (isUsefulSource(name)) {
      const size = entry.header?.size;
      const compressedSize = entry.header?.compressedSize;
      if (!Number.isSafeInteger(size) || size < 0 || size > MAX_SOURCE_BYTES ||
          !Number.isSafeInteger(compressedSize) || compressedSize < 0 ||
          (size > 0 && (compressedSize === 0 || size / compressedSize > 200)) ||
          sourceFiles.length >= MAX_SOURCE_FILES ||
          declaredSourceBytes + size > MAX_TOTAL_SOURCE_BYTES) {
        skippedSources += 1;
        continue;
      }
      let data;
      try {
        data = entry.getData();
      } catch {
        skippedSources += 1;
        continue;
      }
      if (!data || data.length !== size) {
        skippedSources += 1;
        continue;
      }
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(data);
      } catch {
        skippedSources += 1;
        continue;
      }
      if (text.includes('\0')) {
        skippedSources += 1;
        continue;
      }
      declaredSourceBytes += data.length;
      sourceFiles.push({ path: name, text });
      sourceEvidence.push({
        path: name,
        sha256: createHash('sha256').update(data).digest('hex'),
        lineCount: text.split(/\r\n|\n|\r/).length
      });
      continue;
    }
    const extensionlessDocument = /^(readme|license|licence|notice)$/i.test(path.posix.basename(normalizedName));
    if (!isUsefulDocument(name) || (!TEXT_EXTENSIONS.has(extensionName) && !extensionlessDocument)) continue;

    const size = entry.header?.size;
    const compressedSize = entry.header?.compressedSize;
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_DOCUMENT_BYTES ||
        !Number.isSafeInteger(compressedSize) || compressedSize < 0 ||
        (size > 0 && (compressedSize === 0 || size / compressedSize > 200))) {
      skippedDocuments += 1;
      continue;
    }
    if (documents.length >= MAX_DOCUMENTS || declaredTextBytes + size > MAX_TOTAL_TEXT_BYTES) {
      skippedDocuments += 1;
      continue;
    }

    let data;
    try {
      data = entry.getData();
    } catch {
      skippedDocuments += 1;
      continue;
    }
    if (!data || data.length !== size) {
      skippedDocuments += 1;
      continue;
    }
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch {
      skippedDocuments += 1;
      continue;
    }
    declaredTextBytes += data.length;
    documents.push({ path: name, text });
    sourceEvidence.push({
      path: name,
      sha256: createHash('sha256').update(data).digest('hex'),
      lineCount: text.split(/\r\n|\n|\r/).length
    });
  }

  const completeDocumentText = documents
    .map(({ path: documentPath, text }) => `--- ${documentPath} ---\n${numberedLines(text)}`)
    .join('\n\n');
  const completeSourceText = sourceFiles
    .map(({ path: sourcePath, text }) => `--- untrusted source text: ${sourcePath} ---\n${numberedLines(text)}`)
    .join('\n\n');
  const analysisText = [
    completeDocumentText.slice(0, MAX_ANALYSIS_CHARS),
    completeSourceText.slice(0, MAX_SOURCE_ANALYSIS_CHARS)
  ].filter(Boolean).join('\n\n');

  const report = buildStaticReport({ entryNames, documents, sources: sourceFiles, executablePaths });
  return {
    name: path.basename(filePath),
    report,
    reportMarkdown: reportToMarkdown(path.basename(filePath), packageSha256, report),
    packageSha256,
    entryCount: entries.length,
    documentPaths: documents.map((document) => document.path),
    sourcePaths: sourceFiles.map((source) => source.path),
    sourceEvidence,
    executablePaths,
    skippedDocuments,
    skippedSources,
    analysisTruncated: completeDocumentText.length > MAX_ANALYSIS_CHARS ||
      completeSourceText.length > MAX_SOURCE_ANALYSIS_CHARS,
    analysisText
  };
}

module.exports = {
  MAX_ANALYSIS_CHARS,
  MAX_ARCHIVE_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_ENTRIES,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_FILES,
  MAX_SOURCE_ANALYSIS_CHARS,
  MAX_TOTAL_SOURCE_BYTES,
  inspectModPackage,
  isSafeEntryName,
  isUsefulDocument,
  isUsefulSource,
  numberedLines
};
