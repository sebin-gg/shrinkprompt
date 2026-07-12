/**
 * @file src/shared/markdown-formatter.js
 * @description Reusable Markdown Formatter — converts the context optimizer's
 *   structured JSON output into clean, well-formed Markdown ready to send to
 *   an LLM.  This module performs **no** optimization, summarization, or
 *   rewriting.  Its sole responsibility is format conversion.
 *
 * Architecture:
 *   User Input ? Context Optimizer ? Structured JSON ? Markdown Formatter ? LLM
 *
 * +- Consumers --------------------------------------------------------------+
 * ¦  background.js   ? import via ES module (service worker, type:"module") ¦
 * ¦  content.js      ? import via ES module (<script type="module">)        ¦
 * ¦  tests/          ? import via Node ES module (.mjs)                     ¦
 * +--------------------------------------------------------------------------+
 *
 * IMPORTANT: Do NOT add chrome.* API calls here.  This module must be pure JS
 * so it can run in Node (tests), service workers, and browser pages alike.
 *
 * Extending to new output formats (XML, YAML, HTML, …):
 *   Add a sibling file (e.g. xml-formatter.js) that exports its own converter.
 *   The optimizer and this formatter remain completely decoupled from each other
 *   and from any future format modules.
 */

// -----------------------------------------------------------------------------
// INTERNAL HELPERS
// -----------------------------------------------------------------------------

/**
 * Returns true when a value is non-null, non-undefined, and not an empty string.
 *
 * @param {*} value
 * @returns {boolean}
 */
function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Capitalises the first character of a string and lowercases the rest.
 * Used by the generic formatter to derive human-readable headings from
 * camelCase, snake_case, or plain property names.
 *
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  // Convert camelCase / snake_case to words, then capitalise first.
  const readable = str
    .replace(/_/g, ' ')                  // snake_case ? spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase ? spaces
    .trim();
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

/**
 * Renders a single value (string, number, or boolean) as a Markdown paragraph.
 * Arrays are rendered as a bullet list.
 * Plain objects are rendered recursively using objectToMarkdown() at depth+1.
 *
 * @param {*}      value
 * @param {number} [depth=1] - Current heading depth (1 = ##, 2 = ###, …)
 * @returns {string}
 */
function renderValue(value, depth = 1) {
  if (Array.isArray(value)) {
    const filtered = value.filter(item => item !== null && item !== undefined);
    if (filtered.length === 0) return '';
    return filtered
      .map(item => {
        if (typeof item === 'object') return `- ${JSON.stringify(item)}`;
        return `- ${item}`;
      })
      .join('\n') + '\n';
  }

  if (typeof value === 'object') {
    // Recursively format nested objects with a deeper heading level.
    return objectToMarkdown(value, depth + 1);
  }

  return `${value}\n`;
}

// -----------------------------------------------------------------------------
// 1. SCHEMA-AWARE FORMATTER
//    Converts the well-known optimizer output shape into opinionated Markdown:
//      • "objective"    ? H1
//      • other known fields ? H2
//    Only fields that are present and non-empty produce output.
// -----------------------------------------------------------------------------

/**
 * Converts a structured optimizer output object into well-formed Markdown.
 *
 * Rules:
 *  - Generates headings only for existing, non-empty fields.
 *  - Skips null / undefined / empty-string / empty-array values.
 *  - Arrays  ? Markdown bullet lists (- item).
 *  - Strings ? Plain paragraph text.
 *  - "objective" is rendered as an H1 (#); every other known key is H2 (##).
 *  - Unknown keys are appended after the known ones using objectToMarkdown()
 *    so that no information from the optimizer is silently discarded.
 *
 * @param {Object}   data
 * @param {string}   [data.objective]      - Primary goal (? H1).
 * @param {string}   [data.context]        - Background context.
 * @param {string[]} [data.requirements]   - List of requirements.
 * @param {string[]} [data.constraints]    - List of constraints.
 * @param {string}   [data.reference]      - Supporting reference material.
 * @returns {string} A trimmed, valid Markdown string.
 *
 * @example
 * toMarkdown({
 *   objective: "Explain transformer architecture",
 *   context: "Interview tomorrow",
 *   requirements: ["Use simple language", "Include examples"],
 *   constraints: ["No advanced math"],
 *   reference: "Attached code"
 * });
 * // ? "# Objective\n\nExplain transformer architecture\n\n## Context\n…"
 */
export function toMarkdown(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return '';
  }

  let md = '';

  // Known fields rendered in a fixed, logical order.
  const KNOWN_FIELDS = ['objective', 'context', 'requirements', 'constraints', 'reference'];

  if (hasValue(data.objective)) {
    md += '# Objective\n\n';
    md += renderValue(data.objective);
    md += '\n';
  }

  if (hasValue(data.context)) {
    md += '## Context\n\n';
    md += renderValue(data.context);
    md += '\n';
  }

  if (hasValue(data.requirements)) {
    md += '## Requirements\n\n';
    md += renderValue(data.requirements);
    md += '\n';
  }

  if (hasValue(data.constraints)) {
    md += '## Constraints\n\n';
    md += renderValue(data.constraints);
    md += '\n';
  }

  if (hasValue(data.reference)) {
    md += '## Reference\n\n';
    md += renderValue(data.reference);
    md += '\n';
  }

  // Any extra keys not in the known list are appended generically so that
  // no data from the optimizer is silently discarded.
  const extraEntries = Object.entries(data).filter(
    ([key]) => !KNOWN_FIELDS.includes(key) && hasValue(data[key])
  );

  for (const [key, value] of extraEntries) {
    md += `## ${capitalize(key)}\n\n`;
    md += renderValue(value);
    md += '\n';
  }

  return md.trim();
}

// -----------------------------------------------------------------------------
// 2. GENERIC FORMATTER (future-proof)
//    Converts an arbitrary JSON object into Markdown without any hardcoded
//    field names.  Heading level is controlled by the `depth` parameter so
//    nested objects produce sub-headings automatically.
// -----------------------------------------------------------------------------

/**
 * Converts any plain JavaScript object into Markdown without relying on
 * hardcoded field names.  Suitable for arbitrary optimizer outputs.
 *
 * Rules:
 *  - Each key becomes a heading (## by default; deeper nesting ? ###, ####, …).
 *  - Arrays  ? Markdown bullet lists (- item).
 *  - Strings / numbers / booleans ? paragraph text.
 *  - Nested objects ? recursive sub-sections at the next heading level.
 *  - Null / undefined / empty values are silently skipped.
 *  - Heading level is capped at 6 (######) per the Markdown specification.
 *
 * @param {Object} obj         - Any plain object to convert.
 * @param {number} [depth=1]   - Starting heading depth (1 ? ##, 2 ? ###, …).
 * @returns {string} A trimmed, valid Markdown string.
 *
 * @example
 * objectToMarkdown({
 *   summary: "Quick overview",
 *   tags: ["ai", "llm"],
 *   meta: { author: "Alice" }
 * });
 * // ? "## Summary\n\nQuick overview\n\n## Tags\n\n- ai\n- llm\n\n## Meta\n\n### Author\n\nAlice"
 */
export function objectToMarkdown(obj, depth = 1) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return '';
  }

  // depth 1 ? "##", depth 2 ? "###", capped at "######".
  const headingLevel = Math.min(depth + 1, 6);
  const hashes = '#'.repeat(headingLevel);

  let md = '';

  for (const [key, value] of Object.entries(obj)) {
    if (!hasValue(value)) continue;

    md += `${hashes} ${capitalize(key)}\n\n`;
    md += renderValue(value, depth);
    md += '\n';
  }

  return md;
}
