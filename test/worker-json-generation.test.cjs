'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

async function fixture(t) {
  const mock = `
    export const env = {};
    export class InterruptableStoppingCriteria { interrupt() { this.stopped = true; } }
    export class TextStreamer { constructor(tokenizer, options) { Object.assign(this, options); } }
    export async function pipeline() {
      const generator = async (messages, options) => {
        if (!options.streamer) return [{generated_text:'Ordinary chat unchanged'}];
        let text = '';
        for (const chunk of JSON.parse(messages.at(-1).content)) {
          text += chunk;
          options.streamer.callback_function(chunk);
          if (options.stopping_criteria.stopped) break;
        }
        return [{generated_text:[{role:'assistant',content:text}]}];
      };
      generator.tokenizer = {};
      return generator;
    }`;
  const mockUrl = `data:text/javascript;base64,${Buffer.from(mock).toString('base64')}`;
  const source = (await fs.readFile(path.join(__dirname, '..', 'assistant', 'worker.mjs'), 'utf8'))
    .replace("'@huggingface/transformers'", JSON.stringify(mockUrl));
  const worker = new Worker(new URL(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`), {
    workerData: { modelPath: path.join(__dirname, 'fixture-model'), userDataPath: __dirname, modelId: 'fixture', dtype: 'q4' }
  });
  t.after(() => worker.terminate());
  const ready = await new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
  assert.equal(ready.type, 'ready');
  return async (chunks, mode = 'scene-html-edit') => {
    const response = new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
    worker.postMessage({ type: 'generate', requestId: 'fixture', mode, prompt: JSON.stringify(chunks) });
    const result = await response;
    assert.equal(result.type, 'response');
    return result.text;
  };
}

test('JSON generation stops at the complete document, not commentary or an inner closing brace', async t => {
  const generate = await fixture(t);
  const parts = ['{"summary":"literal } is not the end","edits":[', '{"find":"red","replace":"blue"}', ']}', '\nNote: do not generate this.'];
  assert.equal(await generate(parts), parts.slice(0, 3).join(''));
  const { applyHtmlEdit } = await import('../app/scene-html-edit.js');
  assert.equal(applyHtmlEdit('<p>red</p>', await generate(parts)).html, '<p>blue</p>');
});

test('fenced output must close its fence; incomplete and schema-invalid JSON still fail host validation', async t => {
  const generate = await fixture(t);
  const { applyHtmlEdit } = await import('../app/scene-html-edit.js');
  const valid = '{"summary":"Blue","edits":[{"find":"red","replace":"blue"}]}';
  const fenced = await generate(['```json\n', valid, '\n```', '\nDo not generate this.']);
  assert.equal(fenced, `\`\`\`json\n${valid}\n\`\`\``);
  assert.equal(applyHtmlEdit('<p>red</p>', fenced).html, '<p>blue</p>');
  assert.throws(() => applyHtmlEdit('<p>red</p>', '{"summary":"incomplete"'), /JSON/);
  assert.throws(() => applyHtmlEdit('<p>red</p>', '{}'), /invalid/);
});

test('oversized structured output stops and remains an explicit validation error; chat is unchanged', async t => {
  const generate = await fixture(t);
  const oversized = '{"summary":"' + 'x'.repeat(24000);
  const output = await generate([oversized, 'never generated']);
  assert.equal(output, oversized);
  const { applyHtmlEdit } = await import('../app/scene-html-edit.js');
  assert.throws(() => applyHtmlEdit('<p>red</p>', output), /too large/);
  assert.equal(await generate([], 'chat'), 'Ordinary chat unchanged');
});
