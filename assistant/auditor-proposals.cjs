'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_PROPOSALS = 100;
const MAX_STORE_BYTES = 512 * 1024;
const MAX_SOURCE_PATHS = 36;
const MAX_CITATIONS = 24;
const MAX_FINDINGS = 4;
const MAX_FINDING_CHARS = 6000;
let writeQueue = Promise.resolve();

function validateProposal(proposal) {
  return Boolean(
    proposal && typeof proposal === 'object' && !Array.isArray(proposal) &&
    typeof proposal.id === 'string' && /^[a-f0-9-]{36}$/i.test(proposal.id) &&
    typeof proposal.name === 'string' && proposal.name.trim() && proposal.name.length <= 120 &&
    typeof proposal.sourcePackage === 'string' && proposal.sourcePackage.trim() &&
    proposal.sourcePackage.length <= 160 &&
    (proposal.packageSha256 === undefined ||
      typeof proposal.packageSha256 === 'string' && /^[a-f0-9]{64}$/.test(proposal.packageSha256)) &&
    Array.isArray(proposal.sourcePaths) && proposal.sourcePaths.length <= MAX_SOURCE_PATHS &&
    proposal.sourcePaths.every((item) =>
      typeof item === 'string' && item.trim() && item.length <= 240 &&
      !item.includes('\0') && !item.split(/[\\/]/).includes('..')
    ) &&
    (proposal.sourceEvidence === undefined ||
      Array.isArray(proposal.sourceEvidence) && proposal.sourceEvidence.length <= MAX_SOURCE_PATHS &&
      proposal.sourceEvidence.every((item) =>
        item && typeof item.path === 'string' && item.path.trim() && item.path.length <= 240 &&
        !item.path.includes('\0') && !item.path.split(/[\\/]/).includes('..') &&
        typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256) &&
        Number.isSafeInteger(item.lineCount) && item.lineCount > 0
      )) &&
    Array.isArray(proposal.findings) && proposal.findings.length > 0 &&
    proposal.findings.length <= MAX_FINDINGS &&
    proposal.findings.every((finding) =>
      finding && typeof finding.reviewer === 'string' && finding.reviewer.trim() &&
      finding.reviewer.length <= 80 && typeof finding.text === 'string' &&
      finding.text.trim() && finding.text.length <= MAX_FINDING_CHARS &&
      (finding.citations === undefined ||
        Array.isArray(finding.citations) && finding.citations.length <= MAX_CITATIONS &&
        finding.citations.every((citation) => {
          if (!citation || typeof citation.path !== 'string') return false;
          const evidence = proposal.sourceEvidence?.find((item) => item.path === citation.path);
          return evidence &&
            Number.isSafeInteger(citation.lineStart) && citation.lineStart > 0 &&
            Number.isSafeInteger(citation.lineEnd) && citation.lineEnd >= citation.lineStart &&
            citation.lineEnd <= evidence.lineCount &&
            citation.lineEnd - citation.lineStart <= 40;
        })
      )
    ) &&
    Number.isSafeInteger(proposal.createdAt)
  );
}

function extractLineCitations(text, sourceEvidence = []) {
  const evidenceByPath = new Map(sourceEvidence.map((item) => [item.path, item]));
  const citations = [];
  const seen = new Set();
  const pattern = /\[([^\]\r\n]+):L(\d+)(?:-L(\d+))?\]/g;
  for (const match of text.matchAll(pattern)) {
    const [, sourcePath, startText, endText = startText] = match;
    const evidence = evidenceByPath.get(sourcePath);
    const lineStart = Number(startText);
    const lineEnd = Number(endText);
    if (
      !evidence || !Number.isSafeInteger(lineStart) || !Number.isSafeInteger(lineEnd) ||
      lineStart < 1 || lineEnd < lineStart || lineEnd > evidence.lineCount ||
      lineEnd - lineStart > 40
    ) continue;
    const key = `${sourcePath}:${lineStart}-${lineEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ path: sourcePath, lineStart, lineEnd });
    if (citations.length >= MAX_CITATIONS) break;
  }
  return citations;
}

async function readDocument(storePath) {
  let content;
  try {
    content = await fs.readFile(storePath);
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, proposals: [] };
    throw new Error(`Unable to read local auditor proposals: ${error.message}`);
  }
  if (content.length > MAX_STORE_BYTES) {
    throw new Error('The local auditor proposal library exceeds the size limit.');
  }
  let document;
  try {
    document = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error('The local auditor proposal library is malformed.');
  }
  if (
    document.version !== 1 || !Array.isArray(document.proposals) ||
    document.proposals.length > MAX_PROPOSALS ||
    document.proposals.some((proposal) => !validateProposal(proposal)) ||
    new Set(document.proposals.map((proposal) => proposal.id)).size !== document.proposals.length
  ) {
    throw new Error('The local auditor proposal library is invalid or exceeds its limits.');
  }
  return document;
}

async function appendAuditorProposal(storePath, proposal) {
  if (!validateProposal(proposal)) {
    throw new Error('The auditor reference proposal is invalid or exceeds its limits.');
  }
  const write = writeQueue.then(async () => {
    const document = await readDocument(storePath);
    if (document.proposals.length >= MAX_PROPOSALS) {
      throw new Error('The local auditor proposal library is full.');
    }
    if (document.proposals.some((existing) => existing.id === proposal.id)) {
      throw new Error('That auditor reference proposal already exists.');
    }
    const updated = { version: 1, proposals: [...document.proposals, proposal] };
    const content = Buffer.from(JSON.stringify(updated, null, 2), 'utf8');
    if (content.length > MAX_STORE_BYTES) {
      throw new Error('The local auditor proposal library exceeds the size limit.');
    }
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    const temporaryPath = `${storePath}.${process.pid}.${proposal.id}.tmp`;
    try {
      await fs.writeFile(temporaryPath, content, { flag: 'wx' });
      await fs.rename(temporaryPath, storePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw new Error(`Unable to save the auditor reference proposal: ${error.message}`);
    }
    return proposal;
  });
  writeQueue = write.catch(() => {});
  return write;
}

module.exports = {
  appendAuditorProposal,
  extractLineCitations,
  validateProposal
};
