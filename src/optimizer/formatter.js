/**
 * @file src/optimizer/formatter.js
 * @description Stage 4 — Formatter
 *
 * Adapts a (possibly optimized) ParsedPrompt into clean Markdown by delegating
 * to the shared markdown-formatter.js module, then restoring code blocks.
 *
 * This stage performs NO optimization. It is a pure structural transformation.
 *
 * Output hierarchy:
 *   # Task           ← parsed.goal
 *   ## Context       ← parsed.context
 *   ## Requirements  ← parsed.requirements[]
 *   ## Constraints   ← parsed.constraints[]
 *   ## Examples      ← parsed.examples[]
 *   ## Output Format ← parsed.outputFormat
 *   ## Notes         ← parsed.unclassified[] (joined)
 *
 * Empty sections are omitted. Code blocks are restored verbatim after
 * the Markdown string is assembled.
 *
 * IMPORTANT: No chrome.* calls — runs in Node (tests), service workers, and pages.
 */

import { restoreCodeBlocks } from '../shared/cleaner-rules.js';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION RENDERERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders a Markdown heading + content block.
 * Returns empty string when value is falsy / empty.
 *
 * @param {string}          heading  - e.g. "# Task" or "## Context"
 * @param {string|string[]} value    - string or array of items
 * @returns {string}
 */
function section(heading, value) {
  if (!value || (Array.isArray(value) && value.length === 0)) return '';
  if (typeof value === 'string' && value.trim() === '') return '';

  let body = '';
  if (Array.isArray(value)) {
    body = value.filter(v => v && v.trim()).map(v => `- ${v}`).join('\n');
  } else {
    body = value.trim();
  }

  if (!body) return '';
  return `${heading}\n\n${body}\n\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts an optimized ParsedPrompt into a clean Markdown string with all
 * code blocks restored verbatim.
 *
 * @param {import('./prompt-parser.js').ParsedPrompt} parsed - Optimized prompt structure
 * @returns {string} Valid, trimmed Markdown string ready to send to the LLM
 */
export function formatToMarkdown(parsed) {
  let md = '';

  // H1 — Primary task
  md += section('# Task', parsed.goal);

  // H2 sections in logical order
  md += section('## Context',       parsed.context);
  md += section('## Requirements',  parsed.requirements);
  md += section('## Constraints',   parsed.constraints);
  md += section('## Examples',      parsed.examples);
  md += section('## Output Format', parsed.outputFormat);

  // Unclassified prose goes into Notes
  const notes = (parsed.unclassified || []).filter(p => p.trim()).join('\n\n');
  md += section('## Notes', notes || '');

  // Trim excess whitespace
  md = md.trim();

  // If nothing was structured at all, fall back to prose (prevents empty output)
  if (!md && parsed.prose) {
    md = parsed.prose.trim();
  }

  // Restore code blocks verbatim — they must appear exactly as in the original
  if (parsed.codeBlocks && parsed.codeBlocks.length > 0) {
    md = restoreCodeBlocks(md, parsed.codeBlocks);
  }

  return md;
}
