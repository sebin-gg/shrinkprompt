# BrevityPrompt - Quick Reference

## File Structure
```
shrinkprompt/                  # product name: BrevityPrompt
├── manifest.json              ← MV3 metadata + host_permissions
├── README.md                  ← Full documentation
├── INSTALL.md                 ← Installation guide (START HERE)
├── .env.example               ← Fireworks companion env template
├── docker-compose.yml         ← Companion container
├── generate-icons.sh          ← Script to create PNG icons
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/main.py            ← FastAPI /health + /v1/compress
├── src/
│   ├── background.js          ← Service worker (regex, companion, Ollama, stats)
│   ├── content.js             ← Intercept Send/Enter on chat sites
│   ├── sniffer.js             ← MAIN-world fetch/XHR observer
│   ├── dashboard.js           ← Shadow DOM token dashboard HUD
│   ├── shortener.js           ← Shared regex helpers (content inject)
│   ├── popup.html/.js/.css    ← Toggle + savings stats
│   ├── settings.html/.js/.css ← Patterns + AI settings
│   └── preview-modal.js       ← Preview comparison modal
└── icons/
    ├── icon.svg
    ├── icon-16.png / 48 / 128
```

## Installation Steps (5 minutes)

### 1️⃣ Icons
Icons under `icons/` are usually already present. Else:
```bash
bash generate-icons.sh
```

### 2️⃣ Load in Chrome
1. `chrome://extensions/` → Developer mode ON
2. **Load unpacked** → folder with `manifest.json`
3. Popup → toggle **Enabled** (default is **off**)

### 3️⃣ Optional companion
```bash
cp .env.example .env   # set FIREWORKS_API_KEY
podman compose up --build
# health: http://localhost:8000/health
```

### 4️⃣ Test
1. ChatGPT / Claude / Gemini
2. Type fluff: `Hi! I was wondering if you could explain machine learning. Thanks!`
3. Enter/Send → modal → **Send Shortened**

## Architecture

```
User Send/Enter
  → content.js (preventDefault sync)
  → overlay "Shortening…"
  → background: regex → optional Ollama → optional companion (12s timeout)
  → preview modal
  → setInputText (React/ProseMirror-safe) → click Send
```

| File | Purpose | Runs Where |
|------|---------|-----------|
| `background.js` | Clean, remote compress, stats | Service worker |
| `content.js` | Intercept, overlay, set text | Chat tabs |
| `sniffer.js` | MAIN-world fetch/XHR observer | Chat tabs (MAIN) |
| `dashboard.js` | Shadow DOM token dashboard HUD | Chat tabs |
| `shortener.js` | cleanPrompt helpers | Content inject |
| `preview-modal.js` | UI choices | Page |
| `backend/app/main.py` | Gemma compress | Container |

## Hotkeys (on chat page)

| Hotkey | Action |
|--------|--------|
| Alt+Shift+B | Arm one-send bypass (no modal) |
| Alt+Shift+K | Abort in-flight fetches captured by sniffer |
| Alt+Shift+D | Toggle dashboard |

## Privacy (short)

- Regex = local only
- Ollama / companion = opt-in for long prompts (default ≥280 chars)
- Extension does not store prompt text
- Token stats = local aggregates only

## Settings → AI

| Field | Default |
|-------|---------|
| Ollama | off, `http://localhost:11434`, `gemma3:4b` |
| Companion URL | `http://localhost:8000` (localhost only) |
| Cloud compression | on |
| Min chars for AI | 280 |

URLs must be localhost/127.0.0.1 (manifest host permissions).

## Defaults quirk

Existing installs keep old pattern objects in `chrome.storage.sync` until **Reset to Defaults** or manual edit. New filler defaults no longer strip bare "Basically"/"Essentially".

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No intercept | Enable toggle; reload extension + page |
| Claude Enter | Need current `content.js` |
| Companion ignored | Length &lt; min; compose down; `/health` |
| Slow | Wait ≤12s or disable cloud/Ollama |
| Icon missing | `default_icon` + PNGs in `icons/` |

Full docs: [README.md](README.md) · [INSTALL.md](INSTALL.md)
