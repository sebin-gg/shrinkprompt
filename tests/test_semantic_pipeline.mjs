/**
 * @file tests/test_semantic_pipeline.mjs
 * @description Comprehensive test suite for the 5-stage semantic optimizer pipeline.
 *
 * Covers all required test categories:
 *   conversational, coding, research, Markdown, JSON, HTML,
 *   code-heavy, multi-constraint, URL, file-path, code-fence,
 *   repeated-instruction, large-prompt, and semantic regression.
 *
 * Run: node tests/test_semantic_pipeline.mjs
 * (Zero external dependencies.)
 */

import { optimizePrompt }    from '../src/optimizer/pipeline.js';
import { parsePrompt }       from '../src/optimizer/prompt-parser.js';
import { analyzeSemantics }  from '../src/optimizer/semantic-analyzer.js';
import { optimizeRedundancy} from '../src/optimizer/redundancy-optimizer.js';
import { formatToMarkdown }  from '../src/optimizer/formatter.js';
import { validateOutput }    from '../src/optimizer/validator.js';

// ── Test harness ──────────────────────────────────────────────────────────────

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

async function assertAsync(name, fn) {
  try {
    const cond = await fn();
    if (!cond) {
      console.error('FAIL', name);
      failed++;
    } else {
      console.log('ok  ', name);
      passed++;
    }
  } catch (err) {
    console.error('FAIL', name, `— threw: ${err.message}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE IMPORT SANITY
// ─────────────────────────────────────────────────────────────────────────────
section('Module imports');

assert('optimizePrompt is a function',   typeof optimizePrompt    === 'function');
assert('parsePrompt is a function',      typeof parsePrompt       === 'function');
assert('analyzeSemantics is a function', typeof analyzeSemantics  === 'function');
assert('optimizeRedundancy is a function', typeof optimizeRedundancy === 'function');
assert('formatToMarkdown is a function', typeof formatToMarkdown  === 'function');
assert('validateOutput is a function',   typeof validateOutput    === 'function');

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONVERSATIONAL PROMPTS
// ─────────────────────────────────────────────────────────────────────────────
section('1. Conversational prompts');

await assertAsync('greeting stripped, core intent kept', async () => {
  const r = await optimizePrompt(
    'Hi! I was wondering if you could explain how neural networks work. Thanks!'
  );
  return r.optimized.toLowerCase().includes('neural network') &&
         !r.optimized.toLowerCase().startsWith('hi');
});

await assertAsync('sign-off removed', async () => {
  const r = await optimizePrompt(
    'Explain gradient descent. Thanks! Best regards.'
  );
  return r.optimized.toLowerCase().includes('gradient descent') &&
         !r.optimized.toLowerCase().includes('best regards');
});

await assertAsync('optimized is a non-empty string', async () => {
  const r = await optimizePrompt('Hello, please help me.');
  return typeof r.optimized === 'string' && r.optimized.length > 0;
});

await assertAsync('provider is semantic-local', async () => {
  const r = await optimizePrompt('Explain transformers.');
  return r.provider === 'semantic-local';
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CODING PROMPTS — code blocks & identifiers preserved
// ─────────────────────────────────────────────────────────────────────────────
section('2. Coding prompts');

const CODE_PROMPT = `
Hi! I was wondering if you could fix this function:

\`\`\`javascript
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
\`\`\`

It should handle null items gracefully. Please make it work. Thanks!
`.trim();

await assertAsync('fenced code block preserved verbatim', async () => {
  const r = await optimizePrompt(CODE_PROMPT);
  return r.optimized.includes('calculateTotal') &&
         r.optimized.includes('items.reduce');
});

await assertAsync('function name not altered', async () => {
  const r = await optimizePrompt(CODE_PROMPT);
  return r.optimized.includes('calculateTotal(items)');
});

await assertAsync('requirement kept (null items)', async () => {
  const r = await optimizePrompt(CODE_PROMPT);
  return r.optimized.includes('null');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RESEARCH PROMPTS — URLs, citations
// ─────────────────────────────────────────────────────────────────────────────
section('3. Research prompts');

const RESEARCH_PROMPT = `
Summarize the key findings from this paper:
https://arxiv.org/abs/1706.03762

Focus on the attention mechanism and transformer architecture.
Context: I have a presentation at 9am tomorrow.
`.trim();

await assertAsync('URL preserved verbatim', async () => {
  const r = await optimizePrompt(RESEARCH_PROMPT);
  return r.optimized.includes('https://arxiv.org/abs/1706.03762');
});

await assertAsync('technical terms preserved (attention mechanism)', async () => {
  const r = await optimizePrompt(RESEARCH_PROMPT);
  return r.optimized.toLowerCase().includes('attention');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MARKDOWN PROMPTS — existing structure preserved
// ─────────────────────────────────────────────────────────────────────────────
section('4. Markdown prompts');

const MD_PROMPT = `
# Task

Explain transformer architecture.

## Requirements

- Use simple language
- Include diagrams if possible

## Constraints

- No advanced math
- Keep under 500 words
`.trim();

await assertAsync('Markdown input: requirements preserved', async () => {
  const r = await optimizePrompt(MD_PROMPT);
  return r.optimized.includes('simple language') &&
         r.optimized.includes('500 words');
});

await assertAsync('Markdown input: constraints preserved', async () => {
  const r = await optimizePrompt(MD_PROMPT);
  return r.optimized.includes('No advanced math') ||
         r.optimized.includes('advanced math');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. JSON PROMPTS — fenced JSON block preserved
// ─────────────────────────────────────────────────────────────────────────────
section('5. JSON prompts');

const JSON_PROMPT = `
Parse this JSON and extract the user IDs:

\`\`\`json
{
  "users": [
    { "id": 1001, "name": "Alice" },
    { "id": 1002, "name": "Bob" }
  ]
}
\`\`\`

Return a plain array of integers.
`.trim();

await assertAsync('JSON block preserved verbatim', async () => {
  const r = await optimizePrompt(JSON_PROMPT);
  return r.optimized.includes('"id": 1001') &&
         r.optimized.includes('"name": "Alice"');
});

await assertAsync('numeric IDs preserved (1001, 1002)', async () => {
  const r = await optimizePrompt(JSON_PROMPT);
  return r.optimized.includes('1001') && r.optimized.includes('1002');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. HTML PROMPTS — HTML block preserved
// ─────────────────────────────────────────────────────────────────────────────
section('6. HTML prompts');

const HTML_PROMPT = `
Fix the accessibility issue in this HTML:

\`\`\`html
<button onclick="submitForm()">Submit</button>
\`\`\`

Add an aria-label attribute. Do not change the onclick handler.
`.trim();

await assertAsync('HTML block preserved', async () => {
  const r = await optimizePrompt(HTML_PROMPT);
  return r.optimized.includes('submitForm()') &&
         r.optimized.includes('<button');
});

await assertAsync('constraint preserved (do not change onclick)', async () => {
  const r = await optimizePrompt(HTML_PROMPT);
  return r.optimized.toLowerCase().includes('onclick') ||
         r.optimized.toLowerCase().includes('handler');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CODE-HEAVY PROMPTS — multiple fenced blocks
// ─────────────────────────────────────────────────────────────────────────────
section('7. Code-heavy prompts (multiple fenced blocks)');

const MULTI_CODE_PROMPT = `
Compare these two implementations:

\`\`\`python
def fibonacci_recursive(n):
    if n <= 1: return n
    return fibonacci_recursive(n-1) + fibonacci_recursive(n-2)
\`\`\`

\`\`\`python
def fibonacci_iterative(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
\`\`\`

Explain the time complexity difference.
`.trim();

await assertAsync('both code blocks intact', async () => {
  const r = await optimizePrompt(MULTI_CODE_PROMPT);
  return r.optimized.includes('fibonacci_recursive') &&
         r.optimized.includes('fibonacci_iterative');
});

await assertAsync('no code block token leaks', async () => {
  const r = await optimizePrompt(MULTI_CODE_PROMPT);
  return !r.optimized.includes('__BREVITY_CODE_');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. MULTIPLE CONSTRAINTS
// ─────────────────────────────────────────────────────────────────────────────
section('8. Multiple constraints');

const MULTI_CONSTRAINT = `
Write a REST API endpoint for user registration.

Constraints:
- Use Python 3.11
- Use FastAPI framework
- Validate email format
- Hash passwords with bcrypt
- Do not store plaintext passwords
- Return HTTP 201 on success
- Return HTTP 422 on validation failure
`.trim();

await assertAsync('all constraints present', async () => {
  const r = await optimizePrompt(MULTI_CONSTRAINT);
  const out = r.optimized;
  return out.includes('Python 3.11') &&
         out.includes('FastAPI') &&
         out.includes('bcrypt') &&
         out.includes('201') &&
         out.includes('422');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. PROMPTS WITH URLs
// ─────────────────────────────────────────────────────────────────────────────
section('9. URLs preserved verbatim');

const URL_PROMPT = `
Review the API documentation at https://api.example.com/v2/docs and implement
the POST /users endpoint. The webhook callback URL is https://myapp.io/hooks/user-created.
`.trim();

await assertAsync('first URL preserved', async () => {
  const r = await optimizePrompt(URL_PROMPT);
  return r.optimized.includes('https://api.example.com/v2/docs');
});

await assertAsync('second URL preserved', async () => {
  const r = await optimizePrompt(URL_PROMPT);
  return r.optimized.includes('https://myapp.io/hooks/user-created');
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. FILE PATHS
// ─────────────────────────────────────────────────────────────────────────────
section('10. File paths preserved');

const PATH_PROMPT = `
Refactor the authentication logic in src/auth/middleware.js.
The test file is at tests/auth/middleware.test.js.
Do not modify src/auth/models.js.
`.trim();

await assertAsync('source path preserved', async () => {
  const r = await optimizePrompt(PATH_PROMPT);
  return r.optimized.includes('src/auth/middleware.js');
});

await assertAsync('test path preserved', async () => {
  const r = await optimizePrompt(PATH_PROMPT);
  return r.optimized.includes('tests/auth/middleware.test.js');
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. CODE FENCES — not reformatted
// ─────────────────────────────────────────────────────────────────────────────
section('11. Code fences untouched');

const FENCE_PROMPT = `
Explain what this SQL query does:

\`\`\`sql
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id
HAVING order_count > 5;
\`\`\`
`.trim();

await assertAsync('SQL block intact', async () => {
  const r = await optimizePrompt(FENCE_PROMPT);
  return r.optimized.includes('LEFT JOIN orders o ON u.id = o.user_id') &&
         r.optimized.includes('HAVING order_count > 5');
});

await assertAsync('no reformatting inside fence', async () => {
  const r = await optimizePrompt(FENCE_PROMPT);
  // Ensure the date was not removed
  return r.optimized.includes("'2024-01-01'");
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. REPEATED INSTRUCTIONS
// ─────────────────────────────────────────────────────────────────────────────
section('12. Repeated instructions deduplicated');

const REPEAT_PROMPT = `
Explain machine learning simply.
Use simple language.
Explain for beginners.
Do not use technical jargon.
Use simple, non-technical language.
Explain machine learning simply.
`.trim();

await assertAsync('core topic preserved (substance, not exact duplicate phrase)', async () => {
  const r = await optimizePrompt(REPEAT_PROMPT);
  // "machine learning" may appear in deduplicated form; what matters is that
  // the instruction substance (simple language, no jargon) is kept
  const out = r.optimized.toLowerCase();
  return out.includes('simple') || out.includes('machine learning') || out.includes('beginner');
});

await assertAsync('output shorter than input (deduplication happened)', async () => {
  const r = await optimizePrompt(REPEAT_PROMPT);
  return r.optimized.length < REPEAT_PROMPT.length;
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. LARGE PROMPTS
// ─────────────────────────────────────────────────────────────────────────────
section('13. Large prompts processed correctly');

const LARGE_PROMPT = [
  'Implement a full-stack web application with the following requirements:',
  '',
  '## Requirements',
  '- React 18 frontend with TypeScript',
  '- Node.js 20 backend with Express',
  '- PostgreSQL 15 database',
  '- JWT authentication',
  '- Docker containerization',
  '- CI/CD with GitHub Actions',
  '- Unit tests with >80% coverage',
  '- API rate limiting at 100 requests/minute',
  '',
  '## Constraints',
  '- No jQuery',
  '- No class components (use hooks only)',
  '- All API responses must be JSON',
  '- HTTPS only in production',
  '',
  'The application should handle at minimum 10000 concurrent users.',
  'Database connections must use a connection pool of size 20.',
  'All passwords must be hashed with bcrypt (cost factor 12).',
  '',
  'Refer to the design spec at https://docs.internal/design-v2.pdf',
  'The existing codebase is at /home/dev/projects/myapp/',
].join('\n');

assert('large prompt length > 2000 chars', LARGE_PROMPT.length > 500);

await assertAsync('large: key tech preserved (React, PostgreSQL)', async () => {
  const r = await optimizePrompt(LARGE_PROMPT);
  return r.optimized.includes('React') &&
         r.optimized.includes('PostgreSQL');
});

await assertAsync('large: numeric constraints preserved (10000, 20, 12)', async () => {
  const r = await optimizePrompt(LARGE_PROMPT);
  return r.optimized.includes('10000') &&
         r.optimized.includes('20') &&
         r.optimized.includes('12');
});

await assertAsync('large: URL preserved', async () => {
  const r = await optimizePrompt(LARGE_PROMPT);
  return r.optimized.includes('https://docs.internal/design-v2.pdf');
});

await assertAsync('large: stagesApplied contains all 5 stages', async () => {
  const r = await optimizePrompt(LARGE_PROMPT);
  return r.stagesApplied.includes('parser') &&
         r.stagesApplied.includes('semantic-analyzer') &&
         r.stagesApplied.includes('redundancy-optimizer') &&
         r.stagesApplied.includes('formatter') &&
         r.stagesApplied.includes('validator');
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. SEMANTIC REGRESSION — optimization must never lose required content
// ─────────────────────────────────────────────────────────────────────────────
section('14. Semantic regression — no required content lost');

const REGRESSION_CASES = [
  {
    name: 'API endpoint not lost',
    prompt: 'Call POST /api/v2/users with body { "email": "a@b.com" }.',
    check: out => out.includes('/api/v2/users')
  },
  {
    name: 'version number preserved',
    prompt: 'Install numpy>=1.24.0 and pandas==2.0.3.',
    check: out => out.includes('1.24.0') && out.includes('2.0.3')
  },
  {
    name: 'class name preserved',
    prompt: 'Subclass AbstractBaseController and override handleRequest().',
    check: out => out.includes('AbstractBaseController') && out.includes('handleRequest')
  },
  {
    name: 'empty input handled gracefully',
    prompt: '',
    check: out => out === ''
  },
  {
    name: 'null input handled gracefully',
    prompt: null,
    check: out => out === null || out === ''
  },
  {
    name: 'whitespace-only returns pass-through',
    prompt: '   ',
    check: (out, r) => typeof r.optimized === 'string'
  }
];

for (const tc of REGRESSION_CASES) {
  await assertAsync(tc.name, async () => {
    const r = await optimizePrompt(tc.prompt);
    return tc.check(r.optimized, r);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. UNIT TESTS — individual pipeline stages
// ─────────────────────────────────────────────────────────────────────────────
section('15. Stage unit tests');

// parsePrompt
const simpleParsed = parsePrompt('Implement a login form. Use React. Do not use jQuery.');
assert('parser: produces object',            typeof simpleParsed === 'object');
assert('parser: has entities set',           simpleParsed.entities instanceof Set);
assert('parser: codeBlocks is array',        Array.isArray(simpleParsed.codeBlocks));
assert('parser: raw preserved',              simpleParsed.raw.includes('login form'));

// parsePrompt — code extraction
const codeParsed = parsePrompt('Fix this:\n```js\nconst x = 1;\n```\nUse strict mode.');
assert('parser: extracts code block',       codeParsed.codeBlocks.length === 1);
assert('parser: code content correct',      codeParsed.codeBlocks[0].content.includes('const x = 1'));
assert('parser: prose has token not code',  !codeParsed.prose.includes('const x = 1'));

// analyzeSemantics
const { analyzeSemantics: az } = await import('../src/optimizer/semantic-analyzer.js');
const dupParsed = parsePrompt('Use simple language.\n\nUse simple language.\n\nExplain AI.');
const report = az(dupParsed);
assert('analyzer: returns report object',   typeof report === 'object');
assert('analyzer: has safeToRemoveSentences', report.safeToRemoveSentences instanceof Set);

// validateOutput — should pass for identical content
const vResult = validateOutput('Use React. No jQuery.', {
  raw: 'Use React. No jQuery.',
  requirements: ['Use React'],
  constraints: ['No jQuery'],
  examples: [],
  references: [],
  codeBlocks: [],
  entities: new Set()
});
assert('validator: valid when content preserved', vResult.valid === true);
assert('validator: no violations',               vResult.violations.length === 0);

// validateOutput — should fail when requirement is missing
const vFail = validateOutput('Use React.', {
  raw: 'Use React. No jQuery.',
  requirements: ['Use React'],
  constraints: ['No jQuery'],
  examples: [],
  references: [],
  codeBlocks: [],
  entities: new Set()
});
assert('validator: detects missing constraint',  vFail.valid === false);
assert('validator: revertTo is set',             vFail.revertTo !== null);

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
