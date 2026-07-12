/**
 * @file src/optimizer/validator.js
 * @description Stage 5 — Validation Pass
 *
 * Before returning the optimized prompt, verifies that the output contains
 * every critical element from the original:
 *
 *   ✓ Every user requirement
 *   ✓ Every constraint
 *   ✓ Every example
 *   ✓ Every URL (verbatim)
 *   ✓ Every file path (verbatim)
 *   ✓ All code blocks (restored by Formatter)
 *   ✓ All numeric values ≥ 2 digits
 *   ✓ All semantic version strings
 *   ✓ All technical identifiers in references[]
 *
 * On failure: returns the original raw text (revert mode).
 * Correctness > compression — always.
 *
 * IMPORTANT: No chrome.* calls — runs in Node (tests), service workers, and pages.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

const URL_RE     = /https?:\/\/[^\s"')\]>]+/gi;
const PATH_RE    = /(?:\/[\w./-]{3,}|[A-Za-z]:\\[\w\\. -]{3,}|\.{1,2}\/[\w./-]+)/g;
const VERSION_RE = /(?:v?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?|>=?\s*\d+(?:\.\d+)*)/gi;
const NUMERIC_RE = /\b\d{2,}\b/g;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether every string in `items` appears in `output` (substring check).
 * Returns a list of missing items.
 *
 * @param {string[]} items
 * @param {string}   output
 * @returns {string[]} Missing items
 */
function findMissing(items, output) {
  return items.filter(item => {
    if (!item || !item.trim()) return false;
    // Normalize whitespace for comparison (output formatting may reflow)
    const normalItem = item.trim().replace(/\s+/g, ' ');
    const normalOut  = output.replace(/\s+/g, ' ');
    return !normalOut.includes(normalItem);
  });
}

/**
 * Extracts all matches of a regex from a string (resets lastIndex each call).
 * @param {string} text
 * @param {RegExp} re   - Must have 'g' or 'gi' flag
 * @returns {string[]}
 */
function matchAll(text, re) {
  re.lastIndex = 0;
  return text.match(re) || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  valid      - true if all checks passed
 * @property {string[]} violations - Human-readable descriptions of failures
 * @property {string|null} revertTo - Text to use instead if valid===false (original raw)
 */

/**
 * Validates that `optimizedText` preserves all critical elements from
 * the original ParsedPrompt.
 *
 * Strategy: revert (return original raw text) on any violation.
 * Correctness is more important than compression.
 *
 * @param {string}                                          optimizedText
 * @param {import('./prompt-parser.js').ParsedPrompt}       parsed       - Original parsed structure
 * @returns {ValidationResult}
 */
export function validateOutput(optimizedText, parsed) {
  const violations = [];
  const out = optimizedText || '';

  // 1. Requirements
  const missingReq = findMissing(parsed.requirements, out);
  if (missingReq.length) {
    violations.push(`Missing requirements: ${missingReq.map(r => `"${r.slice(0,60)}"`).join(', ')}`);
  }

  // 2. Constraints
  const missingCon = findMissing(parsed.constraints, out);
  if (missingCon.length) {
    violations.push(`Missing constraints: ${missingCon.map(c => `"${c.slice(0,60)}"`).join(', ')}`);
  }

  // 3. Examples
  const missingEx = findMissing(parsed.examples, out);
  if (missingEx.length) {
    violations.push(`Missing examples: ${missingEx.map(e => `"${e.slice(0,60)}"`).join(', ')}`);
  }

  // 4. Code blocks — check tokens were properly restored
  for (const block of (parsed.codeBlocks || [])) {
    // The token must NOT appear in the output (means it was restored)
    // OR the block content itself must appear
    if (out.includes(block.token)) {
      violations.push(`Code block token not restored: ${block.token}`);
    } else if (!out.includes(block.content.trim().slice(0, 40))) {
      violations.push(`Code block content missing: ${block.content.trim().slice(0, 40)}...`);
    }
  }

  // 5. URLs
  const originalUrls = matchAll(parsed.raw, URL_RE);
  for (const url of originalUrls) {
    if (!out.includes(url)) {
      violations.push(`URL missing from output: ${url.slice(0,80)}`);
    }
  }

  // 6. File paths
  const originalPaths = matchAll(parsed.raw, PATH_RE);
  for (const p of originalPaths) {
    // Paths of 5+ chars only to reduce false positives
    if (p.length >= 5 && !out.includes(p)) {
      violations.push(`File path missing: ${p.slice(0,80)}`);
    }
  }

  // 7. Numeric values (2+ digit numbers that appear in the original prose,
  //    excluding those already inside code blocks)
  const proseToCHeck = parsed.raw;
  const originalNums = matchAll(proseToCHeck, NUMERIC_RE);
  for (const num of originalNums) {
    if (!out.includes(num)) {
      violations.push(`Numeric value missing: ${num}`);
    }
  }

  // 8. Version strings
  const originalVersions = matchAll(parsed.raw, VERSION_RE);
  for (const ver of originalVersions) {
    if (!out.includes(ver)) {
      violations.push(`Version string missing: ${ver}`);
    }
  }

  // 9. References[] (API names, important identifiers captured by parser)
  for (const ref of (parsed.references || [])) {
    if (ref && ref.trim() && !out.includes(ref.trim())) {
      violations.push(`Reference missing: ${ref.slice(0,80)}`);
    }
  }

  const valid = violations.length === 0;

  return {
    valid,
    violations,
    // Revert to original raw text on failure
    revertTo: valid ? null : parsed.raw
  };
}
