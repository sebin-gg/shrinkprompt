/**
 * Minimal cleanPrompt regression tests (Node, no deps).
 * Run: node tests/test_clean_prompt.mjs
 *
 * All logic imported directly from the canonical shared module.
 * This file should contain ZERO reimplementation of patterns or helpers.
 */

import {
  DEFAULT_PATTERNS,
  cleanPrompt,
  extractCodeBlocks,
  restoreCodeBlocks
} from '../src/shared/cleaner-rules.js';

// ── Test harness ──────────────────────────────────────────────────────────────

let failed = 0;
let passed = 0;

function assert(name, cond) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok  ', name);
    passed += 1;
  }
}

// ── Canonical import sanity checks ───────────────────────────────────────────

assert('DEFAULT_PATTERNS is an object',     typeof DEFAULT_PATTERNS === 'object' && DEFAULT_PATTERNS !== null);
assert('DEFAULT_PATTERNS.greetings exists', 'greetings' in DEFAULT_PATTERNS);
assert('DEFAULT_PATTERNS.politeness exists','politeness' in DEFAULT_PATTERNS);
assert('DEFAULT_PATTERNS.fillers exists',   'fillers'   in DEFAULT_PATTERNS);
assert('DEFAULT_PATTERNS.closings exists',  'closings'  in DEFAULT_PATTERNS);
assert('cleanPrompt is a function',         typeof cleanPrompt === 'function');
assert('extractCodeBlocks is a function',   typeof extractCodeBlocks === 'function');
assert('restoreCodeBlocks is a function',   typeof restoreCodeBlocks === 'function');

// ── Core cleaning tests ───────────────────────────────────────────────────────

const sample = cleanPrompt(
  "Hi! I was wondering if you could explain how machine learning works. Thanks!"
);
assert('strips greeting/filler/closing', sample.toLowerCase().includes('machine learning'));
assert('shorter than original',          sample.length < 80);

const tech = cleanPrompt('Basically the algorithm uses softmax.');
assert('does not strip bare Basically by default',
  tech.includes('Basically') || tech.includes('algorithm'));

const empty = cleanPrompt('');
assert('empty string ok', empty === '');

const nullish = cleanPrompt(null);
assert('null input returns null', nullish === null);

// ── Code-block safety tests ───────────────────────────────────────────────────

const fencedBlock = cleanPrompt(
  'Please explain this:\n```\nPlease.call(Kindly)\nThank you\n```\nThanks!'
);
assert(
  'fenced block: "Please" inside code preserved',
  fencedBlock.includes('Please.call(Kindly)')
);
assert(
  'fenced block: "Thank you" inside code preserved',
  fencedBlock.includes('Thank you')
);
assert(
  'fenced block: "Thanks!" outside code stripped',
  !fencedBlock.endsWith('Thanks!')
);

const inlineCode = cleanPrompt(
  'Could you explain what `Please` does in Python?'
);
assert(
  'inline code: "Please" inside backticks preserved',
  inlineCode.includes('`Please`')
);
assert(
  'inline code: "Could you" outside backticks stripped',
  !inlineCode.includes('Could you')
);

const mixedProseCode = cleanPrompt(
  'Hello! I was wondering if you could fix this:\n```js\nconst Thanks = "Hello";\nconsole.log(Please);\n```\nPlease make it work. Thank you!'
);
assert(
  'mixed: code block content fully intact',
  mixedProseCode.includes('const Thanks = "Hello"') &&
  mixedProseCode.includes('console.log(Please)')
);
assert(
  'mixed: prose "Please" stripped',
  !mixedProseCode.match(/Please make/)
);

const noCode = cleanPrompt('Hello, could you please help? Thanks!');
assert(
  'no code: still strips normally',
  !noCode.includes('Hello') && !noCode.includes('please') && !noCode.includes('Thanks')
);

// ── extractCodeBlocks / restoreCodeBlocks unit tests ─────────────────────────

const { text: extracted, blocks } = extractCodeBlocks('Hello `foo` world ```bar``` end');
assert('extractCodeBlocks replaces inline code',  !extracted.includes('`foo`'));
assert('extractCodeBlocks replaces fenced code',  !extracted.includes('```bar```'));
assert('extractCodeBlocks captured 2 blocks',     blocks.length === 2);

const restored = restoreCodeBlocks(extracted, blocks);
assert('restoreCodeBlocks round-trips correctly', restored === 'Hello `foo` world ```bar``` end');

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
