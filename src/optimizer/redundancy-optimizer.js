/**
 * @file src/optimizer/redundancy-optimizer.js
 * @description Stage 3 — Redundancy Optimizer
 *
 * Takes a (ParsedPrompt, SemanticReport) pair and produces a new ParsedPrompt
 * with safe redundancy removed.
 *
 * What is safe to remove:
 *   - Conversational filler sentences identified by the Analyzer
 *   - Greeting / sign-off sentences
 *   - Byte-for-byte duplicate sentences in prose (keeps first occurrence)
 *   - Duplicate items in constraints[], requirements[], examples[] (keeps canonical form)
 *
 * What is NEVER touched:
 *   - Code blocks (already tokenized away before this stage runs)
 *   - Technical identifiers, URLs, file paths, version numbers
 *   - Any constraint, requirement, or example (de-duplication keeps ONE copy)
 *   - Numeric values
 *
 * IMPORTANT: No chrome.* calls — runs in Node (tests), service workers, and pages.
 */

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Removes sentences from a prose string that appear in the removal set.
 * Matching is done on the normalized (trimmed, lowercased) form.
 *
 * @param {string}     prose      - Block of text
 * @param {Set<string>} toRemove  - Set of sentence strings to remove
 * @returns {string}
 */
function removeSentencesFromProse(prose, toRemove) {
  if (!prose || !toRemove.size) return prose;

  // Normalize the removal set for comparison
  const normalizedRemove = new Set(
    [...toRemove].map(s => _normalize(s))
  );

  // Split, filter, rejoin preserving paragraph structure
  return prose
    .split('\n')
    .map(line => {
      // A line may contain multiple sentences — filter sentence-by-sentence
      return _filterSentencesInLine(line, normalizedRemove);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')  // collapse excess blank lines
    .trim();
}

/**
 * Filters individual sentences within a single line.
 * @param {string}     line
 * @param {Set<string>} normalizedRemove
 * @returns {string}
 */
function _filterSentencesInLine(line, normalizedRemove) {
  const trimmed = line.trim();
  if (!trimmed) return '';

  // If the whole line is removable, drop it
  if (normalizedRemove.has(_normalize(trimmed))) return '';

  // Otherwise split by sentence-ending punctuation and filter
  const parts = trimmed.split(/(?<=[.!?])\s+/);
  const kept = parts.filter(p => !normalizedRemove.has(_normalize(p)));
  return kept.join(' ');
}

/**
 * Deduplicates an array of strings, keeping the first occurrence of each
 * normalized form. This preserves the canonical (first-seen) version.
 *
 * @param {string[]} items
 * @returns {string[]}
 */
function deduplicateArray(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = _normalize(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Normalizes a string for duplicate comparison.
 * @param {string} s
 * @returns {string}
 */
function _normalize(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;]+$/, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies safe redundancy removal to a ParsedPrompt based on the SemanticReport.
 * Returns a NEW ParsedPrompt object (immutable — does not mutate the input).
 *
 * @param {import('./prompt-parser.js').ParsedPrompt}        parsed
 * @param {import('./semantic-analyzer.js').SemanticReport}  report
 * @returns {import('./prompt-parser.js').ParsedPrompt}
 */
export function optimizeRedundancy(parsed, report) {
  const toRemove = report.safeToRemoveSentences;

  return {
    // Metadata — passed through unchanged
    raw:        parsed.raw,
    prose:      parsed.prose,   // original (pre-cleaning) prose kept for validation
    codeBlocks: parsed.codeBlocks,
    entities:   parsed.entities,

    // Prose fields: remove filler/duplicate sentences
    goal:    removeSentencesFromProse(parsed.goal,    toRemove),
    context: removeSentencesFromProse(parsed.context, toRemove),

    // Structured arrays: deduplicate, keeping canonical (first-seen) form
    requirements: deduplicateArray(parsed.requirements),
    constraints:  deduplicateArray(parsed.constraints),
    examples:     deduplicateArray(parsed.examples),

    // Pass-through fields (never modified)
    references:   parsed.references,
    outputFormat: parsed.outputFormat,
    tone:         parsed.tone,
    attachments:  parsed.attachments,

    // Unclassified prose: also remove filler
    unclassified: parsed.unclassified
      .map(p => removeSentencesFromProse(p, toRemove))
      .filter(p => p.trim().length > 0)
  };
}
