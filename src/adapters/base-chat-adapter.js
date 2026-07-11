/**
 * @file src/adapters/base-chat-adapter.js
 * @description Abstract base class for BrevityPrompt platform adapters.
 *
 * ┌─ Inheritance contract ───────────────────────────────────────────────────┐
 * │  ABSTRACT (must override):                                              │
 * │    locateComposer()       → Element | null                              │
 * │    locateSubmitButton()   → Element | null                              │
 * │                                                                         │
 * │  CONCRETE (inheritable, may override):                                  │
 * │    readText(el)           → string                                      │
 * │    writeText(el, text)    → Promise<void>  (React/ProseMirror safe)    │
 * │    submit(el)             → void                                        │
 * │    shouldInterceptKeydown(event, el) → boolean                         │
 * │                                                                         │
 * │  STATIC UTILITIES (callable on class or subclass):                     │
 * │    BaseChatAdapter.matchesAriaInput(el)   → boolean                    │
 * │    BaseChatAdapter.matchesAriaSubmit(el)  → boolean                    │
 * │    BaseChatAdapter.isEditable(el)         → boolean                    │
 * │    BaseChatAdapter.looksLikeChatInput(el) → boolean                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * HOW TO ADD A NEW PLATFORM
 * ─────────────────────────
 *  1. Create src/adapters/my-platform-adapter.js
 *  2. Declare: class MyPlatformAdapter extends BaseChatAdapter { … }
 *  3. Constructor: super({ name, hostname, enterSubmitsInTextarea })
 *  4. Implement locateComposer() using the three-layer strategy:
 *       a. Platform-specific CSS selectors (most stable first)
 *       b. BaseChatAdapter.matchesAriaInput() scan
 *       c. BaseChatAdapter.looksLikeChatInput() heuristic
 *  5. Implement locateSubmitButton() similarly.
 *  6. Register in src/content.js ADAPTER_REGISTRY array.
 *  7. Add the new file to manifest.json content_scripts js array (before content.js).
 *
 * DO NOT add chrome.* API calls or DOM queries to this file's constructor.
 * This file must be parseable in Node for syntax checking.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// ARIA patterns — accessibility contracts rarely change between site redesigns.
// ─────────────────────────────────────────────────────────────────────────────
const ARIA_INPUT_RE  = /message|prompt|chat|ask|compose|reply|input|type/i;
const ARIA_SUBMIT_RE = /send|submit|post/i;

// ─────────────────────────────────────────────────────────────────────────────
// Write-strategy constants
// ─────────────────────────────────────────────────────────────────────────────
const WRITE_MAX_RETRIES     = 3;
const WRITE_RETRY_DELAYS_MS = [0, 50, 150]; // ms before attempt 0, 1, 2

class BaseChatAdapter {
  // ── Constructor ────────────────────────────────────────────────────────────

  /**
   * @param {object} config
   * @param {string}  config.name                  Human-readable platform name
   * @param {string}  config.hostname               Domain substring to match (e.g. 'chatgpt.com')
   * @param {boolean} [config.enterSubmitsInTextarea=false]
   *   True if pressing Enter (no Shift) inside a <textarea> should trigger submit.
   *   For contenteditable composers this flag is ignored — Enter always submits.
   */
  constructor(config) {
    if (new.target === BaseChatAdapter) {
      throw new TypeError(
        'BaseChatAdapter is abstract. Instantiate a concrete subclass instead.'
      );
    }
    if (!config || !config.name || !config.hostname) {
      throw new TypeError('BaseChatAdapter config must include { name, hostname }');
    }

    this.name                   = config.name;
    this.hostname               = config.hostname;
    this.enterSubmitsInTextarea = config.enterSubmitsInTextarea === true;
  }

  // ── Abstract methods ───────────────────────────────────────────────────────

  /**
   * Locates the active composer/input element using a three-layer strategy:
   *   1. Platform-specific CSS selectors (most reliable for known DOM shapes)
   *   2. ARIA role/label scan (survives CSS-class redesigns)
   *   3. Proximity heuristic (catches unknown layouts)
   *
   * @returns {Element|null}
   */
  locateComposer() {
    throw new Error(`[BrevityPrompt][${this.name}] locateComposer() must be implemented`);
  }

  /**
   * Locates the active send/submit button.
   *
   * @returns {Element|null}
   */
  locateSubmitButton() {
    throw new Error(`[BrevityPrompt][${this.name}] locateSubmitButton() must be implemented`);
  }

  // ── Concrete shared methods ────────────────────────────────────────────────

  /**
   * Reads current text from the composer element.
   * Handles both <textarea>/<input> and contenteditable elements.
   *
   * @param {Element} el
   * @returns {string}
   */
  readText(el) {
    if (!el) return '';
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      return el.value != null ? el.value : '';
    }
    if (el.isContentEditable || el.contentEditable === 'true') {
      return el.innerText != null ? el.innerText : (el.textContent || '');
    }
    return '';
  }

  /**
   * Writes text into the composer element using a three-strategy approach
   * that is compatible with React controlled components and ProseMirror.
   *
   * Strategy 0 & 1 — execCommand('insertText'):
   *   Preferred by ProseMirror (Claude, Gemini) and Draft.js (older ChatGPT).
   *   Selects all content first, then inserts new text in one atomic operation.
   *
   * Strategy 2 — direct DOM + synthetic events:
   *   Last resort. Clears children, appends a text node, then dispatches the
   *   full event suite (beforeinput → input → change) that React 16/17/18 needs.
   *
   * After each attempt, verifies the content matches. Exits early on success.
   *
   * @param {Element} el   - Composer element
   * @param {string}  text - Text to inject
   * @returns {Promise<void>}
   */
  async writeText(el, text) {
    if (!el) return;
    const tag = el.tagName;

    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      await this._writeToInput(el, text);
    } else if (el.isContentEditable || el.contentEditable === 'true') {
      await this._writeToContentEditable(el, text);
    }
  }

  /**
   * Programmatically submits — finds the submit button and clicks it.
   * Subclasses may override if the platform uses a different mechanism
   * (e.g. Ctrl+Enter in a textarea, or a form.submit() call).
   *
   * @param {Element} _composerEl - Provided for subclass override use; unused here.
   */
  submit(_composerEl) {
    const btn = this.locateSubmitButton();
    if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
      btn.click();
      return;
    }
    console.warn(
      `[BrevityPrompt][${this.name}] submit(): could not find an enabled button`
    );
  }

  /**
   * Returns true if the given keydown event inside this composer should be
   * treated as a submit attempt that BrevityPrompt should intercept.
   *
   * Rules:
   *  - Shift+Enter always produces a newline — never intercept.
   *  - For contenteditable composers: plain Enter submits.
   *  - For <textarea>: only intercept if enterSubmitsInTextarea=true,
   *    or if Ctrl/Meta is held (common "force submit" shortcut).
   *
   * @param {KeyboardEvent} event
   * @param {Element}       el    - The composer element
   * @returns {boolean}
   */
  shouldInterceptKeydown(event, el) {
    if (event.key !== 'Enter') return false;
    if (event.shiftKey)        return false;            // Shift+Enter = newline

    const isTextarea = el && el.tagName === 'TEXTAREA';
    if (isTextarea) {
      // Ctrl+Enter / Cmd+Enter = force submit on any platform
      if (event.ctrlKey || event.metaKey) return true;
      return this.enterSubmitsInTextarea;
    }

    // contenteditable: plain Enter submits
    return true;
  }

  // ── Private write helpers ──────────────────────────────────────────────────

  /** React-safe setter for <textarea> / <input>. */
  async _writeToInput(el, text) {
    // Bypass React's synthetic-event system by calling the native setter.
    // This makes React re-render with the new value on the next event.
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, text);
    } else {
      el.value = text;
    }
    // Dispatch both events; React 16 needs 'input', React 17/18 also wants 'change'.
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** ProseMirror / Draft.js / contenteditable setter with 3 escalating strategies. */
  async _writeToContentEditable(el, text) {
    for (let attempt = 0; attempt < WRITE_MAX_RETRIES; attempt++) {
      // Wait before each retry (attempt 0 delay is 0ms — no delay)
      if (WRITE_RETRY_DELAYS_MS[attempt] > 0) {
        await this._wait(WRITE_RETRY_DELAYS_MS[attempt]);
      }

      el.focus();

      if (attempt <= 1) {
        // ── Strategy A: execCommand('insertText') ────────────────────────────
        // ProseMirror handles this natively; Draft.js also supports it.
        // Select all → insert replacement text in one atomic command.
        try {
          const sel   = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
          const applied = document.execCommand('insertText', false, text);
          if (applied && this._verifyText(el, text)) {
            this._fireFinalInputEvent(el, text);
            return;
          }
        } catch (_) {
          /* execCommand not available — fall through to next attempt */
        }

      } else {
        // ── Strategy B: direct DOM + full synthetic event suite ───────────────
        // React 18 with full StrictMode and synthetic pooling still responds
        // to a properly-sequenced beforeinput → input → change trio.
        try {
          while (el.firstChild) el.removeChild(el.firstChild);
          el.appendChild(document.createTextNode(text));

          el.dispatchEvent(
            new Event('beforeinput', { bubbles: true, cancelable: true })
          );
          el.dispatchEvent(
            new InputEvent('input', {
              bubbles: true, cancelable: true,
              inputType: 'insertText', data: text
            })
          );
          el.dispatchEvent(new Event('change', { bubbles: true }));

          if (this._verifyText(el, text)) {
            this._fireFinalInputEvent(el, text);
            return;
          }
        } catch (_) {
          // Absolute last resort
          try { el.textContent = text; } catch (_2) { /* nothing left to try */ }
        }
      }
    }

    // Ensure one final sync event regardless of verification result
    this._fireFinalInputEvent(el, text);

    if (!this._verifyText(el, text)) {
      console.warn(
        `[BrevityPrompt][${this.name}] writeText: content may not have applied correctly`
      );
    }
  }

  _fireFinalInputEvent(el, text) {
    try {
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true, cancelable: true,
          inputType: 'insertText', data: text
        })
      );
    } catch (_) { /* ignore — best-effort */ }
  }

  _verifyText(el, expected) {
    return this.readText(el).trim() === expected.trim();
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── Static ARIA / heuristic utilities ─────────────────────────────────────
  // Subclasses use these as detection fallback layers.
  // They are also called directly by content.js for submit-button checks.

  /**
   * Returns true if the element appears to be a chat composer field,
   * based on ARIA role and label attributes alone (no CSS classes).
   * @param {Element} el
   * @returns {boolean}
   */
  static matchesAriaInput(el) {
    if (!el) return false;
    const role        = el.getAttribute('role');
    const ariaLabel   = el.getAttribute('aria-label')   || '';
    const placeholder = el.getAttribute('placeholder')  || '';

    if (role === 'textbox' || role === 'combobox') return true;
    return ARIA_INPUT_RE.test(ariaLabel) || ARIA_INPUT_RE.test(placeholder);
  }

  /**
   * Returns true if the element appears to be a send/submit button,
   * based on ARIA label and text content.
   * @param {Element} el
   * @returns {boolean}
   */
  static matchesAriaSubmit(el) {
    if (!el) return false;
    const ariaLabel = el.getAttribute('aria-label') || '';
    if (ARIA_SUBMIT_RE.test(ariaLabel)) return true;

    const role = el.getAttribute('role');
    if ((role === 'button' || el.tagName === 'BUTTON') &&
        ARIA_SUBMIT_RE.test(el.textContent || '')) return true;

    return false;
  }

  /**
   * Returns true if the element can receive text input.
   * @param {Element} el
   * @returns {boolean}
   */
  static isEditable(el) {
    return !!(el && (
      el.tagName === 'TEXTAREA'       ||
      el.tagName === 'INPUT'          ||
      el.isContentEditable            ||
      el.contentEditable === 'true'
    ));
  }

  /**
   * Heuristic: is the element a visible editable field with a send button
   * somewhere in its ancestor tree? Used as the final fallback layer when
   * both CSS selectors and ARIA scans come up empty.
   * @param {Element} el
   * @returns {boolean}
   */
  static looksLikeChatInput(el) {
    if (!el || !BaseChatAdapter.isEditable(el)) return false;

    // Must be visible with reasonable dimensions
    const rect = el.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 20) return false;

    // Walk up to 6 ancestor levels looking for a nearby submit button
    let parent = el.parentElement;
    for (let depth = 0; depth < 6 && parent; depth++) {
      const btn = parent.querySelector(
        'button[type="submit"], button[aria-label*="Send" i], button[aria-label*="submit" i]'
      );
      if (btn) return true;
      parent = parent.parentElement;
    }
    return false;
  }
}
