/**
 * @file src/adapters/chatgpt-adapter.js
 * @description Adapter for ChatGPT (chatgpt.com / chat.openai.com).
 *
 * DOM notes (as of 2025–2026):
 * ─────────────────────────────
 * • Composer: a contenteditable <div id="prompt-textarea">.
 *   Despite the "-textarea" suffix, it is NOT a <textarea> element.
 *   It uses React's synthetic event system via a Lexical editor.
 *
 * • Submit button: <button data-testid="send-button">.
 *   Falls back to aria-label="Send message" when the test-id is absent.
 *
 * • Enter key: submits the form. Shift+Enter inserts a newline.
 *   enterSubmitsInTextarea is irrelevant here (composer is contenteditable).
 *
 * Write strategy notes:
 * ─────────────────────
 *   Lexical editor (ChatGPT's current editor) responds to:
 *   1. execCommand('insertText') after a selectAll range — preferred path.
 *   2. If that fails: direct DOM clear + InputEvent('input', {inputType:'insertText'}).
 *   BaseChatAdapter._writeToContentEditable already handles both via its retry loop.
 */

'use strict';

class ChatGPTAdapter extends BaseChatAdapter {
  constructor() {
    super({
      name: 'ChatGPT',
      // Matches both chatgpt.com and the legacy chat.openai.com redirect
      hostname: 'chatgpt.com',
      // Composer is contenteditable — the textarea flag is unused here,
      // but set false for documentation clarity.
      enterSubmitsInTextarea: false
    });

    // Layered CSS selectors: most-specific → most-generic.
    // New selectors should be inserted at the top of the list.
    this._composerSelectors = [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'div[contenteditable="true"]#prompt-textarea',
      '[contenteditable="true"][data-placeholder]',
      '[role="textbox"][aria-label]',
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="Ask" i]',
      '[contenteditable="true"]'
    ];

    this._submitSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send message" i]',
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
      'button[type="submit"]'
    ];
  }

  // ── Abstract implementation ────────────────────────────────────────────────

  /**
   * Three-layer composer location:
   *   1. CSS selectors (specific IDs and test IDs from ChatGPT's DOM)
   *   2. ARIA role="textbox" / matching aria-label scan
   *   3. Proximity heuristic (visible editable near a send button)
   *
   * @returns {Element|null}
   */
  locateComposer() {
    // Layer 1 — CSS selectors
    for (const sel of this._composerSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && BaseChatAdapter.isEditable(el)) return el;
      } catch (_) { /* malformed selector — skip */ }
    }

    // Layer 2 — ARIA scan
    const ariaFields = document.querySelectorAll(
      '[role="textbox"], [role="combobox"], [contenteditable="true"], textarea'
    );
    for (const el of ariaFields) {
      if (BaseChatAdapter.matchesAriaInput(el) && BaseChatAdapter.isEditable(el)) {
        return el;
      }
    }

    // Layer 3 — proximity heuristic
    for (const el of document.querySelectorAll('[contenteditable="true"], textarea')) {
      if (BaseChatAdapter.looksLikeChatInput(el)) return el;
    }

    return null;
  }

  /**
   * Two-layer submit button location.
   *   1. CSS selectors (data-testid is most stable for ChatGPT)
   *   2. ARIA scan of all <button> elements
   *
   * @returns {Element|null}
   */
  locateSubmitButton() {
    // Layer 1 — CSS selectors (enabled buttons only)
    for (const sel of this._submitSelectors) {
      try {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
          return btn;
        }
      } catch (_) { /* skip */ }
    }

    // Layer 2 — ARIA scan
    for (const btn of document.querySelectorAll('button')) {
      if (
        BaseChatAdapter.matchesAriaSubmit(btn) &&
        !btn.disabled &&
        btn.getAttribute('aria-disabled') !== 'true'
      ) {
        return btn;
      }
    }

    return null;
  }
}
