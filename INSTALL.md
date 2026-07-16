# INSTALLATION & SETUP GUIDE

## Complete Setup Instructions

This guide covers:
1. ✅ Generating extension icons
2. ✅ Loading the extension in Chrome
3. ✅ First-time configuration
4. ✅ Optional companion (Fireworks) + Ollama
5. ✅ Troubleshooting

**Repo name:** clone may be `shrinkprompt` or `brevity-prompt`. Always load the directory that contains `manifest.json`.

**Default state:** extension processing is **off** until you enable the popup toggle.

---

## Step 1: Generate Extension Icons

BrevityPrompt includes an icon source file (`icons/icon.svg`) that needs to be converted to PNG format for Chrome.

### Option A: Using ImageMagick (Linux/Mac/Windows with WSL)

1. Install ImageMagick: https://imagemagick.org/
2. Run the script in the project root:
   ```bash
   bash generate-icons.sh
   ```
3. Three PNG files will be created:
   - `icons/icon-16.png`
   - `icons/icon-48.png`
   - `icons/icon-128.png`

### Option B: Online SVG to PNG Converter (No software needed)

1. Go to: https://cloudconvert.com/svg-to-png
2. Upload `icons/icon.svg`
3. Download the PNG and save as `icons/icon-128.png`
4. Repeat for sizes: 16x16 and 48x48, saving with appropriate names

### Option C: Use AI or Design Tools

