/**
 * @file tests/test_markdown_formatter.mjs
 * @description Unit tests for src/shared/markdown-formatter.js
 *
 * Tests cover:
 *   • toMarkdown()      — schema-aware formatter
 *   • objectToMarkdown()— generic formatter
 *   • capitalize()      — heading utility
 *   • Edge cases        — null, undefined, empty, nested, extra keys
 *
 * Run: node tests/test_markdown_formatter.mjs
 * (No external dependencies required.)
 */

import {
  toMarkdown,
  objectToMarkdown,
  capitalize
} from '../src/shared/markdown-formatter.js';

// -- Test harness --------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (!cond) {
    console.error('FAIL', name);
    failed++;
  } else {
    console.log('ok  ', name);
    passed++;
  }
}

function section(title) {
  console.log(`\n-- ${title} --`);
}

// -----------------------------------------------------------------------------
// capitalize()
// -----------------------------------------------------------------------------
section('capitalize()');

assert('capitalize: plain word',              capitalize('hello')           === 'Hello');
assert('capitalize: camelCase',               capitalize('myField')         === 'My Field');
assert('capitalize: snake_case',              capitalize('my_field')        === 'My field');
assert('capitalize: already capitalised',     capitalize('Hello')           === 'Hello');
assert('capitalize: empty string ? empty',    capitalize('')                === '');
assert('capitalize: null ? empty',            capitalize(null)              === '');
assert('capitalize: undefined ? empty',       capitalize(undefined)         === '');

// -----------------------------------------------------------------------------
// toMarkdown() — core contract
// -----------------------------------------------------------------------------
section('toMarkdown() — core contract');

const full = toMarkdown({
  objective:    'Explain transformer architecture',
  context:      'Interview tomorrow',
  requirements: ['Use simple language', 'Include examples'],
  constraints:  ['No advanced math'],
  reference:    'Attached code'
});

assert('full: starts with H1 Objective',   full.startsWith('# Objective'));
assert('full: contains objective text',    full.includes('Explain transformer architecture'));
assert('full: contains ## Context',        full.includes('## Context'));
assert('full: contains context text',      full.includes('Interview tomorrow'));
assert('full: contains ## Requirements',   full.includes('## Requirements'));
assert('full: requirements as bullets',    full.includes('- Use simple language'));
assert('full: contains ## Constraints',    full.includes('## Constraints'));
assert('full: constraints as bullets',     full.includes('- No advanced math'));
assert('full: contains ## Reference',      full.includes('## Reference'));
assert('full: reference text present',     full.includes('Attached code'));
assert('full: result is a string',         typeof full === 'string');
assert('full: no leading/trailing space',  full === full.trim());

// -----------------------------------------------------------------------------
// toMarkdown() — partial inputs (only some fields present)
// -----------------------------------------------------------------------------
section('toMarkdown() — partial inputs');

const objectiveOnly = toMarkdown({ objective: 'Just a goal' });
assert('partial: H1 present',              objectiveOnly.includes('# Objective'));
assert('partial: no ## Context heading',   !objectiveOnly.includes('## Context'));
assert('partial: no ## Requirements heading', !objectiveOnly.includes('## Requirements'));

const noObjective = toMarkdown({
  context: 'Some context',
  requirements: ['req1']
});
assert('no-objective: no H1',              !noObjective.includes('# Objective'));
assert('no-objective: ## Context present', noObjective.includes('## Context'));

// -----------------------------------------------------------------------------
// toMarkdown() — edge cases
// -----------------------------------------------------------------------------
section('toMarkdown() — edge cases');

assert('null input ? empty string',        toMarkdown(null)      === '');
assert('undefined input ? empty string',   toMarkdown(undefined) === '');
assert('array input ? empty string',       toMarkdown([])        === '');
assert('empty object ? empty string',      toMarkdown({})        === '');

