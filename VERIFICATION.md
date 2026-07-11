# VERIFICATION CHECKLIST

Use this checklist to verify everything works correctly before using the extension.

## Pre-Installation ✅

### File Structure
- [ ] `manifest.json` exists in root
- [ ] `src/` folder contains all 12 JavaScript/HTML/CSS files
- [ ] `icons/icon.svg` exists
- [ ] `README.md`, `INSTALL.md`, `QUICKREF.md` exist
- [ ] `.gitignore` exists

### Source Files
- [ ] `src/background.js` (service worker) ~275 lines
- [ ] `src/content.js` (platform integration) ~420 lines
- [ ] `src/shortener.js` (regex logic) ~75 lines
- [ ] `src/sniffer.js` (MAIN world fetch/XHR observer) ~185 lines
- [ ] `src/dashboard.js` (Shadow DOM token HUD) ~210 lines
- [ ] `src/popup.html/js/css` (toggle UI) ~3 files
- [ ] `src/settings.html/js/css` (settings page) ~3 files
- [ ] `src/preview-modal.js` (comparison UI) ~380 lines

## Installation Steps ✅

### Icon Generation
- [ ] Run `bash generate-icons.sh` (or use online tool)
- [ ] Verify three PNG files exist:
  - [ ] `icons/icon-16.png`
  - [ ] `icons/icon-48.png`
  - [ ] `icons/icon-128.png`

### Chrome Extension Loading
- [ ] Go to `chrome://extensions/`
- [ ] Enable **Developer mode** (top-right toggle)
- [ ] Click **Load unpacked**
- [ ] Select repo root folder (contains `manifest.json`; may be named `shrinkprompt`)
- [ ] Extension appears in extensions list
- [ ] Extension appears in toolbar (top-right)
- [ ] Extension listed; processing still **off** until popup toggle on
- [ ] No red error messages
- [ ] Toolbar icon uses `default_icon` PNGs

## First-Time Configuration ✅

### Toggle & Popup
- [ ] Click extension icon in toolbar
- [ ] Popup window appears
- [ ] **ON/OFF toggle visible** (default unchecked / Disabled)
- [ ] Savings stats section visible (estimates)
- [ ] Click Settings button (opens options page)
- [ ] Popup shows "Enabled/Disabled" text correctly

### Settings Page
- [ ] Settings page loads without errors
- [ ] **Patterns tab** shows all 4 categories:
  - [ ] Greetings (with checkbox)
  - [ ] Politeness (with checkbox)
  - [ ] Fillers (with checkbox)
  - [ ] Closings (with checkbox)
- [ ] Each category shows regex pattern text input
- [ ] **Reset to Defaults** button present
- [ ] **Save Changes** button present
- [ ] **AI Models tab** loads: Ollama fields, companion URL, min characters, Save AI
- [ ] Companion URL rejects non-localhost hosts
- [ ] **About tab** loads correctly

### Companion (optional)
- [ ] `.env.example` present; `.env` with key for real Fireworks demo
- [ ] `podman compose up --build` (or docker) starts service on :8000
- [ ] `GET /health` returns `status: ok`
- [ ] Long prompt (≥ min chars) with cloud on can hit companion; offline falls back

## Feature Testing ✅

### Extension Toggle
- [ ] Click extension icon
- [ ] Toggle switch works (ON → OFF → ON)
- [ ] State persists after reloading popup
- [ ] State persists after browser restart

### Shortening Workflow
Test on each platform:

#### ChatGPT (chatgpt.com)
- [ ] Open ChatGPT and ensure logged in
- [ ] Extension toggle is **ON**
- [ ] Type test prompt:
  ```
  Hi! I was wondering if you could please explain 
  machine learning for beginners. Thanks so much!
  ```
- [ ] Press **Enter** or click **Send**
- [ ] **Preview modal appears** with:
  - [ ] Original text on left (shows full prompt)
  - [ ] Shortened text on right (removes social fluff)
  - [ ] Character savings displayed (~60 chars saved)
  - [ ] Percentage reduction shown (~50%)
