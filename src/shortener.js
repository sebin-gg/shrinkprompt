/**
 * @file src/shortener.js
 * @description Content-script compatibility shim for BrevityPrompt.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * MV3 content scripts declared in manifest.json `content_scripts[]` cannot
 * use ES `import` statements — the browser treats them as classic scripts.
 * The canonical logic lives in `src/shared/cleaner-rules.js` (an ES Module
 * used by the service worker, the options page, and the test suite).
 *
 * This shim re-declares the canonical values so that content.js and
 * preview-modal.js can rely on `cleanPrompt` and `DEFAULT_PATTERNS` being
 * available in the page's global scope after this script is injected.
 *
 * PHASE 2 NOTE
 * ────────────
 * When content scripts are converted to the BaseChatAdapter pattern (Phase 2),
 * this file will be replaced by a proper module import mechanism or removed
 * entirely. Until then, keep this file in sync with shared/cleaner-rules.js
 * by hand (it is intentionally thin — only the values content scripts need).
 *
 * DO NOT add logic here. ALL authoritative rules live in:
 *   src/shared/cleaner-rules.js
 */

// ─── Canonical default patterns (mirrors shared/cleaner-rules.js) ───────────
// When updating patterns, update shared/cleaner-rules.js FIRST, then
// mirror only the pattern + enabled fields here (metadata not needed).
const DEFAULT_PATTERNS = {
  greetings: {
    pattern: "^(Hi|Hello|Hey|Greetings)[\\s,!]*",
    enabled: true,
    displayName: 'Greetings',
    hint: 'Matches: Hi, Hello, Hey, Greetings at the start of a prompt'
  },
  politeness: {
    pattern: "\\b(Please|Kindly|Could you|I would appreciate if|Would you mind|Could you please)\\b",
    enabled: true,
    displayName: 'Politeness',
    hint: 'Matches: Please, Kindly, Could you, I would appreciate if…'
  },
  fillers: {
    // Phrase forms only — bare "Basically/Essentially" would destroy technical prose.
    pattern: "\\b(I was wondering if|I'm looking for|Just wanted to ask|I'm trying to|I just wanted to)\\b",
    enabled: true,
    displayName: 'Fillers',
    hint: "Matches: I was wondering if, I'm looking for, Just wanted to ask…"
  },
  closings: {
    pattern: "\\b(Thanks|Thank you|I appreciate it|Have a great day|Best regards|Cheers)!?[\\s]*$",
    enabled: true,
    displayName: 'Closings',
    hint: 'Matches: Thanks, Thank you, Have a great day… at the end of a prompt'
  }
};

// ─── Code-block extraction (mirrors shared/cleaner-rules.js) ────────────────

const _TOKEN_PREFIX = '__BREVITY_CODE_';

function extractCodeBlocks(text) {
  const blocks = [];
  let idx = 0;
  const result = text
    .replace(/```[\s\S]*?```/g, (match) => {
      const token = `${_TOKEN_PREFIX}${idx}__`;
      blocks.push({ token, content: match });
      idx++;
      return token;
    })
    .replace(/`[^`]+`/g, (match) => {
      const token = `${_TOKEN_PREFIX}${idx}__`;
      blocks.push({ token, content: match });
      idx++;
      return token;
    });
  return { text: result, blocks };
}

function restoreCodeBlocks(text, blocks) {
  let result = text;
  for (const { token, content } of blocks) {
    result = result.replace(token, content);
  }
  return result;
}

// ─── Core cleaning function (mirrors shared/cleaner-rules.js) ───────────────

/**
 * Cleans a prompt by applying enabled regex patterns.
 * Code blocks (fenced and inline) are preserved untouched.
 * Mirrors `cleanPrompt` in src/shared/cleaner-rules.js exactly.
 *
 * @param {string} text
 * @param {Object} [patterns]
 * @returns {string}
 */
function cleanPrompt(text, patterns) {
  patterns = patterns || DEFAULT_PATTERNS;
  if (!text || typeof text !== 'string') return text;

  const { text: prose, blocks } = extractCodeBlocks(text);
  let cleaned = prose;

  Object.values(patterns).forEach(function (patternObj) {
    if (patternObj.enabled && patternObj.pattern) {
      try {
        const regex = new RegExp(patternObj.pattern, 'gi');
        cleaned = cleaned.replace(regex, '');
      } catch (err) {
        console.warn('[BrevityPrompt] Invalid pattern skipped:', patternObj.pattern, err);
      }
    }
  });

  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\s+([.,!?;:])/g, '$1');

  return restoreCodeBlocks(cleaned, blocks);
}

/**
 * Returns statistics about a cleaning operation.
 * Mirrors `getCleaningStats` in src/shared/cleaner-rules.js.
 *
 * @param {string} original
 * @param {string} cleaned
 * @returns {{ originalLength, cleanedLength, charsSaved, percentReduction }}
 */
function getCleaningStats(original, cleaned) {
  const originalLength = (original || '').length;
  const cleanedLength  = (cleaned  || '').length;
  const charsSaved     = originalLength - cleanedLength;
  const percentReduction = originalLength === 0
    ? 0
    : Math.round((charsSaved / originalLength) * 100);
  return { originalLength, cleanedLength, charsSaved, percentReduction };
}