const nullFields = toMarkdown({
  objective:    null,
  context:      undefined,
  requirements: [],
  constraints:  null,
  reference:    ''
});
assert('all-null/empty fields ? empty string', nullFields === '');

const trimmed = toMarkdown({ objective: '  ' });
assert('whitespace-only objective skipped', trimmed === '');

// -----------------------------------------------------------------------------
// toMarkdown() — extra / unknown keys are forwarded
// -----------------------------------------------------------------------------
section('toMarkdown() — extra keys');

const extra = toMarkdown({
  objective: 'Main goal',
  tone: 'Formal',
  audience: ['developers', 'managers']
});
assert('extra: known field still appears',  extra.includes('# Objective'));
assert('extra: unknown string key rendered', extra.includes('## Tone'));
assert('extra: unknown string value present', extra.includes('Formal'));
assert('extra: unknown array key rendered',  extra.includes('## Audience'));
assert('extra: unknown array as bullets',    extra.includes('- developers'));

// -----------------------------------------------------------------------------
// objectToMarkdown() — core contract
// -----------------------------------------------------------------------------
section('objectToMarkdown() — core contract');

const generic = objectToMarkdown({
  summary: 'Quick overview',
  tags: ['ai', 'llm'],
  priority: 'high'
});
assert('generic: summary heading',         generic.includes('## Summary'));
assert('generic: summary value',           generic.includes('Quick overview'));
assert('generic: tags heading',            generic.includes('## Tags'));
assert('generic: tags as bullets',         generic.includes('- ai') && generic.includes('- llm'));
assert('generic: priority heading',        generic.includes('## Priority'));
assert('generic: priority value',          generic.includes('high'));
assert('generic: is a string',             typeof generic === 'string');

// -----------------------------------------------------------------------------
// objectToMarkdown() — camelCase / snake_case key humanisation
// -----------------------------------------------------------------------------
section('objectToMarkdown() — key humanisation');

const camel = objectToMarkdown({ myCustomField: 'value1' });
assert('camelCase key ? "My Custom Field"', camel.includes('## My Custom Field'));

const snake = objectToMarkdown({ my_custom_field: 'value2' });
assert('snake_case key ? "My custom field"', snake.includes('## My custom field'));

// -----------------------------------------------------------------------------
// objectToMarkdown() — nested objects produce deeper headings
// -----------------------------------------------------------------------------
section('objectToMarkdown() — nested objects');

const nested = objectToMarkdown({
  meta: { author: 'Alice', version: '1.0' }
});
assert('nested: outer key ## Meta',        nested.includes('## Meta'));
assert('nested: inner key ### Author',     nested.includes('### Author'));
assert('nested: inner value present',      nested.includes('Alice'));

// -----------------------------------------------------------------------------
// objectToMarkdown() — edge cases
// -----------------------------------------------------------------------------
section('objectToMarkdown() — edge cases');

assert('null ? empty string',              objectToMarkdown(null)      === '');
assert('undefined ? empty string',         objectToMarkdown(undefined) === '');
assert('array ? empty string',             objectToMarkdown([])        === '');
assert('empty object ? empty/falsy',       !objectToMarkdown({}).trim());

const skipsNull = objectToMarkdown({ present: 'yes', missing: null, empty: '' });
assert('skips null/empty values',          !skipsNull.includes('Missing') && skipsNull.includes('Present'));

const boolNum = objectToMarkdown({ flag: true, count: 42 });
assert('renders boolean',                  boolNum.includes('true'));
assert('renders number',                   boolNum.includes('42'));

// -----------------------------------------------------------------------------
// Heading depth cap (max H6)
// -----------------------------------------------------------------------------
section('objectToMarkdown() — heading depth cap');

const deep = objectToMarkdown({ a: 'x' }, 6);
assert('depth 6 ? ###### heading',         deep.includes('###### A'));

const deeper = objectToMarkdown({ b: 'y' }, 10);
assert('depth > 6 still capped at ######', deeper.includes('###### B'));

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