- Export from Figma, Illustrator, or other design tools
- Online tools like Pixlr (https://pixlr.com/), Canva, etc.

**File locations after generation:**
```
brevity-prompt/icons/
├── icon.svg
├── icon-16.png
├── icon-48.png
└── icon-128.png
```

---

## Step 2: Load Extension in Chrome

### Quick Start (5 minutes)

1. **Open Chrome** and go to: `chrome://extensions/`

2. **Enable Developer Mode**
   - Look for the toggle in the **top-right corner**
   - Click to turn it ON (should be blue/enabled)

3. **Click "Load unpacked"**
   - A folder browser will appear
   - Navigate to your `brevity-prompt` project folder
   - Select the root folder (where `manifest.json` is)
   - Click **Select Folder**

4. **Extension is loaded!**
   - You should see "BrevityPrompt" in your extensions list
   - The extension icon should appear in your toolbar (top-right)
   - Status should say "Enabled"

### Verify Installation

- ✅ Extension appears in `chrome://extensions/`
- ✅ Icon appears in Chrome toolbar
- ✅ Status shows as enabled (blue toggle)
- ✅ No red errors in the extensions page

---

## Step 3: First-Time Configuration

### Enable the Extension

1. **Click the BrevityPrompt icon** in your Chrome toolbar
2. **Toggle the switch** to **ON** (should show "Enabled")
3. Status message confirms it's active

### Open Settings (Optional)

1. Click the extension icon
2. Click **⚙️ Settings**
3. Review the default patterns
4. Optionally customize or leave as-is

### Optional: Companion + Fireworks (with SQLite WAL Caching)

BrevityPrompt uses an SQLite database (`cache.db`) with Write-Ahead Logging (WAL) enabled to persist semantic compression results. Old ephemeral in-memory cache is fully removed.

1. **Environment Setup**: Copy `.env.example` to `.env` and set `FIREWORKS_API_KEY`.
2. **Launch Container**:
   ```bash
   podman compose up --build -d
   ```
   Docker Compose compatibility fallback: `docker compose up --build -d`.
3. **Verify API & Database Initialisation**:
   - Visit: `http://localhost:8000/health`
   - You should see `cache_entries: 0` in the response, confirming the table exists.
   - Run `podman compose exec brevity-companion ls -la` to verify `cache.db`, `cache.db-wal`, and `cache.db-shm` inside the container filesystem. Docker fallback: replace `podman compose` with `docker compose`.
4. **Test Caching and Persistence**:
   - Send a prompt of length ≥280 characters with the toggle turned ON.
   - Refresh the `/health` endpoint: `cache_entries` will increment to `1`.
   - Run `podman compose restart brevity-companion` to restart the Companion.
   - Refresh `/health` again: `cache_entries` remains at `1`, verifying successful SQLite persistence!


### Optional: Ollama

1. Run Ollama with a model (e.g. `gemma3:4b`)
2. Extension Settings → AI → enable local model, set endpoint/model
3. Host permission defaults to `http://localhost:11434/*`

### Test It Out

1. Go to one of the supported platforms:
   - ChatGPT: https://chatgpt.com
   - Claude: https://claude.ai
   - Gemini: https://gemini.google.com

2. In the chat input, type a sample prompt with filler:
   ```
   Hi there! I was wondering if you could please explain 
   what machine learning is. Thanks so much!
   ```

3. Press **Enter** or click **Send**

4. **Preview modal appears** showing:
   - Original text (left)
   - Shortened text (right)
   - Token savings estimate

5. Click **Send Shortened** or **Send Original** to test

---

## Common Issues & Troubleshooting

### "Extension not loading" or "Manifest error"

**Cause:** Missing or corrupted `manifest.json`

**Fix:**
1. Check that `manifest.json` exists in the root folder
2. Verify it's valid JSON (use JSONLint: https://jsonlint.com/)
3. Reload the extension (click ↻ in chrome://extensions)

### "Icon not found" or blank icon

**Cause:** Missing PNG icon files

**Fix:**
1. Generate icons following Step 1 above
2. Verify files exist: `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`
3. Reload extension (click ↻)

### "Extension doesn't work on the website"

**Cause:** Content script not injecting properly

**Fix:**
1. Verify you're on a supported site:
   - ChatGPT: chatgpt.com (not chat.openai.com)
   - Claude: claude.ai
   - Gemini: gemini.google.com
2. Open DevTools (F12) and check Console tab for errors
3. Reload the page (Ctrl+R)
4. If still failing, try reloading extension

### "Preview modal not appearing"

**Cause:** Content script or preview-modal.js not loading

**Fix:**
1. Open DevTools (F12) → Console tab
2. Check for JavaScript errors
3. Reload the page
4. If error persists, unload and reload the extension

### "Regex patterns not working"

**Cause:** Invalid regex pattern syntax

**Fix:**
1. Go to Settings → Patterns tab
2. Look for red error messages under patterns
3. Fix the regex or click "Reset to Defaults"
4. Test on a new prompt

**Common regex mistakes:**
- Forgetting to escape special chars: `\.` instead of `.`
- Missing backslash: `\w` instead of `w`
- Unescaped parentheses: `(text\)` instead of `\(text\)`

---

## Development & Debugging

BrevityPrompt provides a zero-install local browser development sandbox.

To launch the isolated Chrome profile and directory watcher:
```bash
npm run dev
```

For complete guidelines on inspecting the Service Worker console, resolving compiler issues, and running Podman ports, refer to the **[DEVELOPMENT.md](./DEVELOPMENT.md)** guide. Docker Compose remains compatible.

### View Console Logs

1. Open DevTools: **F12** or **Ctrl+Shift+I** (Windows) / **Cmd+Shift+I** (Mac)
2. Go to **Console** tab
3. Look for `[BrevityPrompt]` messages
4. Check for errors (red text with stack traces)

### Edit & Test Locally

1. **Edit a file** in `src/` (e.g., `content.js`)
2. **Save the file**
3. Go to `chrome://extensions/`
4. Click **↻ Refresh** on BrevityPrompt
5. Go back to Chat platform and test

### Common Debug Messages

```
[BrevityPrompt] Content script loaded on chatgpt.com
[BrevityPrompt] Extension initialized
[BrevityPrompt] Toggle state changed: true
[BrevityPrompt] Extension state changed: true
```

### View Storage Data

To check what's stored locally:
1. Open DevTools (F12)
2. Go to **Application** tab (or **Storage** in Firefox)
3. Click **Chrome Extensions** → **BrevityPrompt**
4. View stored settings and state

---

## Features Checklist

After installation, verify these features work:

- [ ] **Toggle ON/OFF** from popup
- [ ] **Preview modal appears** when submitting  
- [ ] **"Send Shortened"** submits shortened version
- [ ] **"Send Original"** submits original text
- [ ] **"Edit & Send"** lets you modify and resend
- [ ] **Cancel button** works
- [ ] **Settings page** opens from popup
- [ ] **Custom patterns** save without errors
- [ ] **Reset to Defaults** button works
- [ ] Works on ChatGPT, Claude, and Gemini
- [ ] **Shadow DOM Token Dashboard** (shows session requests, tokens, last path)
- [ ] **MAIN-world network sniffer** (estimates tokens and registers chat traffic)
- [ ] Keyboard shortcuts:
  - Tab to navigate buttons
  - Enter to confirm
  - Escape to cancel
  - **Alt+Shift+B** to arm/bypass next send
  - **Alt+Shift+K** to abort in-flight fetch/XHR requests
  - **Alt+Shift+D** to toggle dashboard HUD visibility

---

## Next Steps

### For Users
- Explore the Settings page and customize patterns
- Share feedback or issues

### For Developers
- Check [DEVELOPMENT.md](./DEVELOPMENT.md) for contribution guidelines
- See main [README.md](./README.md) for architecture details
- Look at comments in `src/` files for code documentation

---

## Uninstall

If you need to remove the extension:

1. Go to `chrome://extensions/`
2. Find **BrevityPrompt**
3. Click the **🗑️ Remove** button
4. Confirm deletion

All local data will be cleared.

---

## Getting Help

If you encounter issues:

1. **Check the README.md** - Full feature documentation
2. **Check console errors** - F12 → Console tab
3. **Verify file structure** - All files in src/ should be present
4. **Clear extension cache** - Unload/reload from chrome://extensions
5. **Reset to defaults** - Settings → "Reset to Defaults" button

---

**Happy prompting! 🚀**
