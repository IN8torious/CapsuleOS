'use strict';

const { hashContent } = require('./css-proposals.cjs');

// RingFlow-inspired source attestation, not a proof of semantic correctness.
function verifyEvidenceClaims(claims, sources) {
  if (!Array.isArray(claims) || claims.length < 1 || claims.length > 4) {
    return { ok: false, reason: 'Supply one to four exact source quotations; empty evidence cannot authorize an edit.' };
  }
  for (const claim of claims) {
    if (!claim || typeof claim !== 'object'
      || Object.keys(claim).sort().join(',') !== 'lineEnd,lineStart,path,sha256,text'
      || typeof claim.path !== 'string' || typeof claim.text !== 'string' || !claim.text.trim() || claim.text.length > 2000
      || !Number.isSafeInteger(claim.lineStart) || !Number.isSafeInteger(claim.lineEnd)
      || claim.lineStart < 1 || claim.lineEnd < claim.lineStart || claim.lineEnd - claim.lineStart > 39) {
      return { ok: false, reason: 'A source quotation has an invalid shape or line range.' };
    }
    const source = sources.find(item => item.path === claim.path);
    if (!source || claim.sha256 !== source.sha256 || hashContent(source.content) !== source.sha256) {
      return { ok: false, reason: 'The quotation does not identify a current supplied source and its full SHA-256.' };
    }
    const lines = source.content.split('\n');
    if (claim.lineEnd > lines.length || lines.slice(claim.lineStart - 1, claim.lineEnd).join('\n') !== claim.text) {
      return { ok: false, reason: 'The quotation does not exactly match the specified source lines.' };
    }
  }
  return { ok: true, count: claims.length };
}

module.exports = { verifyEvidenceClaims };
