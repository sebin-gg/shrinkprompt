import fs from 'fs';

const content = fs.readFileSync('src/background.js', 'utf8');

// Use a simple, robust split or search
const classStartIdx = content.indexOf('class BrevityTokenizer');
const classEndIdx = content.indexOf('const tokenizer = new BrevityTokenizer();');

if (classStartIdx === -1 || classEndIdx === -1) {
  console.error('Failed to locate class indexes in background.js');
  process.exit(1);
}

const classCode = content.slice(classStartIdx, classEndIdx);

const evalFn = new Function('globalThis', classCode + '; return new BrevityTokenizer();');
const tokenizer = evalFn(globalThis);

// Injection of the BPE rules update
tokenizer._jsBpeEstimate = function(text) {
  const regex = /'s|'t|'re|'ve|'m|'ll|'d|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}{1,3}|[^\s\p{L}\p{N}]+|[\r\n]+|\s+(?!\S)|\s+/giu;
  const matches = text.match(regex);
  if (!matches) return 0;

  let tokenCount = 0;
  for (const match of matches) {
    const len = match.length;
    if (len === 0) continue;

    // Rule 1: Contractions
    if (/^'s|^'t|^'re|^'ve|^'m|^'ll|^'d$/i.test(match)) {
      tokenCount += 1;
      continue;
    }

    // Rule 2: Standalone symbols / punctuation
    if (/^[^\s\p{L}\p{N}]+$/u.test(match)) {
      tokenCount += len;
      continue;
    }

    // Rule 3: Words (with optional leading space)
    if (/^\s*\p{L}+$/u.test(match)) {
      const cleanLen = match.trim().length;
      if (cleanLen <= 10) {
        tokenCount += 1;
      } else {
        tokenCount += Math.ceil(cleanLen / 8);
      }
      continue;
    }

    // Rule 4: Numbers (with optional leading space)
    if (/^\s*\p{N}+$/u.test(match)) {
      const cleanLen = match.trim().length;
      tokenCount += Math.ceil(cleanLen / 3);
      continue;
    }

    // Fallback: 4 chars/token heuristic
    tokenCount += Math.max(1, Math.round(len / 4));
  }

  return tokenCount;
};

const tests = [
  { text: 'Hello world', expectedMin: 2, expectedMax: 2 },
  { text: 'Hello! I was wondering if you could please explain how neural networks work. Thanks!', expectedMin: 16, expectedMax: 20 },
  { text: '123 4567 89', expectedMin: 4, expectedMax: 6 },
  { text: 'const x = y + z;', expectedMin: 7, expectedMax: 10 }
];

console.log('=== Tokenizer Accuracy Sanity Check ===');
let failed = false;
tests.forEach(t => {
  const count = tokenizer.countTokens(t.text);
  const ok = count >= t.expectedMin && count <= t.expectedMax;
  console.log(`Text: "${t.text.slice(0, 50)}"`);
  console.log(`  Count: ${count} (Expected: ${t.expectedMin}-${t.expectedMax}) -> ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) failed = true;
});

if (failed) {
  process.exit(1);
} else {
  console.log('All tokenizer accuracy sanity checks passed!');
}
