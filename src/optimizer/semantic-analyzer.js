/**
 * @file src/optimizer/semantic-analyzer.js
 * @description Stage 2 — Semantic Analyzer
 *
 * Inspects a ParsedPrompt and produces a SemanticReport that identifies:
 *   - duplicate constraints / requirements / examples
 *   - conversational filler sentences
 *   - conflicting constraints (flagged but never auto-removed)
 *
 * SAFETY INVARIANT: Nothing in constraints[], requirements[], examples[], or
 * references[] is ever marked as safe to remove. Only greetings, sign-offs,
 * and byte-for-byte duplicate sentences are candidates.
 *
 * IMPORTANT: No chrome.* calls — runs in Node (tests), service workers, and pages.
 */

// ─────────────────────────────────────────────────────────────────────────────
// FILLER DETECTION
// Patterns that match conversational noise safe to remove.
// Intentionally conservative — phrase forms only, never bare keywords.
// ─────────────────────────────────────────────────────────────────────────────

const FILLER_PATTERNS = [
  /^(hi|hello|hey|greetings)[,\s!]*/i,
  /\b(thanks|thank you|i appreciate it|have a great day|best regards|cheers)\s*[!.]*\s*$/i,
  /\b(I was wondering if|I'?m looking for|Just wanted to ask|I'?m trying to|I just wanted to)\b/i,
  /\b(I hope (you('re| are) doing well|this finds you well))\b/i,
  /\b(Feel free to (ask|let me know)|Let me know if you (have|need))\b/i,
];

/**
 * Tests whether a sentence is conversational filler.
 * @param {string} sentence
 * @returns {boolean}
 */
function isFiller(sentence) {
  const s = sentence.trim();
  if (!s) return false;
  return FILLER_PATTERNS.some(re => re.test(s));
}

// ─────────────────────────────────────────────────────────────────────────────
// GREETING / SIGN-OFF DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const GREETING_RE = /^(hi|hello|hey|greetings|good (morning|afternoon|evening))[,\s!.]*$/i;
const SIGNOFF_RE  = /^(thanks|thank you|i appreciate (it|your help)|best(?: regards)?|cheers|regards)[,\s!.]*$/i;

function isGreeting(sentence) { return GREETING_RE.test(sentence.trim()); }
function isSignOff(sentence)  { return SIGNOFF_RE.test(sentence.trim()); }

// ─────────────────────────────────────────────────────────────────────────────
// DUPLICATE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a string for duplicate comparison:
 * lowercases, collapses whitespace, strips trailing punctuation.
 * @param {string} s
 * @returns {string}
 */
function normalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;]+$/, '');
}

/**
 * Given an array of strings, returns a Map of normalized form → [original strings]
 * for any group that has more than one member.
 *
 * @param {string[]} items
 * @returns {Map<string, string[]>}
 */
function findDuplicates(items) {
  const seen = new Map();
  for (const item of items) {
    const key = normalize(item);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(item);
  }
  const dupes = new Map();
  for (const [key, group] of seen) {
    if (group.length > 1) dupes.set(key, group);
  }
  return dupes;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICTING CONSTRAINT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/** Simple antonym pairs that might indicate conflicting constraints. */
const ANTONYM_PAIRS = [
  [/\bbrief\b/i,   /\bdetailed\b/i],
  [/\bshort\b/i,   /\blong\b/i],
  [/\bformal\b/i,  /\binformal\b/i],
  [/\bsimple\b/i,  /\badvanced\b/i],
  [/\bno code\b/i, /\bshow code\b/i],
];

/**
 * Returns pairs of constraint strings that appear to conflict.
 * NEVER removes them — just flags for user awareness.
 *
 * @param {string[]} constraints
 * @returns {Array<[string, string]>}
 */
function findConflictingConstraints(constraints) {
  const conflicts = [];
  for (const [reA, reB] of ANTONYM_PAIRS) {
    const groupA = constraints.filter(c => reA.test(c));
    const groupB = constraints.filter(c => reB.test(c));
    if (groupA.length && groupB.length) {
      conflicts.push([groupA[0], groupB[0]]);
    }
  }
  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROSE SENTENCE ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits prose into individual sentences (very lightweight — period/!/?).
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Finds duplicate sentences within a block of prose text.
 * Returns a Set of sentences that appear more than once (all copies except first).
 *
 * @param {string} prose
 * @returns {Set<string>}
 */
function findDuplicateSentences(prose) {
  const sentences = splitSentences(prose);
  const seen = new Set();
  const duplicates = new Set();
  for (const s of sentences) {
    const key = normalize(s);
    if (seen.has(key)) {
      duplicates.add(s);
    } else {
      seen.add(key);
    }
  }
  return duplicates;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SemanticReport
 * @property {Map<string,string[]>} duplicateConstraints   - Normalized → [originals]
 * @property {Map<string,string[]>} duplicateRequirements  - Normalized → [originals]
 * @property {Map<string,string[]>} duplicateExamples      - Normalized → [originals]
 * @property {Set<string>}          fillerSentences        - Prose sentences to remove
 * @property {Array<[string,string]>} conflictingConstraints - Flagged pairs (not removed)
 * @property {Set<string>}          safeToRemoveSentences  - All prose sentences safe to remove
 */

/**
 * Analyzes a ParsedPrompt and returns a SemanticReport.
 *
 * @param {import('./prompt-parser.js').ParsedPrompt} parsed
 * @returns {SemanticReport}
 */
export function analyzeSemantics(parsed) {
  // Duplicate detection on structured arrays
  const duplicateConstraints  = findDuplicates(parsed.constraints);
  const duplicateRequirements = findDuplicates(parsed.requirements);
  const duplicateExamples     = findDuplicates(parsed.examples);

  // Conflicting constraints — flagged only, never removed
  const conflictingConstraints = findConflictingConstraints(parsed.constraints);

  // Filler in prose
  const fillerSentences = new Set();
  const allProseText = [
    parsed.goal,
    parsed.context,
    ...parsed.unclassified
  ].join('\n');

  for (const sentence of splitSentences(allProseText)) {
    if (isFiller(sentence) || isGreeting(sentence) || isSignOff(sentence)) {
      fillerSentences.add(sentence);
    }
  }

  // Duplicate sentences in prose (not in structured fields)
  const duplicateProseSentences = findDuplicateSentences(allProseText);

  // Union: everything safe to remove from prose
  const safeToRemoveSentences = new Set([
    ...fillerSentences,
    ...duplicateProseSentences
  ]);

  return {
    duplicateConstraints,
    duplicateRequirements,
    duplicateExamples,
    fillerSentences,
    conflictingConstraints,
    safeToRemoveSentences
  };
}
