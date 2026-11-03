const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { replaceKernelBlock } = require('../kernel/document.cjs');

const root = path.resolve(__dirname, '..');

test('standalone prototype embeds the current shared kernel', () => {
  const output = execFileSync(process.execPath, ['kernel/build.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.match(output, /in sync/);
});

test('Electron homepage imports the shared kernel instead of its inline copy', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const appHtml = replaceKernelBlock(html, "import { Kernel } from 'si-core-demo://prototype/kernel/si-kernel.js';");

  assert.match(appHtml, /import \{ Kernel \} from 'si-core-demo:\/\/prototype\/kernel\/si-kernel\.js';/);
  assert.doesNotMatch(appHtml, /function fnv1a/);
});
