/**
 * @file src/optimizer/prompt-parser.js
 * @description Stage 1 — Prompt Parser
 *
 * Converts raw prompt text into a structured ParsedPrompt object without
 * modifying any content. All downstream stages work from this object.
 *
 * IMPORTANT: This module performs NO optimization. It only reads and structures.
 * IMPORTANT: No chrome.* calls — runs in Node (tests), service workers, and pages.
 */

import { extractCodeBlocks, restoreCodeBlocks } from '../shared/cleaner-rules.js';

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY EXTRACTION PATTERNS
// Used by the Validation Pass to verify nothing is lost.
// ─────────────────────────────────────────────────────────────────────────────

/** Matches URLs (http/https/ftp). */
const URL_RE = /https?:\/\/[^\s"')\]>]+|ftp:\/\/[^\s"')\]>]+/gi;

/** Matches POSIX / Windows file paths. */
const PATH_RE = /(?:\/[\w./-]+|[A-Za-z]:\\[\w\\. -]+|\.{1,2}\/[\w./-]+)/g;

/** Matches semantic version strings like v1.2.3, 3.11.0, >=2.0. */
const VERSION_RE = /(?:v?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?|>=?\s*\d+(?:\.\d+)*)/gi;

/** Matches Python/JS/Java identifiers that look like function or class names. */
const IDENTIFIER_RE = /\b([A-Z][a-zA-Z0-9]+(?:Adapter|Manager|Handler|Service|Controller|Client|Server|Parser|Formatter|Optimizer|Validator|Pipeline|Base|Abstract)?)\b|\b([a-z][a-zA-Z0-9]*(?:_[a-z][a-zA-Z0-9]*)+)\b/g;

/** Matches numeric literals that look significant (port numbers, limits, counts). */
const NUMERIC_RE = /\b\d{2,}\b/g;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION KEYWORD HEURISTICS
// Maps normalized heading patterns to ParsedPrompt field names.
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_MAP = [
  { field: 'goal',         patterns: /^(?:task|goal|objective|primary task|what i need|what to do)/i },
  { field: 'context',      patterns: /^(?:context|background|situation|about|overview)/i },
  { field: 'requirements', patterns: /^(?:requirements?|req|must|needs?|specs?|features?)/i },
  { field: 'constraints',  patterns: /^(?:constraints?|limitations?|restrictions?|rules?|do not|don'?t|never|avoid)/i },
  { field: 'examples',     patterns: /^(?:examples?|e\.g\.|for instance|sample|demo|illustration)/i },
  { field: 'outputFormat', patterns: /^(?:output|format|response format|expected output|return)/i },
  { field: 'tone',         patterns: /^(?:tone|style|voice|formality|audience)/i },
  { field: 'attachments',  patterns: /^(?:attachments?|files?|inputs?|data|attached|see also)/i },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits text into logical paragraphs (double-newline separated).
 * @param {string} text
 * @returns {string[]}
 */
function splitParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Splits a paragraph into individual bullet items if it looks like a list.
 * @param {string} paragraph
 * @returns {string[]}
 */
function extractListItems(paragraph) {
  const lines = paragraph.split('\n').map(l => l.trim()).filter(Boolean);
  // All lines start with -, *, or a number+dot → treat as list
  const isList = lines.length > 1 && lines.every(l => /^[-*•\d+.]\s/.test(l));
  if (isList) {
    return lines.map(l => l.replace(/^[-*•\d+.]\s+/, '').trim());
  }
  return [paragraph];
}

/**
 * Detects all technical entity strings (URLs, paths, versions, identifiers,
 * numbers) in a block of text and returns them as a deduplicated Set.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function extractEntities(text) {
  const entities = new Set();
  const collect = (re) => {
    const matches = text.match(re) || [];
    matches.forEach(m => entities.add(m.trim()));
  };
  collect(URL_RE);
  collect(PATH_RE);
  collect(VERSION_RE);
  collect(NUMERIC_RE);

  // Only keep identifiers longer than 3 chars to reduce false positives
  const idMatches = text.match(IDENTIFIER_RE) || [];
  idMatches.forEach(m => { if (m.length > 3) entities.add(m.trim()); });

  return entities;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ParsedPrompt
 * @property {string}   raw           - Original unmodified input text
 * @property {string}   prose         - Text with code blocks replaced by tokens
 * @property {Array}    codeBlocks    - { token, content } pairs extracted verbatim
 * @property {string}   goal          - Primary task / objective
 * @property {string}   context       - Background / situation
 * @property {string[]} requirements  - Explicit "must" / "need" items
 * @property {string[]} constraints   - Things the LLM must not do
 * @property {string[]} examples      - Examples / samples
 * @property {string[]} references    - URLs, file paths, API names
 * @property {string}   outputFormat  - Requested output format
 * @property {string}   tone          - Requested tone or style
 * @property {string[]} attachments   - Mentioned file attachments
 * @property {Set<string>} entities   - All technical entities (for validation)
 * @property {string[]} unclassified  - Paragraphs that didn't match any section
 */

/**
 * Parses raw prompt text into a structured ParsedPrompt object.
 *
 * @param {string} rawText - The original user prompt
 * @returns {ParsedPrompt}
 */
export function parsePrompt(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return _empty(rawText || '');
  }

  // Step 1: Extract code blocks verbatim so no parsing touches them.
  const { text: prose, blocks } = extractCodeBlocks(rawText);

  // Step 2: Extract all technical entities from the ORIGINAL text (including
  //         those inside code blocks) so the Validator can check completeness.
  const entities = extractEntities(rawText);
  // Store code-block content strings as entities too
  blocks.forEach(b => {
    extractEntities(b.content).forEach(e => entities.add(e));
    entities.add(b.content); // treat the whole block as an entity
  });

  // Step 3: Split prose into paragraphs and classify each one.
  const paragraphs = splitParagraphs(prose);

  const parsed = {
    raw:          rawText,
    prose,
    codeBlocks:   blocks,
    goal:         '',
    context:      '',
    requirements: [],
    constraints:  [],
    examples:     [],
    references:   [],
    outputFormat: '',
    tone:         '',
    attachments:  [],
    entities,
    unclassified: []
  };

  // Step 4: Classify each paragraph.
  for (const para of paragraphs) {
    _classifyParagraph(para, parsed);
  }

  // Step 5: Pull any URLs / paths from prose into references[] so validator
  //         can confirm they survive formatting.
  const proseEntities = extractEntities(prose);
  proseEntities.forEach(e => {
    if (URL_RE.test(e) || PATH_RE.test(e)) {
      if (!parsed.references.includes(e)) parsed.references.push(e);
    }
  });
  // Reset regex lastIndex (global flag side-effect)
  URL_RE.lastIndex = 0;
  PATH_RE.lastIndex = 0;

  return parsed;
}

/**
 * Classifies a single paragraph into the appropriate ParsedPrompt field.
 * Uses heading detection first, then falls back to keyword scanning.
 *
 * @param {string}      para
 * @param {ParsedPrompt} parsed - mutated in place
 */
function _classifyParagraph(para, parsed) {
  // Skip code-block placeholder tokens
  if (para.startsWith('__BREVITY_CODE_')) return;

  // --- Markdown heading detection (# Context, ## Requirements, etc.) ---
  const headingMatch = para.match(/^#{1,6}\s+(.+)/);
  if (headingMatch) {
    const headingText = headingMatch[1].trim();
    const sectionDef = SECTION_MAP.find(s => s.patterns.test(headingText));
    if (sectionDef) {
      // The content follows after the heading line
      const rest = para.replace(/^#{1,6}\s+.+\n?/, '').trim();
      if (rest) _appendToField(sectionDef.field, rest, parsed);
      return;
    }
    // Unknown heading — keep in unclassified
    parsed.unclassified.push(para);
    return;
  }

  // --- Inline keyword detection ("Requirements:", "Constraints:", etc.) ---
  const colonMatch = para.match(/^([A-Za-z ]{2,30}):\s*\n?([\s\S]*)/);
  if (colonMatch) {
    const label = colonMatch[1].trim();
    const body  = colonMatch[2].trim();
    const sectionDef = SECTION_MAP.find(s => s.patterns.test(label));
    if (sectionDef && body) {
      _appendToField(sectionDef.field, body, parsed);
      return;
    }
  }

  // --- Heuristic classification based on content signals ---
  if (!parsed.goal && _looksLikeGoal(para)) {
    parsed.goal = para;
    return;
  }

  if (_looksLikeConstraint(para)) {
    extractListItems(para).forEach(item => {
      if (!parsed.constraints.includes(item)) parsed.constraints.push(item);
    });
    return;
  }

  if (_looksLikeRequirement(para)) {
    extractListItems(para).forEach(item => {
      if (!parsed.requirements.includes(item)) parsed.requirements.push(item);
    });
    return;
  }

  // Default: keep in context if context is empty, else unclassified
  if (!parsed.context) {
    parsed.context = para;
  } else {
    parsed.unclassified.push(para);
  }
}

/** Appends a value to the named field (string append or array push). */
function _appendToField(field, value, parsed) {
  if (Array.isArray(parsed[field])) {
    extractListItems(value).forEach(item => {
      if (!parsed[field].includes(item)) parsed[field].push(item);
    });
  } else if (typeof parsed[field] === 'string') {
    parsed[field] = parsed[field] ? `${parsed[field]}\n${value}` : value;
  }
}

const GOAL_SIGNALS = /\b(explain|implement|create|build|write|generate|design|refactor|describe|summarize|convert|analyze|fix|debug|review|compare|list|show|help)\b/i;
const CONSTRAINT_SIGNALS = /\b(do not|don'?t|never|avoid|must not|should not|no |without)\b/i;
const REQUIREMENT_SIGNALS = /\b(must|should|need|require|ensure|make sure|include|always)\b/i;

function _looksLikeGoal(para) {
  return GOAL_SIGNALS.test(para) && para.length < 300;
}

function _looksLikeConstraint(para) {
  return CONSTRAINT_SIGNALS.test(para);
}

function _looksLikeRequirement(para) {
  return REQUIREMENT_SIGNALS.test(para);
}

/** Returns a minimal empty ParsedPrompt for invalid input. */
function _empty(raw) {
  return {
    raw,
    prose: raw,
    codeBlocks: [],
    goal: '',
    context: '',
    requirements: [],
    constraints: [],
    examples: [],
    references: [],
    outputFormat: '',
    tone: '',
    attachments: [],
    entities: new Set(),
    unclassified: []
  };
}

/**
 * Restores code-block placeholders back into a string.
 * Re-exported here so pipeline.js doesn't need to import cleaner-rules directly.
 *
 * @param {string} text
 * @param {Array}  blocks
 * @returns {string}
 */
export { restoreCodeBlocks };
