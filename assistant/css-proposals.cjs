const crypto = require('node:crypto');
const path = require('node:path');

const MAX_STYLESHEET_BYTES = 100_000;
const MAX_CSS_PROPOSAL_BYTES = 12_000;

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function extractCssProposal(text) {
  const match = /```css\s*([\s\S]*?)```/i.exec(text);
  if (!match) throw new Error('The model did not return a fenced CSS proposal.');

  const summary = text.slice(0, match.index).replace(/^\s*(?:summary:)?\s*/i, '').trim();
  const css = match[1].trim();
  if (!summary || !css) throw new Error('The model returned an incomplete CSS proposal.');
  if (text.slice(match.index + match[0].length).trim()) {
    throw new Error('The model returned extra content after the CSS proposal.');
  }
  validateCssAddition(css);
  return { summary: summary.slice(0, 500), css };
}

function validateCssAddition(css) {
  if (Buffer.byteLength(css, 'utf8') > MAX_CSS_PROPOSAL_BYTES) {
    throw new Error('The proposed stylesheet is too large to apply.');
  }
  if (/\\|@import\b|\burl\s*\(|expression\s*\(|javascript\s*:|-moz-binding|\bbehavior\s*:/i.test(css)) {
    throw new Error('The proposal contains CSS that can load external content or executable behavior.');
  }

  let depth = 0;
  let quote = '';
  let comment = false;
  for (let index = 0; index < css.length; index += 1) {
    const current = css[index];
    const next = css[index + 1];
    if (comment) {
      if (current === '*' && next === '/') {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (current === '\\') index += 1;
      else if (current === quote) quote = '';
      continue;
    }
    if (current === '/' && next === '*') {
      comment = true;
      index += 1;
    } else if (current === '"' || current === "'") {
      quote = current;
    } else if (current === '{') {
      depth += 1;
    } else if (current === '}') {
      depth -= 1;
      if (depth < 0) throw new Error('The CSS proposal has unbalanced braces.');
    }
  }
  if (depth !== 0 || quote || comment) throw new Error('The CSS proposal is incomplete.');
}

function buildAppendDiff(fileName, original, css) {
  const oldLines = original.trimEnd().split(/\r?\n/);
  const newLines = css.split(/\r?\n/);
  const context = oldLines.slice(-3);
  return [
    `--- ${path.basename(fileName)}`,
    `+++ ${path.basename(fileName)} (proposed)`,
    `@@ append after line ${oldLines.length} @@`,
    ...context.map((line) => ` ${line}`),
    '+',
    '+/* Approved SI Core toolbox customization */',
    ...newLines.map((line) => `+${line}`)
  ].join('\n');
}

module.exports = {
  MAX_CSS_PROPOSAL_BYTES,
  MAX_STYLESHEET_BYTES,
  buildAppendDiff,
  extractCssProposal,
  hashContent,
  validateCssAddition
};
