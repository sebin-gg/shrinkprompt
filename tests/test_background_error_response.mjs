/**
 * Ensures the cleanPrompt handler always answers the asynchronous message.
 * Run: node tests/test_background_error_response.mjs
 */

import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/background.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');
const handlerStart = source.indexOf('async function handleCleanPrompt');
const catchStart = source.indexOf("} catch (error) {", handlerStart);
const handlerEnd = source.indexOf('\n}\n\n// ', catchStart);

if (handlerStart === -1 || catchStart === -1 || handlerEnd === -1) {
  throw new Error('Unable to locate handleCleanPrompt catch block.');
}

const catchBlock = source.slice(catchStart, handlerEnd);
const expected = 'sendResponse({ original: text, shortened: text, cleaned: false });';

if (!catchBlock.includes(expected)) {
  throw new Error('handleCleanPrompt must reply with the original text after an error.');
}

console.log('ok  cleanPrompt error path replies with pass-through text');