- [ ] **Send Shortened** button works
  - [ ] Modal closes
  - [ ] Shortened text is sent
  - [ ] AI responds to shortened version
- [ ] Toggle OFF and test that no modal appears on send
- [ ] Toggle back ON

#### Claude (claude.ai)
- [ ] Open Claude.ai and ensure logged in
- [ ] Enable extension toggle
- [ ] Test the same prompt as above
- [ ] Preview modal appears correctly
- [ ] **Send Original** button works
  - [ ] Modal closes
  - [ ] Original prompt is sent
  - [ ] AI responds to full original text
- [ ] **Edit & Send** button works
  - [ ] Modal closes
  - [ ] Shortened text populates input field
  - [ ] Can edit the shortened text
  - [ ] Pressing Enter again sends the edited version

#### Gemini (gemini.google.com)
- [ ] Open Gemini and ensure logged in
- [ ] Enable extension toggle
- [ ] Test the same prompt
- [ ] Verify modal appears and behaves correctly
- [ ] Test **Cancel** button
  - [ ] Modal closes
  - [ ] No message is sent
  - [ ] Can click Send again

### Modal Interactions
- [ ] **Keyboard Navigation:**
  - [ ] Tab key cycles through buttons
  - [ ] Enter activates focused button
  - [ ] Escape closes modal (cancels)
- [ ] **Mouse Interactions:**
  - [ ] All buttons are clickable
  - [ ] Buttons have hover effects
  - [ ] Close (X) button works
- [ ] **Comparison Display:**
  - [ ] Text is properly escaped (no HTML injection)
  - [ ] Long prompts can be scrolled
  - [ ] Formatting preserved in display

### Token Dashboard & Network Sniffer
- [ ] **Dashboard Visibility:**
  - [ ] Dashboard HUD panel visible on chat page (top-right corner)
  - [ ] Shows current status (ON when extension active, OFF when disabled)
  - [ ] Shows "Session req", "≈ tokens out", "Saved (local)", and "Last path"
- [ ] **Draggability:**
  - [ ] Grab the dashboard title bar and drag it to another location on the screen
- [ ] **Dashboard Controls:**
  - [ ] Click "Arm bypass (1 send)" button -> status changes to "BYPASS" (orange badge)
  - [ ] Click "Hide" button -> dashboard panel disappears
- [ ] **Hotkeys:**
  - [ ] Press **Alt+Shift+D** -> dashboard toggles visibility (shows/hides)
  - [ ] Press **Alt+Shift+B** -> arms one-send bypass (dashboard badge changes to "BYPASS"). Sending a prompt now bypasses the preview modal and goes straight through.
  - [ ] Press **Alt+Shift+K** -> triggers abort bridge to cancel in-flight network requests
- [ ] **Network Sniffer Integration:**
  - [ ] Send a message -> "Session req" count increments by 1
  - [ ] "≈ tokens out" updates with estimated tokens sent
  - [ ] "Last path" shows correct provider (e.g., `local-regex`, `fireworks`, `ollama`)

### Settings Page Features
- [ ] **Enable/Disable Patterns:**
  - [ ] Uncheck a pattern (e.g., Greetings)
  - [ ] Click Save Changes
  - [ ] Go back to chat, send prompt
  - [ ] Modal shows that pattern wasn't applied
- [ ] **Edit Pattern:**
  - [ ] Edit a regex pattern
  - [ ] Save (should validate syntax)
  - [ ] Test sending a prompt
  - [ ] Custom pattern works
- [ ] **Invalid Regex:**
  - [ ] Enter invalid regex (e.g., `(unclosed`)
  - [ ] Should show error message
  - [ ] Should not allow saving
- [ ] **Reset to Defaults:**
  - [ ] Modify patterns
  - [ ] Click "Reset to Defaults"
  - [ ] Confirm in dialog
  - [ ] Patterns return to original values

