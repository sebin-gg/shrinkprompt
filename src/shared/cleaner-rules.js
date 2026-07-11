/**
 * @file src/shared/cleaner-rules.js
 * @description Canonical ES Module — single source of truth for BrevityPrompt.
 *
 * ┌─ Consumers ──────────────────────────────────────────────────────────────┐
 * │  background.js   → import via ES module (service worker, type:"module") │
 * │  settings.js     → import via ES module (<script type="module">)        │
 * │  tests/          → import via Node ES module (.mjs)                     │
 * │  shortener.js    → copies canonical values (content script shim, Phase 2│
 * │                    will convert to a proper adapter import)             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * IMPORTANT: Do NOT add chrome.* API calls here. This module must be pure JS
 * so it can run in Node (tests), service workers, and browser pages alike.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. DEFAULT REGEX PATTERN DEFINITIONS
//    Each entry carries:
//      pattern      - RegExp source string (flags 'gi' applied at runtime)
//      enabled      - whether the pattern is on by default
//      displayName  - human-readable label for the Settings UI
//      hint         - short description of what the pattern matches
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PATTERNS = Object.freeze({
  greetings: Object.freeze({
    pattern: '^(Hi|Hello|Hey|Greetings)[\\s,!]*',
    enabled: true,
    displayName: 'Greetings',
    hint: 'Matches: Hi, Hello, Hey, Greetings at the start of a prompt'
  }),
  politeness: Object.freeze({
    pattern:
      '\\b(Please|Kindly|Could you|I would appreciate if|Would you mind|Could you please)\\b',
    enabled: true,
    displayName: 'Politeness',
    hint: 'Matches: Please, Kindly, Could you, I would appreciate if…'
  }),
  fillers: Object.freeze({
    // Phrase forms only — bare "Basically/Essentially" would destroy technical prose.
    pattern:
      '\\b(I was wondering if|I\'m looking for|Just wanted to ask|I\'m trying to|I just wanted to)\\b',
    enabled: true,
    displayName: 'Fillers',
    hint: "Matches: I was wondering if, I'm looking for, Just wanted to ask…"
  }),
  closings: Object.freeze({
    pattern:
      '\\b(Thanks|Thank you|I appreciate it|Have a great day|Best regards|Cheers)!?[\\s]*$',
    enabled: true,
    displayName: 'Closings',
    hint: 'Matches: Thanks, Thank you, Have a great day… at the end of a prompt'
  })
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DEFAULT COMPANION / AI CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_COMPANION_CONFIG = Object.freeze({
  apiUrl: 'http://localhost:8000',
  cloudCompression: true,
  minCloudCharacters: 280,
  localModel: Object.freeze({
    enabled: false,
    endpoint: 'http://localhost:11434',
    model: 'gemma3:4b'
  })
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DEFAULT STATS SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_STATS = Object.freeze({
  promptsOptimized: 0,
  tokensSaved: 0,
  charactersSaved: 0
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CODE-BLOCK EXTRACTION HELPERS
//    Fenced blocks (```…```) and inline code (`…`) are pulled out before
//    regex cleaning runs, then restored afterwards. This prevents patterns
//    from mangling technical content such as variable names or code samples.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_PREFIX = '__BREVITY_CODE_';

/**
 * Extracts fenced and inline code blocks from text, replacing them with
 * stable placeholder tokens so the cleaning regex cannot touch them.
 *
 * @param {string} text - Raw prompt text
 * @returns {{ text: string, blocks: Array<{token: string, content: string}> }}
 */
export function extractCodeBlocks(text) {
  const blocks = [];
  let idx = 0;

  // Fenced blocks FIRST (greedy triple-backtick), then inline single-backtick.
  const result = text
    .replace(/```[\s\S]*?```/g, (match) => {
      const token = `${TOKEN_PREFIX}${idx}__`;
      blocks.push({ token, content: match });
      idx++;
      return token;
    })
    .replace(/`[^`]+`/g, (match) => {
      const token = `${TOKEN_PREFIX}${idx}__`;
      blocks.push({ token, content: match });
      idx++;
      return token;
    });

  return { text: result, blocks };
}

/**
 * Restores previously extracted code blocks back into the cleaned text.
 *
 * @param {string} text   - Text with placeholder tokens
 * @param {Array}  blocks - Extraction result from extractCodeBlocks()
 * @returns {string}
 */
export function restoreCodeBlocks(text, blocks) {
  let result = text;
  for (const { token, content } of blocks) {
    // Plain string replace — tokens are unique so replaceAll vs replace is moot.
    result = result.replace(token, content);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CORE CLEANING FUNCTION
//    Code-block-safe: extracts blocks → applies patterns → restores blocks.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cleans a prompt by applying the enabled regex patterns.
 * Code blocks (fenced and inline) are preserved untouched.
 *
 * @param {string} text     - Original prompt text
 * @param {Object} patterns - Pattern configuration (defaults to DEFAULT_PATTERNS)
 * @returns {string}        - Cleaned prompt text
 */
export function cleanPrompt(text, patterns = DEFAULT_PATTERNS) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Phase 1: extract code blocks so regex doesn't touch them.
  const { text: prose, blocks } = extractCodeBlocks(text);

  let cleaned = prose;

  // Phase 2: apply each enabled pattern to prose only.
  for (const patternObj of Object.values(patterns)) {
    if (patternObj.enabled && patternObj.pattern) {
      try {
        const regex = new RegExp(patternObj.pattern, 'gi');
        cleaned = cleaned.replace(regex, '');
      } catch (err) {
        // Invalid pattern — skip gracefully; do not crash the extension.
        console.warn('[BrevityPrompt] Invalid regex pattern skipped:', patternObj.pattern, err);
      }
    }
  }

  // Phase 3: normalise whitespace in prose only.
  cleaned = cleaned
    .replace(/\s+/g, ' ')           // collapse multiple spaces
    .replace(/^\s+|\s+$/g, '')      // trim leading / trailing
    .replace(/\s+([.,!?;:])/g, '$1'); // remove space before punctuation

  // Phase 4: restore code blocks.
  return restoreCodeBlocks(cleaned, blocks);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CLEANING STATISTICS HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns statistics about a single cleaning operation.
 *
 * @param {string} original - Original prompt text
 * @param {string} cleaned  - Cleaned prompt text
 * @returns {{ originalLength: number, cleanedLength: number, charsSaved: number, percentReduction: number, estimatedTokensSaved: number }}
 */
export function getCleaningStats(original, cleaned) {
  const originalLength = (original || '').length;
  const cleanedLength  = (cleaned  || '').length;
  const charsSaved     = Math.max(0, originalLength - cleanedLength);
  const percentReduction = originalLength === 0
    ? 0
    : Math.round((charsSaved / originalLength) * 100);
  // ≈4 chars / token heuristic (Phase 4 replaces this with WASM tokenizer).
  const estimatedTokensSaved = charsSaved > 0 ? Math.max(1, Math.round(charsSaved / 4)) : 0;

  return { originalLength, cleanedLength, charsSaved, percentReduction, estimatedTokensSaved };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. REGEX VALIDATION UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates a regex pattern string.
 *
 * @param {string} pattern
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePattern(pattern) {
  try {
    new RegExp(pattern, 'gi');
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
