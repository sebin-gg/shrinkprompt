/**
 * @file src/optimizer/pipeline.js
 * @description Semantic Optimizer — Pipeline Orchestrator
 *
 * Runs the full 5-stage semantic optimization pipeline and exposes a single
 * clean function that background.js calls instead of the old cleanPrompt().
 *
 * Pipeline:
 *   Stage 0 — Regex pre-clean (existing cleanPrompt — greetings, fillers)
 *   Stage 1 — Prompt Parser     (extract structure)
 *   Stage 2 — Semantic Analyzer (detect redundancy)
 *   Stage 3 — Redundancy Optimizer (safe removal / merge)
 *   Stage 4 — Markdown Formatter  (structure → clean Markdown)
 *   Stage 5 — Validation Pass     (revert on any violation)
 *
 * Design principles (in priority order):
 *   1. Intent preservation
 *   2. Constraint preservation
 *   3. Context preservation
 *   4. Information hierarchy
 *   5. Readability
 *   6. Token efficiency (secondary benefit, never primary goal)
 *
 * IMPORTANT: No chrome.* calls — runs in Node (tests), service workers, and pages.
 */

import { cleanPrompt }         from '../shared/cleaner-rules.js';
import { parsePrompt }         from './prompt-parser.js';
import { analyzeSemantics }    from './semantic-analyzer.js';
import { optimizeRedundancy }  from './redundancy-optimizer.js';
import { formatToMarkdown }    from './formatter.js';
import { validateOutput }      from './validator.js';

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TYPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} OptimizeResult
 * @property {string}   optimized      - The final output string (Markdown or original)
 * @property {string}   original       - The unmodified raw input
 * @property {string}   provider       - Always 'semantic-local' for this pipeline
 * @property {string[]} stagesApplied  - Names of stages that ran successfully
 * @property {string[]} violations     - Validation violations (empty when valid)
 * @property {boolean}  reverted       - true if validator forced a revert
 */

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full semantic optimization pipeline on a raw prompt string.
 *
 * @param {string} rawText          - Original user prompt
 * @param {Object} [options={}]     - Optional configuration
 * @param {Object} [options.patterns] - Regex pattern config forwarded to cleanPrompt (Stage 0)
 * @param {boolean} [options.skipRegexStage=false] - Skip Stage 0 regex pre-clean
 * @returns {Promise<OptimizeResult>}
 */
export async function optimizePrompt(rawText, options = {}) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return {
      optimized:     rawText || '',
      original:      rawText || '',
      provider:      'semantic-local',
      stagesApplied: [],
      violations:    [],
      reverted:      false
    };
  }

  const stagesApplied = [];
  let current = rawText;

  try {
    // ── Stage 0: Regex pre-clean (existing cleaner, kept for compatibility) ──
    if (!options.skipRegexStage) {
      current = cleanPrompt(current, options.patterns);
      stagesApplied.push('regex-pre-clean');
    }

    // ── Stage 1: Parse ────────────────────────────────────────────────────────
    const parsed = parsePrompt(current);
    stagesApplied.push('parser');

    // ── Stage 2: Semantic analysis ────────────────────────────────────────────
    const report = analyzeSemantics(parsed);
    stagesApplied.push('semantic-analyzer');

    // ── Stage 3: Redundancy optimization ─────────────────────────────────────
    const optimizedParsed = optimizeRedundancy(parsed, report);
    stagesApplied.push('redundancy-optimizer');

    // ── Stage 4: Markdown formatting ──────────────────────────────────────────
    const formatted = formatToMarkdown(optimizedParsed);
    stagesApplied.push('formatter');

    // ── Stage 5: Validation ───────────────────────────────────────────────────
    // Validate against the ORIGINAL parsed structure (not the optimized one)
    // to ensure nothing from the user's original intent was lost.
    const validation = validateOutput(formatted, parsed);
    stagesApplied.push('validator');

    if (!validation.valid) {
      // Revert: return the Stage-0 cleaned text (not the raw — Stage 0 is safe)
      console.warn('[BrevityPrompt] Semantic optimizer: validation failed, reverting.',
        validation.violations.join('; '));
      return {
        optimized:     current,   // Stage-0 output (safe baseline)
        original:      rawText,
        provider:      'semantic-local',
        stagesApplied,
        violations:    validation.violations,
        reverted:      true
      };
    }

    return {
      optimized:     formatted,
      original:      rawText,
      provider:      'semantic-local',
      stagesApplied,
      violations:    [],
      reverted:      false
    };

  } catch (err) {
    // Safety net: any unexpected error returns the original text unchanged.
    console.error('[BrevityPrompt] Semantic optimizer pipeline error:', err);
    return {
      optimized:     rawText,
      original:      rawText,
      provider:      'semantic-local',
      stagesApplied,
      violations:    [`Internal error: ${err.message}`],
      reverted:      true
    };
  }
}