## Edge Cases ✅

### Prompt Edge Cases
- [ ] **Empty prompt:** Press Send with no text
  - [ ] Modal should NOT appear
  - [ ] No errors in console
- [ ] **Already clean prompt:** Send "Explain recursion"
  - [ ] Modal appears (comparing text)
  - [ ] Shortened version is the same as original
  - [ ] User can still choose which to send
- [ ] **Very long prompt:** Send 5000+ character prompt
  - [ ] Modal loads without freezing
  - [ ] Text is readable and scrollable
  - [ ] Extension doesn't crash
- [ ] **Special characters:** Include quotes, punctuation, emojis
  - [ ] Text is properly displayed in modal
  - [ ] Sent correctly to AI platform
- [ ] **Multiple spaces/newlines:**
  - [ ] Cleaned properly (excess whitespace removed)
  - [ ] Readability maintained

### Platform Edge Cases
- [ ] **Multiple chat tabs open:**
  - [ ] Toggle affects all tabs
  - [ ] Each tab can send independently
- [ ] **Browser extension disabled/reloaded:**
  - [ ] Reload extension from chrome://extensions
  - [ ] Test again (should work normally)
- [ ] **Tab navigation:**
  - [ ] Navigate away from ChatGPT and back
  - [ ] Extension still works
  - [ ] Settings changes persist

## Browser Console ✅

Open DevTools (F12) → Console tab and verify:

### On Page Load
- [ ] `[BrevityPrompt] Content script loaded on chatgpt.com` (or other domain)
- [ ] No red error messages
- [ ] No yellow warning messages (except external libraries)

### On Toggle
- [ ] `[BrevityPrompt] Toggle state changed: true/false`

### On Sending Prompt
- [ ] `[BrevityPrompt] Input field focused` (or similar)
- [ ] No JavaScript errors

## Performance ✅

- [ ] Extension loads without noticeable delay
- [ ] Modal appears in <500ms after pressing Enter
- [ ] Switching between patterns doesn't lag
- [ ] Settings page loads quickly
- [ ] Browser doesn't show "Not responding"

## Device Storage ✅

Open DevTools → Application → Storage:
- [ ] Chrome storage contains `enabled` flag
- [ ] Chrome storage contains `patterns` object
- [ ] Settings persist after browser close/restart
- [ ] Clearing storage requires explicit reset

## Accessibility ✅

### Keyboard Navigation
- [ ] All popup buttons accessible via Tab
- [ ] Modal buttons all reachable via Tab
- [ ] Settings form fields all keyboard accessible

### Screen Reader (optional)
- [ ] ARIA labels present on buttons
- [ ] Headings properly structured
- [ ] Form labels associated with inputs

## Documentation ✅

- [ ] README.md is comprehensive (~400 lines)
- [ ] INSTALL.md has clear setup steps (~200 lines)
- [ ] QUICKREF.md provides quick reference
- [ ] Code files have helpful comments
- [ ] All features documented

## Clean Code ✅

- [ ] No console.error messages from extension code
- [ ] No undefined variables or functions
- [ ] Consistent code formatting
- [ ] No unused variables or dead code
- [ ] Comments explain complex logic

## Final Checklist ✅

- [ ] All core features tested
- [ ] All edge cases handled
- [ ] No crashes or freezes
- [ ] Documentation is comprehensive
- [ ] Extension is ready for use! 🎉

---

## Troubleshooting Failed Tests

If any test fails:

1. **Check console errors** (F12 → Console)
2. **Review file contents** in src/
3. **Reload extension** from chrome://extensions
4. **Clear browser cache** (Ctrl+Shift+Delete)
5. **Check manifest.json** for syntax errors
6. **Verify file permissions** are accessible
7. **Restart Chrome** completely
8. **Try incognito mode** (Ctrl+Shift+N)

---

**All tests passing? Extension is production-ready! 🚀**
