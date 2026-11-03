'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_PROPOSALS = 100;
const MAX_STORE_BYTES = 2 * 1024 * 1024;
const MAX_NAME_CHARS = 100;
const MAX_CONTENT_CHARS = 16000;

async function readProposals(storePath) {
  let bytes;
  try {
    bytes = await fs.readFile(storePath);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Unable to read kernel proposals: ${error.message}`);
  }
  if (bytes.length > MAX_STORE_BYTES) throw new Error('Kernel proposal library exceeds its size limit.');
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Kernel proposal library is malformed.');
  }
  if (document.version !== 1 || !Array.isArray(document.proposals) || document.proposals.length > MAX_PROPOSALS) {
    throw new Error('Kernel proposal library is invalid or exceeds its limits.');
  }
  const ids = new Set();
  for (const proposal of document.proposals) {
    if (
      !proposal || typeof proposal.id !== 'string' || !/^[a-f0-9-]{36}$/.test(proposal.id) ||
      typeof proposal.lineageId !== 'string' || !/^[a-f0-9-]{36}$/.test(proposal.lineageId) ||
      ids.has(proposal.id) || typeof proposal.name !== 'string' ||
      !proposal.name.trim() || proposal.name.length > MAX_NAME_CHARS ||
      typeof proposal.content !== 'string' || !proposal.content.trim() ||
      proposal.content.length > MAX_CONTENT_CHARS ||
      !Number.isSafeInteger(proposal.versionNumber) || proposal.versionNumber < 1 ||
      !Number.isSafeInteger(proposal.createdAt) || proposal.status !== 'proposed' ||
      typeof proposal.sourcePackage !== 'string' || proposal.sourcePackage.length > 120 ||
      (proposal.parentId !== null &&
        (typeof proposal.parentId !== 'string' || !/^[a-f0-9-]{36}$/.test(proposal.parentId)))
    ) {
      throw new Error('Kernel proposal library contains invalid data.');
    }
    ids.add(proposal.id);
  }
  for (const proposal of document.proposals) {
    if (proposal.parentId) {
      const parent = document.proposals.find((item) => item.id === proposal.parentId);
      if (!parent || parent.versionNumber + 1 !== proposal.versionNumber ||
          parent.lineageId !== proposal.lineageId) {
        throw new Error('Kernel proposal lineage references an invalid version.');
      }
    }
  }
  return document.proposals;
}

async function createKernelProposal({ storePath, name, content, parentId = null, sourcePackage }) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_NAME_CHARS) {
    throw new Error(`Proposal names must be between 1 and ${MAX_NAME_CHARS} characters.`);
  }
  if (typeof content !== 'string' || !content.trim() || content.length > MAX_CONTENT_CHARS) {
    throw new Error(`Agent proposals must contain 1–${MAX_CONTENT_CHARS} characters.`);
  }

  const proposals = await readProposals(storePath);
  if (proposals.length >= MAX_PROPOSALS) throw new Error('The local proposal library is full.');
  const parent = parentId ? proposals.find((proposal) => proposal.id === parentId) : null;
  if (parentId && !parent) throw new Error('The selected parent proposal no longer exists.');
  const proposal = {
    id: randomUUID(),
    lineageId: parent?.lineageId || randomUUID(),
    name: name.trim(),
    content: content.trim(),
    parentId: parent?.id || null,
    versionNumber: parent ? parent.versionNumber + 1 : 1,
    createdAt: Date.now(),
    sourcePackage: typeof sourcePackage === 'string' ? sourcePackage.slice(0, 120) : '',
    status: 'proposed'
  };
  const parentDirectory = path.dirname(storePath);
  await fs.mkdir(parentDirectory, { recursive: true });
  const document = { version: 1, proposals: [...proposals, proposal] };
  const bytes = Buffer.from(JSON.stringify(document, null, 2));
  if (bytes.length > MAX_STORE_BYTES) throw new Error('Kernel proposal library exceeds its size limit.');
  const temporaryPath = `${storePath}.${proposal.id}.tmp`;
  try {
    await fs.writeFile(temporaryPath, bytes, { flag: 'wx' });
    await fs.rename(temporaryPath, storePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw new Error(`Unable to save kernel proposal: ${error.message}`);
  }
  return proposal;
}

module.exports = { createKernelProposal, readProposals };
