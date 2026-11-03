import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { KERNEL_BLOCK_START, KERNEL_BLOCK_END, replaceKernelBlock } = require('./document.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'index.html');
const kernelPath = path.join(root, 'kernel', 'si-kernel.js');
const checkOnly = process.argv.includes('--check');

const [html, kernel] = await Promise.all([
  readFile(htmlPath, 'utf8'),
  readFile(kernelPath, 'utf8')
]);
const inlineKernel = kernel
  .replace(/^export\s+/gm, '')
  .trimEnd();
const generatedBlock = `${KERNEL_BLOCK_START}\n${inlineKernel}\n${KERNEL_BLOCK_END}`;
const generatedHtml = replaceKernelBlock(html, generatedBlock);

if (generatedHtml === html) {
  console.log('Standalone SI Core kernel is in sync with kernel/si-kernel.js.');
} else if (checkOnly) {
  console.error('Standalone SI Core kernel is out of sync. Run `npm run build:kernel`.');
  process.exitCode = 1;
} else {
  await writeFile(htmlPath, generatedHtml);
  console.log('Updated the standalone SI Core kernel from kernel/si-kernel.js.');
}
