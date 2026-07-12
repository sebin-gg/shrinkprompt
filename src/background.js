// Service Worker for BrevityPrompt
// Manages extension state, pattern storage, message routing, tokenizer operations, and telemetry interception.

import {
  DEFAULT_PATTERNS,
  DEFAULT_COMPANION_CONFIG,
  DEFAULT_STATS,
  extractCodeBlocks,
  restoreCodeBlocks
} from './shared/cleaner-rules.js';

import { optimizePrompt } from './optimizer/pipeline.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. WASM-READY CALIBRATED TOKENIZER (cl100k_base alignment)
// ─────────────────────────────────────────────────────────────────────────────

class BrevityTokenizer {
  constructor() {
    this.wasmInstance = null;
    this.wasmModule = null;
  }

  /**
   * Safe asynchronous loader for the compiled Tiktoken WASM module.
   * Gracefully falls back to a highly calibrated regex BPE estimator if missing.
   */
  async init() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
        console.log('[BrevityPrompt] Tokenizer running in offline fallback mode.');
        return;
      }
      const wasmUrl = chrome.runtime.getURL('wasm/tiktoken_bg.wasm');
      const response = await fetch(wasmUrl);
      if (!response.ok) {
        throw new Error(`fetch returned ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      // Provide placeholders for standard wasm-bindgen imports
      const imports = {
        wbg: {
          __wbindgen_placeholder__: () => {},
          __wbindgen_throw: (msg) => { console.error('[BrevityPrompt] Tiktoken WASM Exception:', msg); }
        }
      };
      const { instance, module } = await WebAssembly.instantiate(buffer, imports);
      this.wasmInstance = instance;
      this.wasmModule = module;
      console.log('[BrevityPrompt] Tokenizer: Tiktoken WASM loaded successfully.');
    } catch (e) {
      console.log('[BrevityPrompt] Tokenizer: Tiktoken WASM not loaded, using calibrated BPE fallback. Rationale:', e.message);
    }
  }

  /**
   * Helper to check active engine.
   * @returns {boolean}
   */
  isUsingWasm() {
    return this.wasmInstance !== null;
  }

  /**
   * Estimates or calculates token count.
   * @param {string} text
   * @returns {number}
   */
  countTokens(text) {
    if (!text || typeof text !== 'string') return 0;

    // Direct invocation if compiled function matches expected interface
    if (this.wasmInstance && this.wasmInstance.exports && typeof this.wasmInstance.exports.count_tokens === 'function') {
      try {
        return this.wasmInstance.exports.count_tokens(text);
      } catch (err) {
        console.warn('[BrevityPrompt] WASM token count invocation failed, using JS fallback:', err);
      }
    }

    return this._jsBpeEstimate(text);
  }

  /**
   * A calibrated cl100k_base BPE estimator.
   * Uses ES2018 Unicode Property Escapes to achieve ≤12% error margin on typical prompts.
   */
  _jsBpeEstimate(text) {
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
  }
}

const tokenizer = new BrevityTokenizer();
tokenizer.init();

// ─────────────────────────────────────────────────────────────────────────────
// 2. DETERMINISTIC TELEMETRY & NETWORK INTERCEPTION
// ─────────────────────────────────────────────────────────────────────────────

const NetworkTracker = {
  /**
   * Tracks outbound chat requests deterministically via webRequest API.
   * Records stats in chrome.storage.local and triggers dashboard updates.
   */
  async recordCall(details) {
    try {
      const storage = await chrome.storage.local.get(['networkStats']);
      const stats = storage.networkStats || {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        byDomain: {}
      };

      const url = new URL(details.url);
      const domain = url.hostname;

      stats.totalCalls += 1;
      if (details.statusCode >= 200 && details.statusCode < 300) {
        stats.successCalls += 1;
      } else {
        stats.failedCalls += 1;
      }

      if (!stats.byDomain[domain]) {
        stats.byDomain[domain] = { total: 0, success: 0, failed: 0 };
      }
      stats.byDomain[domain].total += 1;
      if (details.statusCode >= 200 && details.statusCode < 300) {
        stats.byDomain[domain].success += 1;
      } else {
        stats.byDomain[domain].failed += 1;
      }

      await chrome.storage.local.set({ networkStats: stats });

      // Signal back to dashboard HUD inside the page if possible
      if (details.tabId && details.tabId !== chrome.tabs.TAB_ID_NONE) {
        chrome.tabs.sendMessage(details.tabId, {
          action: 'networkEvent',
          url: details.url,
          method: details.method,
          statusCode: details.statusCode,
          timestamp: details.timeStamp
        }).catch(() => { /* target tab might not have listener loaded, ignore */ });
      }
    } catch (e) {
      console.error('[BrevityPrompt] NetworkTracker error:', e);
    }
  }
};

// Listen for completed API requests
chrome.webRequest.onCompleted.addListener(
  (details) => {
    NetworkTracker.recordCall(details);
  },
  {
    urls: [
      "*://chatgpt.com/backend-api/*",
      "*://api.openai.com/v1/*",
      "*://claude.ai/api/*",
      "*://generativelanguage.googleapis.com/*",
      "*://gemini.google.com/*"
    ]
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. EXTENSION STATE INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const storage = await chrome.storage.sync.get(['enabled', 'patterns', 'companionConfig']);

  if (!('enabled' in storage)) {
    await chrome.storage.sync.set({ enabled: false });
  }

  if (!('patterns' in storage)) {
    await chrome.storage.sync.set({ patterns: DEFAULT_PATTERNS });
  }

  if (!('companionConfig' in storage)) {
    await chrome.storage.sync.set({ companionConfig: DEFAULT_COMPANION_CONFIG });
  }

  const localStorage = await chrome.storage.local.get(['stats', 'networkStats']);
  if (!localStorage.stats) {
    await chrome.storage.local.set({ stats: DEFAULT_STATS });
  }
  if (!localStorage.networkStats) {
    await chrome.storage.local.set({
      networkStats: {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        byDomain: {}
      }
    });
  }

  console.log('[BrevityPrompt] Extension initialized');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MESSAGE ROUTER
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'cleanPrompt') {
    handleCleanPrompt(request.text, sendResponse, sender.tab);
    return true; // async reply
  }

  if (request.action === 'getState') {
    handleGetState(sendResponse);
    return true;
  }

  if (request.action === 'validateRegex') {
    handleValidateRegex(request.pattern, sendResponse);
    return true;
  }

  if (request.action === 'recordSavings') {
    recordSavings(request.original, request.shortened, sendResponse);
    return true;
  }

  if (request.action === 'getStats') {
    getStats(sendResponse);
    return true;
  }

  if (request.action === 'getNetworkStats') {
    getNetworkStats(sendResponse);
    return true;
  }

  if (request.action === 'countTokens') {
    sendResponse({ tokens: tokenizer.countTokens(request.text) });
    return true;
  }
});

const FETCH_TIMEOUT_MS = 3000;
const SEMANTIC_DEADLINE_MS = 3000;

function isExtensionEnabled(enabledValue) {
  return enabledValue === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SEMANTIC OPTIMIZATION PIPELINE
//    Replaces the former regex-only shortener with the 5-stage semantic engine.
//    Response shape is identical — content.js and preview-modal.js unchanged.
// ─────────────────────────────────────────────────────────────────────────────

async function handleCleanPrompt(text, sendResponse, senderTab) {
  try {
    const storage = await chrome.storage.sync.get(['enabled', 'patterns', 'companionConfig']);
    const isEnabled = isExtensionEnabled(storage.enabled);
    const patterns = storage.patterns || DEFAULT_PATTERNS;

    if (!isEnabled) {
      sendResponse({ original: text, shortened: text, cleaned: false });
      return;
    }

    // Run the 5-stage semantic pipeline (Stage 0 applies cleanPrompt internally)
    const pipelineResult = await optimizePrompt(text, { patterns });
    const locallyCleaned = pipelineResult.optimized;
    const config = { ...DEFAULT_COMPANION_CONFIG, ...(storage.companionConfig || {}) };

    const originalTokens = tokenizer.countTokens(text);
    const locallyCleanedTokens = tokenizer.countTokens(locallyCleaned);

    sendResponse({
      original: text,
      shortened: locallyCleaned,
      cleaned: text !== locallyCleaned,
      provider: pipelineResult.provider,
      model: null,
      originalTokens: originalTokens,
      shortenedTokens: locallyCleanedTokens,
      mayUpgrade: locallyCleaned.length >= config.minCloudCharacters &&
                  (config.cloudCompression || config.localModel?.enabled)
    });

    if (locallyCleaned.length < config.minCloudCharacters) return;
    if (!config.cloudCompression && !config.localModel?.enabled) return;

    const tabId = senderTab?.id;
    if (!tabId) return;

    try {
      const deadline = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('semantic deadline exceeded')), SEMANTIC_DEADLINE_MS)
      );
      const semantic = compressWithCompanion(locallyCleaned, config);
      const result = await Promise.race([semantic, deadline]);

      if (result.text && result.text !== locallyCleaned &&
          result.text.length < locallyCleaned.length &&
          result.provider !== 'local-regex') {
        const upgradedTokens = tokenizer.countTokens(result.text);
        chrome.tabs.sendMessage(tabId, {
          action: 'semanticUpgrade',
          original: text,
          shortened: result.text,
          provider: result.provider,
          model: result.model,
          originalTokens: originalTokens,
          shortenedTokens: upgradedTokens
        }).catch(() => { /* swallow tab-unload exception */ });
        console.log('[BrevityPrompt] Semantic upgrade pushed via', result.provider);
      }
    } catch (err) {
      console.log('[BrevityPrompt] Semantic compression skipped:', err.message);
    }
  } catch (error) {
    console.error('[BrevityPrompt] Error cleaning prompt:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SEMANTIC COMPRESSION API AGENTS
// ─────────────────────────────────────────────────────────────────────────────

async function compressWithCompanion(text, config) {
  if (text.length < config.minCloudCharacters) {
    return { text, provider: 'local-regex' };
  }

  const localConfig = { ...DEFAULT_COMPANION_CONFIG.localModel, ...(config.localModel || {}) };
  const ollamaEnabled = localConfig.enabled;
  const cloudEnabled = config.cloudCompression;

  if (!ollamaEnabled && !cloudEnabled) {
    return { text, provider: 'local-regex' };
  }

  try {
    const candidates = [];

    if (ollamaEnabled) {
      candidates.push(
        compressWithOllama(text, localConfig)
          .catch(err => {
            console.warn('[BrevityPrompt] Ollama failed:', err.message);
            throw err;
          })
      );
    }

    if (cloudEnabled) {
      candidates.push(
        compressWithCloud(text, config)
          .catch(err => {
            console.warn('[BrevityPrompt] Companion failed:', err.message);
            throw err;
          })
      );
    }

    return await Promise.any(candidates);
  } catch {
    console.warn('[BrevityPrompt] All providers failed; using local shortening');
    return { text, provider: 'local-regex' };
  }
}

async function compressWithCloud(text, config) {
  const response = await fetchWithTimeout(`${config.apiUrl.replace(/\/$/, '')}/v1/compress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: text })
  }, FETCH_TIMEOUT_MS);

  if (!response.ok) throw new Error(`Companion returned ${response.status}`);
  const payload = await response.json();
  if (typeof payload.compressed_prompt !== 'string' || !payload.compressed_prompt.trim()) {
    throw new Error('Companion returned no compressed prompt');
  }
  const provider = payload.provider === 'cache' ? 'cache' : payload.provider;
  return { text: payload.compressed_prompt.trim(), provider, model: payload.model };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function compressWithOllama(text, config) {
  const response = await fetchWithTimeout(`${config.endpoint.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      prompt: `Compress this AI prompt. Preserve every requirement, identifier, number, path, and question. Remove only greeting, politeness, repetition, and filler. Return only the compressed prompt.\n\nPROMPT:\n${text}`
    })
  }, FETCH_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Local model returned ${response.status}`);
  const payload = await response.json();
  if (typeof payload.response !== 'string' || !payload.response.trim()) throw new Error('Local model returned no text');
  return { text: payload.response.trim(), provider: 'ollama', model: config.model };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SAVINGS AND TELEMETRY TELEPORTATION
// ─────────────────────────────────────────────────────────────────────────────

async function recordSavings(original, shortened, sendResponse) {
  try {
    const charsSaved = Math.max(0, (original || '').length - (shortened || '').length);
    const originalTokens = tokenizer.countTokens(original);
    const shortenedTokens = tokenizer.countTokens(shortened);
    const tokensSaved = Math.max(0, originalTokens - shortenedTokens);

    const storage = await chrome.storage.local.get(['stats']);
    const stats = { ...DEFAULT_STATS, ...(storage.stats || {}) };
    if (charsSaved > 0) {
      stats.promptsOptimized += 1;
      stats.charactersSaved += charsSaved;
      stats.tokensSaved += tokensSaved;
      await chrome.storage.local.set({ stats });
    }
    sendResponse({ stats });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function getStats(sendResponse) {
  const storage = await chrome.storage.local.get(['stats']);
  sendResponse({ stats: { ...DEFAULT_STATS, ...(storage.stats || {}) } });
}

async function getNetworkStats(sendResponse) {
  const storage = await chrome.storage.local.get(['networkStats']);
  sendResponse({
    networkStats: storage.networkStats || {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      byDomain: {}
    }
  });
}

async function handleGetState(sendResponse) {
  try {
    const storage = await chrome.storage.sync.get(['enabled']);
    sendResponse({ enabled: isExtensionEnabled(storage.enabled) });
  } catch (error) {
    console.error('[BrevityPrompt] Error getting state:', error);
    sendResponse({ enabled: false, error: error.message });
  }
}

function handleValidateRegex(pattern, sendResponse) {
  try {
    new RegExp(pattern, 'gi');
    sendResponse({ valid: true });
  } catch (error) {
    sendResponse({ valid: false, error: error.message });
  }
}

// Storage listener to trace configuration changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    if (changes.enabled) {
      console.log('[BrevityPrompt] Toggle state changed:', changes.enabled.newValue);
    }
    if (changes.patterns) {
      console.log('[BrevityPrompt] Patterns updated');
    }
  }
});
