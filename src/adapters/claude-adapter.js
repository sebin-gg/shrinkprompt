/**
 * @file src/adapters/claude-adapter.js
 * @description Adapter for Claude.ai (claude.ai).
 *
 * DOM notes (as of 2025–2026):
 * ─────────────────────────────
 * • Composer: a ProseMirror contenteditable <div class="ProseMirror">.
 *   It sits inside a <fieldset> and carries role="textbox" plus
 *   aria-label="Write your prompt to Claude" (label text may localise).
 *
 * • Submit button: <button aria-label="Send Message">.
 *   May be disabled while input is empty; the adapter filters disabled buttons.
 *
 * • Enter key: submits the message. Shift+Enter produces a newline.
 *   enterSubmitsInTextarea=true is set for completeness, though Claude
 *   exclusively uses a contenteditable composer.
 *
 * Write strategy notes:
 * ─────────────────────
 *   ProseMirror is the first-class target of the execCommand('insertText')
 *   strategy inherited from BaseChatAdapter. The library monkey-patches the
 *   document's execCommand to route text through its own transaction system,
 *   so strategy A (execCommand after selectAll) is almost always sufficient.
 *
 *   If Claude migrates away from ProseMirror in the future, strategy B
 *   (direct DOM + InputEvent suite) in BaseChatAdapter will handle it.
 */

'use strict';

class ClaudeAdapter extends BaseChatAdapter {
  constructor() {
    super({
      name: 'Claude',
      hostname: 'claude.ai',
      enterSubmitsInTextarea: true
    });

    this._composerSelectors = [
      // ProseMirror class is the most reliable signal for Claude
      'div[contenteditable="true"].ProseMirror',
      // Scoped within Claude's fieldset wrapper
      'fieldset div[contenteditable="true"]',
      // ARIA role with label
      '[role="textbox"][aria-label]',
      // Occasional legacy textarea fallback
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="Claude" i]',
      // Widest contenteditable net — used last
      '[contenteditable="true"]'
    ];

    this._submitSelectors = [
      'button[aria-label*="Send Message" i]',
      'button[aria-label*="Send" i]',
      'button[type="submit"]'
    ];
  }

  // ── Abstract implementation ────────────────────────────────────────────────

  /**
   * Three-layer composer location:
   *   1. CSS selectors (ProseMirror class + fieldset scope)
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
   *   1. aria-label "Send Message" / "Send" selectors
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
