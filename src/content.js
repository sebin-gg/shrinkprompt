/**
 * @file src/content.js
 * @description BrevityPrompt DOM interception engine — platform-agnostic orchestrator.
 *
 * This file contains ZERO platform-specific code. All DOM interactions are
 * delegated to the adapter layer (src/adapters/). To add support for a new
 * chat platform, create a new adapter file and register it in ADAPTER_REGISTRY
 * below. See BaseChatAdapter for the full implementation guide.
 *
 * ┌─ Load order (manifest.json content_scripts) ────────────────────────────┐
 * │  1. src/adapters/base-chat-adapter.js                                  │
 * │  2. src/adapters/chatgpt-adapter.js                                    │
 * │  3. src/adapters/claude-adapter.js                                     │
 * │  4. src/adapters/gemini-adapter.js                                     │
 * │  5. src/shortener.js       (content-script shim, Phase 2 target)      │
 * │  6. src/preview-modal.js                                               │
 * │  7. src/dashboard.js                                                   │
 * │  8. src/content.js         ← this file                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Infinite-loop prevention ───────────────────────────────────────────────┐
 * │  After the user chooses an action, BrevityPrompt must re-fire the       │
 * │  submit. That programmatic submit must NOT be re-intercepted.           │
 * │                                                                         │
 * │  Two-layer guard:                                                       │
 * │   Layer 1 — `isIntercepting` flag                                       │
 * │     Set TRUE before any async work; cleared in finally{}.               │
 * │     btn.click() fires synchronously; isIntercepting is still TRUE →     │
 * │     all listeners return immediately. No re-entry.                      │
 * │                                                                         │
 * │   Layer 2 — `bypassCount` counter                                       │
 * │     armBypass(n) increments before calling adapter.submit().            │
 * │     After isIntercepting clears, consumeBypass() drains the counter.   │
 * │     Handles any events arriving slightly after isIntercepting clears.   │
 * │                                                                         │
 * │   Legacy layer — `window.__brevityBypassNext`                           │
 * │     Honoured for the dashboard's "Arm bypass" button (Alt+Shift+B).    │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

(function () {
  'use strict';

  // ── Double-injection guard ─────────────────────────────────────────────────
  // SPAs may trigger multiple DOMContentLoaded-equivalent events during
  // client-side navigation. This ensures initialization runs exactly once.
  if (window.__brevityContentInstalled) {
    return;
  }
  window.__brevityContentInstalled = true;

  // ── Adapter registry ───────────────────────────────────────────────────────
  // Add new platform adapters here. Adapters are evaluated in order; the first
  // whose .hostname is found in the current page's hostname wins.
  //
  // The adapter classes are available because their files are loaded before
  // this script in the manifest.json content_scripts js array.
  const ADAPTER_REGISTRY = [
    new ChatGPTAdapter(),
    new ClaudeAdapter(),
    new GeminiAdapter()
  ];

  // ── Module state ───────────────────────────────────────────────────────────
  let adapter          = null;   // Resolved platform adapter for this page
  let extensionEnabled = false;  // Mirrors chrome.storage.sync 'enabled'

  /** True while an interception async flow is in progress. See header notes. */
  let isIntercepting = false;

  /** Last good composer reference. Invalidated when the element disconnects. */
  let cachedComposer = null;

  // ── Bypass counter & helpers ───────────────────────────────────────────────

  let bypassCount = 0;

  /**
   * Arms the bypass for the next `n` submit events that would otherwise be
   * intercepted. Call this immediately before adapter.submit().
   */
  function armBypass(n) {
    bypassCount += (n || 1);
  }

  /**
   * Returns true and decrements the counter if a bypass is pending, or if
   * the legacy window flag / dashboard bypass is set.
   */
  function consumeBypass() {
    if (bypassCount > 0) {
      bypassCount--;
      return true;
    }
    if (window.__brevityBypassNext === true) {
      window.__brevityBypassNext = false;
      return true;
    }
    if (typeof BrevityDashboard !== 'undefined' && BrevityDashboard.consumeBypass()) {
      return true;
    }
    return false;
  }

  // ── Adapter resolution ─────────────────────────────────────────────────────

  function resolveAdapter() {
    const hostname = window.location.hostname;
    return ADAPTER_REGISTRY.find(a => hostname.includes(a.hostname)) || null;
  }

  // ── Composer lookup ────────────────────────────────────────────────────────

  /**
   * Returns the active composer element, using the cached reference when valid.
   * If the cached element has been removed from the DOM (SPA navigation),
   * falls back to adapter.locateComposer() and refreshes the cache.
   */
  function getComposer() {
    if (cachedComposer && cachedComposer.isConnected) {
      // Quick validation: confirm the adapter still agrees this is the composer
      const live = adapter.locateComposer();
      if (live === cachedComposer) return cachedComposer;
    }
    // Cache miss or mismatch — re-discover
    cachedComposer = adapter.locateComposer();
    return cachedComposer;
  }

  // ── Central event interceptor ──────────────────────────────────────────────

  /**
   * Synchronously cancels the native browser event, then hands off to the
   * async interception flow. Called by all three listener paths (submit,
   * click, keydown) after they have validated the event is relevant.
   *
   * @param {Event}   event
   * @param {Element} composer
   */
  function interceptEvent(event, composer) {
    // Both guards checked together (either alone would suffice, but belt+braces)
    if (isIntercepting || consumeBypass()) return;

    // Cancel the native event SYNCHRONOUSLY before any async work so the
    // host application cannot process the submit before we finish.
    event.preventDefault();
    event.stopImmediatePropagation();

    // Kick off the async pipeline (fire-and-forget; errors caught inside)
    runInterceptionFlow(composer);
  }

  // ── Async interception pipeline ────────────────────────────────────────────

  /**
   * The full interception flow:
   *   1. Read original text from composer
   *   2. Request regex-cleaned version from background service worker
   *   3. If text changed: show preview modal, await user choice
   *   4. If not changed: re-fire submit unchanged (no modal)
   *   5. Execute user's choice (send original / send shortened / edit / cancel)
   *
   * The `isIntercepting` flag remains true for the entire async duration,
   * blocking any re-entry from events fired during steps 2–5.
   *
   * @param {Element} composer
   */
  async function runInterceptionFlow(composer) {
    isIntercepting = true;
    window.__brevityLastUpgrade = null;

    try {
      const originalText = adapter.readText(composer).trim();

      // Empty composer — re-arm and re-submit without processing
      if (!originalText) {
        armBypass(1);
        adapter.submit(composer);
        await _wait(80);
        return;
      }

      showWorkingOverlay('Shortening prompt\u2026');
      const result = await sendCleanRequest(originalText);
      hideWorkingOverlay();

      // Update dashboard AI provider label if known
      if (typeof BrevityDashboard !== 'undefined' && result.provider) {
        BrevityDashboard.setProvider(result.provider);
        BrevityDashboard.refreshStats();
      }

      if (result.cleaned && result.original !== result.shortened) {
        // Text was meaningfully changed — show the preview modal
        const choice = await showPreviewModal(result.original, result.shortened, {
          provider:   result.provider,
          model:      result.model,
          mayUpgrade: result.mayUpgrade,
          originalTokens: result.originalTokens,
          shortenedTokens: result.shortenedTokens
        });

        // A semantic upgrade may have landed while the modal was open
        const upgrade       = window.__brevityLastUpgrade;
        const finalShortened = (choice === 'send_shortened' && upgrade)
          ? upgrade.shortened : result.shortened;
        const finalOriginal  = upgrade ? upgrade.original : result.original;

        await executeChoice(choice, composer, finalOriginal, finalShortened);

      } else {
        // Nothing changed — the original event was already blocked, so we
        // must re-fire submit to avoid silently swallowing the prompt.
        armBypass(1);
        adapter.submit(composer);
        await _wait(80);
      }

    } catch (err) {
      console.error('[BrevityPrompt] Interception flow error:', err);
      hideWorkingOverlay();
    } finally {
      isIntercepting = false;
      hideWorkingOverlay();
      window.__brevityLastUpgrade = null;
    }
  }

  // ── Choice executor ────────────────────────────────────────────────────────

  /**
   * Acts on the user's choice from the preview modal.
   *
   * 'send_shortened' — write cleaned text into composer, record savings, submit
   * 'send_original'  — submit without modifying composer text
   * 'edit'           — write cleaned text, focus composer, let user review
   * 'cancel'         — do nothing; user's original text stays in the composer
   *
   * @param {string}  choice
   * @param {Element} composer
   * @param {string}  original
   * @param {string}  shortened
   */
  async function executeChoice(choice, composer, original, shortened) {
    switch (choice) {

      case 'send_shortened':
        await adapter.writeText(composer, shortened);
        // Record savings asynchronously — do not block the submit
        chrome.runtime.sendMessage({
          action:    'recordSavings',
          original,
          shortened
        });
        armBypass(1);
        adapter.submit(composer);
        await _wait(80);
        break;

      case 'send_original':
        armBypass(1);
        adapter.submit(composer);
        await _wait(80);
        break;

      case 'edit':
        // Write shortened text into composer so the user can review it.
        // When they submit manually, the flow will run again on the
        // already-shortened text (minimal change expected).
        await adapter.writeText(composer, shortened);
        composer.focus?.();
        break;

      case 'cancel':
      default:
        // No-op: user retains their original text in the composer.
        break;
    }
  }

  // ── DOM event listeners ────────────────────────────────────────────────────

  function attachListeners() {

    // ── 1. Form submit (native form elements) ──────────────────────────────
    document.addEventListener('submit', (e) => {
      if (!extensionEnabled) return;
      const composer = getComposer();
      if (!composer) return;
      interceptEvent(e, composer);
    }, true); // capture phase ensures we run before the host application

    // ── 2. Send button click ───────────────────────────────────────────────
    document.addEventListener('click', (e) => {
      if (!extensionEnabled || isIntercepting) return;

      // Walk up to find a <button> ancestor (handles SVG icon clicks)
      const btn = e.target.closest?.('button');
      if (!btn) return;

      // Only proceed if this is the platform's designated submit button
      const submitBtn = adapter.locateSubmitButton();
      if (btn !== submitBtn && !BaseChatAdapter.matchesAriaSubmit(btn)) return;

      const composer = getComposer();
      if (!composer) return;

      interceptEvent(e, composer);
    }, true);

    // ── 3. Enter key press ─────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
      if (!extensionEnabled || isIntercepting) return;

      const composer = getComposer();
      if (!composer) return;

      // Only intercept if the keydown originates from inside the composer
      const target = e.target;
      if (target !== composer && !composer.contains(target)) return;

      if (adapter.shouldInterceptKeydown(e, composer)) {
        interceptEvent(e, composer);
      }
    }, true);

    // ── 4. Focus tracking — keep cachedComposer warm ──────────────────────
    document.addEventListener('focusin', (e) => {
      const composer = adapter.locateComposer();
      if (composer && (e.target === composer || composer.contains(e.target))) {
        cachedComposer = composer;
      }
    }, true);
  }

  // ── Storage & message listeners ────────────────────────────────────────────

  function attachExtensionListeners() {

    // Sync enabled state with background / popup changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.enabled) return;
      extensionEnabled = changes.enabled.newValue === true;
      console.log(`[BrevityPrompt] Extension state → ${extensionEnabled}`);
      if (typeof BrevityDashboard !== 'undefined') {
        BrevityDashboard.setEnabled(extensionEnabled);
      }
    });

    // Semantic upgrade push from background service worker.
    // Arrives after the preview modal is already showing the local-regex
    // result; hot-swaps in the superior semantic version.
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action !== 'semanticUpgrade') return;

      console.log('[BrevityPrompt] Semantic upgrade received via', msg.provider);

      if (typeof BrevityPreviewModal !== 'undefined') {
        BrevityPreviewModal.update(msg.original, msg.shortened, {
          provider: msg.provider,
          model:    msg.model,
          originalTokens: msg.originalTokens,
          shortenedTokens: msg.shortenedTokens
        });
      }
      if (typeof BrevityDashboard !== 'undefined' && msg.provider) {
        BrevityDashboard.setProvider(msg.provider);
        BrevityDashboard.refreshStats();
      }

      // Stash so executeChoice can record correct savings after modal closes
      window.__brevityLastUpgrade = {
        original:  msg.original,
        shortened: msg.shortened,
        provider:  msg.provider,
        model:     msg.model
      };
    });
  }

  // ── MutationObserver ───────────────────────────────────────────────────────

  /**
   * Watches for DOM changes caused by SPA navigation (route changes, dialog
   * opens, etc.) that may replace the composer element. Debounced at 120ms
   * to avoid hammering during rapid DOM batches.
   */
  function attachMutationObserver() {
    let debounceTimer = null;

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (cachedComposer && cachedComposer.isConnected) return; // still valid
        const found = adapter.locateComposer();
        if (found) {
          cachedComposer = found;
          console.log('[BrevityPrompt] MutationObserver: new composer discovered');
        }
      }, 120);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Working overlay ────────────────────────────────────────────────────────

  function showWorkingOverlay(message) {
    hideWorkingOverlay();
    const el = document.createElement('div');
    el.id = 'brevity-working-overlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = message || 'Working\u2026';
    Object.assign(el.style, {
      position:     'fixed',
      bottom:       '24px',
      right:        '24px',
      zIndex:       '999998',
      background:   '#111827',
      color:        '#f9fafb',
      padding:      '12px 16px',
      borderRadius: '8px',
      font:         '600 13px/1.4 system-ui,sans-serif',
      boxShadow:    '0 8px 24px rgba(0,0,0,.25)',
      maxWidth:     '280px'
    });
    document.documentElement.appendChild(el);
  }

  function hideWorkingOverlay() {
    document.getElementById('brevity-working-overlay')?.remove();
  }

  // ── Background messaging ───────────────────────────────────────────────────

  function sendCleanRequest(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'cleanPrompt', text }, (response) => {
        if (chrome.runtime.lastError) {
          // Service worker not reachable — degrade gracefully (pass text through)
          resolve({ original: text, shortened: text, cleaned: false });
          return;
        }
        resolve(response || { original: text, shortened: text, cleaned: false });
      });
    });
  }

  function showPreviewModal(original, shortened, meta) {
    if (typeof BrevityPreviewModal !== 'undefined') {
      return BrevityPreviewModal.show(original, shortened, meta);
    }
    // Modal not available — auto-send shortened text as safe fallback
    console.warn('[BrevityPrompt] Preview modal not loaded; auto-sending shortened text');
    return Promise.resolve('send_shortened');
  }

  function _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  async function initialize() {
    adapter = resolveAdapter();
    if (!adapter) {
      console.warn('[BrevityPrompt] No adapter matched hostname:', window.location.hostname);
      return;
    }

    // Read initial enabled state from storage
    try {
      const stored = await chrome.storage.sync.get(['enabled']);
      extensionEnabled = stored.enabled === true;
    } catch (_) {
      extensionEnabled = false;
    }

    console.log(
      `[BrevityPrompt] Initialized — adapter: ${adapter.name},`,
      `enabled: ${extensionEnabled}`
    );

    // Initialize dashboard HUD if available
    if (typeof BrevityDashboard !== 'undefined') {
      BrevityDashboard.init(extensionEnabled);
    }

    attachListeners();
    attachExtensionListeners();
    attachMutationObserver();
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    // DOM already ready (e.g. script injected after page load)
    initialize();
  }

})(); // end IIFE — no global scope pollution
