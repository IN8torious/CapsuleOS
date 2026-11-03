'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const CATEGORIES = ['structure', 'style', 'interaction', 'accessibility', 'performance', 'evidence'];
const MAX_LESSONS = 40;
const MAX_BYTES = 128 * 1024;
let writes = Promise.resolve();

function validLesson(item) {
  return item && /^[a-f0-9-]{36}$/i.test(item.id) && CATEGORIES.includes(item.category) &&
    typeof item.text === 'string' && item.text.trim() && item.text.length <= 600 &&
    typeof item.sourceName === 'string' && item.sourceName.length > 0 && item.sourceName.length <= 160 &&
    /^[a-f0-9]{64}$/.test(item.sourceSha256) &&
    typeof item.reviewer === 'string' && item.reviewer.length > 0 && item.reviewer.length <= 80 &&
    Number.isSafeInteger(item.approvedAt) && Array.isArray(item.citations) &&
    item.citations.length > 0 && item.citations.length <= 24 &&
    item.citations.every(c => c && typeof c.path === 'string' && c.path.length > 0 && c.path.length <= 240 &&
      Number.isSafeInteger(c.lineStart) && c.lineStart > 0 &&
      Number.isSafeInteger(c.lineEnd) && c.lineEnd >= c.lineStart && c.lineEnd - c.lineStart <= 40);
}

async function readLessons(file) {
  let bytes;
  try { bytes = await fs.readFile(file); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Unable to read approved learning: ${error.message}`);
  }
  if (bytes.length > MAX_BYTES) throw new Error('Approved learning exceeds its storage limit.');
  let doc;
  try { doc = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Approved learning is malformed. The library was not changed.'); }
  if (doc.version !== 1 || !Array.isArray(doc.lessons) || doc.lessons.length > MAX_LESSONS ||
      doc.lessons.some(item => !validLesson(item)) ||
      new Set(doc.lessons.map(item => item.id)).size !== doc.lessons.length) {
    throw new Error('Approved learning has an unsupported format. The library was not changed.');
  }
  return doc.lessons;
}

function changeLessons(file, change) {
  const task = writes.then(async () => {
    const updated = change(await readLessons(file));
    const bytes = Buffer.from(JSON.stringify({ version: 1, lessons: updated }, null, 2));
    if (bytes.length > MAX_BYTES) throw new Error('Approved learning exceeds its storage limit.');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, bytes, { flag: 'wx' });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
    return updated;
  });
  writes = task.catch(() => {});
  return task;
}

function approveLesson(file, lesson) {
  const item = { ...lesson, id: randomUUID(), approvedAt: Date.now() };
  if (!validLesson(item)) throw new Error('Provide a cited lesson, category and text of 1-600 characters.');
  return changeLessons(file, lessons => {
    if (lessons.some(l => l.sourceSha256 === item.sourceSha256 && l.text === item.text)) {
      throw new Error('This source lesson is already approved.');
    }
    if (lessons.length >= MAX_LESSONS) throw new Error('Learning library is full (40 lessons). Forget a lesson before adding more.');
    return [...lessons, item];
  });
}

function forgetLesson(file, id) {
  return changeLessons(file, lessons => {
    if (!lessons.some(item => item.id === id)) throw new Error('That lesson is no longer in the library.');
    return lessons.filter(item => item.id !== id);
  });
}

function lessonContext(lessons) {
  return lessons.slice(-8).map(item =>
    `[Approved reference ${item.id}; ${item.category}; ${item.sourceName}; SHA-256 ${item.sourceSha256}]\n${item.text}`
  ).join('\n\n').slice(0, 6500);
}

module.exports = { CATEGORIES, readLessons, approveLesson, forgetLesson, lessonContext };
