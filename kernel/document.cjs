const KERNEL_BLOCK_START = '/* === SI KERNEL — inlined by kernel/build.mjs · DO NOT EDIT HERE · source: kernel/si-kernel.js === */';
const KERNEL_BLOCK_END = '/* === END SI KERNEL === */';

function replaceKernelBlock(document, replacement) {
  const start = document.indexOf(KERNEL_BLOCK_START);
  const end = document.indexOf(KERNEL_BLOCK_END, start + KERNEL_BLOCK_START.length);
  if (
    start < 0
    || end < 0
    || document.indexOf(KERNEL_BLOCK_START, start + KERNEL_BLOCK_START.length) >= 0
    || document.indexOf(KERNEL_BLOCK_END, end + KERNEL_BLOCK_END.length) >= 0
  ) {
    throw new Error('The SI Core prototype must contain exactly one replaceable kernel block.');
  }

  return document.slice(0, start)
    + replacement
    + document.slice(end + KERNEL_BLOCK_END.length);
}

module.exports = { KERNEL_BLOCK_START, KERNEL_BLOCK_END, replaceKernelBlock };
