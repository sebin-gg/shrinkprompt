/**
 * @file src/adapters/gemini-adapter.js
 * @description Adapter for Google Gemini (gemini.google.com).
 *
 * DOM notes (as of 2025–2026):
 * ─────────────────────────────
 * • Composer: a contenteditable <div> nested inside a custom element
 *   <rich-textarea>. It carries role="textbox" and an aria-label such as
 *   "Enter a prompt here".  Google may also render it directly under a
 *   <div aria-label="Chat input"> container (layout variant).
 *
 * • Submit button: <button aria-label="Send message"> or
 *   <button aria-label="Submit">.  The label text may be localised,
 *   so the ARIA-scan fallback is especially important here.
 *
 * • Enter key: submits the message. Shift+Enter produces a newline.
 *
 * • The editor is implemented in Angular (not React/ProseMirror), but it
 *   still uses a contenteditable div, so the BaseChatAdapter write strategy
 *   applies without any Angular-specific changes.
 *
 * Write strategy notes:
 * ─────────────────────
 *   Angular's ContentEditable directive listens for 'input' events after
 *   DOM mutations. execCommand('insertText') fires both the mutation and
 *   the 'input' event atomically, making it the preferred strategy.
 *   If execCommand fails (e.g. Chrome 113+ with permissions policy), the
 *   BaseChatAdapter strategy B (DOM clear + InputEvent) picks it up.
 */

'use strict';

class GeminiAdapter extends BaseChatAdapter {
  constructor() {
    super({
      name: 'Gemini',
      hostname: 'gemini.google.com',
      enterSubmitsInTextarea: true
    });

    this._composerSelectors = [
      // Most reliable: the contenteditable inside the custom <rich-textarea> element
      'rich-textarea [contenteditable="true"]',
      'rich-textarea div[contenteditable]',
      // Direct contenteditable with an aria-label (layout variants)
      'div[contenteditable="true"][aria-label]',
      // Role textbox with aria-label
      '[role="textbox"][aria-label]',
      // Placeholder-based fallbacks
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="Enter" i]',
      // Widest net — last resort
      '[contenteditable="true"]'
    ];

    this._submitSelectors = [
      'button[aria-label*="Send message" i]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="Submit" i]',
      'button[type="submit"]',
      // Gemini sometimes uses mat-icon-button (Angular Material)
      'button.send-button',
      'button[jsname]'
    ];
  }

  // ── Abstract implementation ────────────────────────────────────────────────

  /**
   * Three-layer composer location:
   *   1. CSS selectors (rich-textarea custom element path is highest priority)
   *   2. ARIA role="textbox" / aria-label matching
   *   3. Proximity heuristic
   *
   * @returns {Element|null}
   */
  locateComposer() {
    // Layer 1 — CSS selectors
    for (const sel of this._composerSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && BaseChatAdapter.isEditable(el)) return el;
      } catch (_) { /* skip */ }
    }

    // Layer 2 — ARIA scan
    const ariaFields = document.querySelectorAll(
      '[role="textbox"], [contenteditable="true"], textarea'
    );
    for (const el of ariaFields) {
      if (BaseChatAdapter.matchesAriaInput(el) && BaseChatAdapter.isEditable(el)) {
        return el;
      }
    }

    // Layer 3 — heuristic
    for (const el of document.querySelectorAll('[contenteditable="true"], textarea')) {
      if (BaseChatAdapter.looksLikeChatInput(el)) return el;
    }

    return null;
  }

  /**
   * Two-layer submit button location.
   *   1. aria-label based selectors (localisation-aware via case-insensitive)
   *   2. ARIA scan of all <button> elements
   *
   * @returns {Element|null}
   */
  locateSubmitButton() {
    // Layer 1 — CSS selectors
    for (const sel of this._submitSelectors) {
      try {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
          return btn;
        }
      } catch (_) { /* skip */ }
    }

    // Layer 2 — ARIA scan (important for localised button labels)
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
