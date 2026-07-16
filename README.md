# BrevityPrompt

**Chrome Manifest V3 extension** that shortens AI prompts on **ChatGPT**, **Claude.ai**, and **Gemini** — local regex fluff removal plus optional semantic compression via a **containerized companion** (Fireworks Gemma) or local Ollama.

**AMD Developer Hackathon Act II — Track 3 (Unicorn)** hybrid product: extension + Podman companion. Docker Compose is supported for compatibility. See **[SUBMISSION.md](SUBMISSION.md)** for the judge demo script.

Repo folder may be named `shrinkprompt`; product name is **BrevityPrompt**. Load the folder that contains `manifest.json`.  
**Extension version:** 5.0.0

---

## Features

| Feature | Detail |
|--------|--------|
| Toggle | Popup enable/disable (default **off** until you turn it on) |
| Preview modal | Original vs shortened before send |
| Edit in composer | Put shortened text back in the input (you send when ready) |
| Send original | Skip compression for that prompt |
| Custom regex | Settings → Patterns (enable/edit/add custom filters) |
| Local-first | Regex and five-stage structural optimization run in the extension |
| Companion (optional) | Long prompts (≥ `minCloudCharacters`, default **280**) → `localhost:8000` FastAPI → Fireworks Gemma when key set |
| Ollama (optional) | Settings → AI: local model first, then companion |
| Savings stats | Popup shows tokenizer-based token savings for accepted shortened prompts |
| Token dashboard | Shadow DOM HUD on chat pages (session requests, ≈tokens, last provider) |
| MAIN-world sniffer | Observes fetch/XHR for dashboard; optional kill of in-flight requests |
| Bypass hotkeys | Alt+Shift+B one-send bypass · Alt+Shift+K abort · Alt+Shift+D hide HUD |

---

## Architecture (hybrid)

Chrome extensions cannot ship as the only deliverable for containerization requirements (e.g. AMD Hackathon Track 3). This project splits:

```
Browser (MV3 extension)                  Container (Podman preferred; Docker-compatible)
───────────────────────                  ────────────────────────────────
content.js intercepts Send/Enter    →    (no prompt leaves browser unless)
background.js local optimization    →    user enabled remote path AND length ≥ threshold
optional POST /v1/compress  ───────────► FastAPI companion
preview modal → user chooses        ◄─── Gemma compress (Fireworks) or local-fallback
composer updated → site Send
```

- **Local path:** regex cleaning plus a five-stage parser/optimizer/validator pipeline; no network.
- **Semantic path:** opt-in via Settings (cloud compression / Ollama). Companion never logs prompts; without `FIREWORKS_API_KEY` it returns stripped input as `local-fallback`.
- The preview modal appears **instantly** with the local regex result. Semantic compression races in the background; if it arrives within **3 seconds**, the modal live-upgrades to the better result.

---

## Privacy (accurate)

| Claim | Reality |
|-------|---------|
| Extension prompt storage | **No** — extension stores aggregate stats only, not prompt text |
| Companion cache | Raw prompts are not stored; compressed results are cached in Companion SQLite for the configured TTL |
| Always 100% local | **No** — optional Ollama (`localhost:11434`) or companion (`localhost:8000` → Fireworks) when enabled and prompt long enough |
| Regex only | Yes when disabled, short prompt, cloud off, or remote fails |
| Stats | Aggregates only (counts/chars/token estimates) in `chrome.storage.local` |

Patterns and toggle live in `chrome.storage.sync`. Do not treat Fireworks-enabled mode as offline.

---

## Quick start — extension

Supported target: Chrome and Chromium-based desktop browsers on Windows, macOS, and Linux. Chrome Android does not support normal extension-store installs.

1. Get source:
   ```bash
   git clone https://github.com/sebin-gg/shrinkprompt.git
   cd shrinkprompt
   ```
   Or download and extract the repository ZIP.
2. No build or dependency install is required for unpacked use; this extension is vanilla JavaScript.
3. Open Chrome → `chrome://extensions/` → enable **Developer mode** → select **Load unpacked**.
4. Select this repository root—the folder containing `manifest.json`, not its parent.
5. Pin **BrevityPrompt** → open the popup → turn **Enabled** on.
6. Open ChatGPT, Claude, or Gemini → type a prompt → press Enter or Send → choose from the preview modal.

To create the Chrome Web Store upload ZIP (not used for **Load unpacked**):

```powershell
sfw pnpm run package:chrome
```

Upload `dist/brevityprompt-<version>-chrome.zip` through the Chrome Web Store Developer Dashboard. See [RELEASE.md](RELEASE.md) for submission requirements.

Icons: `icons/icon-16.png`, `icon-48.png`, `icon-128.png` (regenerate via `generate-icons.sh` if missing). See [INSTALL.md](INSTALL.md).

---

## Companion service (Fireworks / Gemma)

Required for hackathon demo of cloud inference; optional for everyday local use.

1. Copy `.env.example` → `.env` and set `FIREWORKS_API_KEY`.
2. From repo root:
   ```bash
   podman compose up --build
   # Docker-compatible fallback: docker compose up --build
   ```
3. Health: `http://localhost:8000/health` → `fireworks_configured: true` when key present.
4. Compress API: `POST /v1/compress` JSON `{ "prompt": "..." }` → `{ "compressed_prompt", "provider", "model" }`.
5. Reload the unpacked extension after compose is up.

Env vars (see `.env.example`):

| Variable | Default |
|----------|---------|
| `FIREWORKS_API_KEY` | empty → local-fallback only |
| `FIREWORKS_MODEL` | `accounts/fireworks/models/gemma2-9b-it` |
| `FIREWORKS_BASE_URL` | `https://api.fireworks.ai/inference/v1` |

Default extension companion URL: `http://localhost:8000` (host permission in `manifest.json`).

### Ollama (optional)

Settings → AI tab:

- Enable local model
- Endpoint default `http://localhost:11434`
- Model default `gemma3:4b`

If Ollama fails, extension tries companion (if cloud compression on), else local regex.

---

## How shortening works

1. User enables extension in popup.
2. On Enter/Send, content script **synchronously** `preventDefault` / `stopImmediatePropagation` so the host app does not send first.
3. Background applies enabled regex patterns (`cleanPrompt`).
4. If length ≥ threshold and remote options on → Ollama and/or companion race concurrently.
5. Modal appears **instantly** with regex result; if semantic arrives within 3s, modal live-upgrades.
6. Modal: **Send Shortened** | **Edit in Composer** | **Send Original** | **Cancel**.

### Default regex categories

| Category | Examples stripped |
|----------|-------------------|
| Greetings | Hi, Hello, Hey, Greetings (line start) |
| Politeness | Please, Kindly, Could you, … |
| Fillers | I was wondering if, Basically, … |
| Closings | Thanks, Thank you, … (line end) |

**Caveat:** mid-sentence words like “please” can be removed from technical text. Tune or disable patterns in Settings for code-heavy prompts.

---

## Supported platforms

| Site | Notes |
|------|--------|
| chatgpt.com | Contenteditable composer; improved selectors + `insertText` |
| claude.ai | Enter in composer submits (`enterSubmitsInTextarea: true`) |
| gemini.google.com | Same Enter behavior as Claude |

Selectors can break when sites redesign UI — check DevTools console for `[BrevityPrompt]` logs.

---

## Project structure

```
shrinkprompt/
├── manifest.json                    # v2.0.0, MV3, background type:module
├── .env.example
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/main.py              # FastAPI /health, /v1/compress
├── src/
│   ├── adapters/                # ★ Phase 2: Adapter Pattern
│   │   ├── base-chat-adapter.js # Abstract base — contract + shared write logic
│   │   ├── chatgpt-adapter.js   # ChatGPT (Lexical/React contenteditable)
│   │   ├── claude-adapter.js    # Claude.ai (ProseMirror)
│   │   └── gemini-adapter.js    # Google Gemini (Angular rich-textarea)
│   ├── shared/
│   │   └── cleaner-rules.js     # ★ Phase 1: single source of truth for regex
│   ├── content.js             # Pure orchestrator — zero platform-specific code
│   ├── background.js          # Service worker — imports from shared/
│   ├── sniffer.js             # MAIN-world fetch/XHR observer
│   ├── dashboard.js           # Shadow DOM token HUD
│   ├── shortener.js           # Content-script compatibility shim
│   ├── preview-modal.js       # Comparison modal
│   ├── popup.*                # Toggle UI
│   └── settings.*             # Patterns + AI config
├── tests/test_clean_prompt.mjs  # 25 tests, imports from shared/
├── icons/
├── SUBMISSION.md
├── INSTALL.md
├── QUICKREF.md
├── IMPLEMENTATION_SUMMARY.md
├── VERIFICATION.md
└── README.md
```

---

## Configuration

### Patterns

Popup → Settings → **Patterns**: toggle categories, edit regex (`gi` flags), add custom filters, Save.

### AI / companion

Settings → **AI**:

- Local model enabled / endpoint / model name
- Cloud compression on/off
- Minimum characters before remote path (default 280)

Companion base URL is editable in Settings → AI (must stay on **localhost / 127.0.0.1** so it matches `host_permissions` in `manifest.json`). Non-local hosts need a manifest change + reload.

#### Caching & Privacy in the Companion
The FastAPI companion uses a SQLite database (`cache.db`) in its container filesystem in Write-Ahead Logging (WAL) mode; the supplied Compose file does not mount it as a persistent host volume.
- **Privacy**: Raw prompts are not stored. The service hashes the prompt using SHA-256 for `prompt_hash` lookup, while its compressed result is cached.
- **LRU/Eviction Policy**: The database preserves a maximum of `64` entries (configurable via `COMPRESS_CACHE_MAX`) with a `10-minute` expiration TTL (configurable via `COMPRESS_CACHE_TTL_SEC`), automatically evicting oldest/expired records.
- **Vulnerability Defense**: SQL injection is completely prevented via strict query parameterisation.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Nothing happens | Popup toggle **Enabled**; reload extension; hard-refresh chat page |
| No modal on Claude Enter | Reload extension after latest `content.js`; ensure enabled |
| Shortened text not applied | SPA editor issue — try Edit in Composer then manual send; report site + DOM |
| Companion ignored | Prompt length < threshold; cloud off; compose down; check `/health` |
| Upgrade not landing | Semantic path has a 3s deadline; check if Ollama/companion responds faster |
| Toolbar icon wrong | `action.default_icon` in manifest; icons under `icons/` |

More detail: [INSTALL.md](INSTALL.md), [VERIFICATION.md](VERIFICATION.md).

---

---

## Adapter Pattern — Platform Interception Engine

Since Phase 2, BrevityPrompt uses an **Adapter Pattern** to separate platform-specific
DOM behaviour from the universal interception logic.

### Architecture

```
BaseChatAdapter  (src/adapters/base-chat-adapter.js)
  │ Abstract: locateComposer(), locateSubmitButton()
  │ Concrete:  readText, writeText (3-strategy SPA-safe), submit, shouldInterceptKeydown
  │ Static:    matchesAriaInput, matchesAriaSubmit, looksLikeChatInput
  ├── ChatGPTAdapter  — Lexical/React contenteditable (#prompt-textarea)
  ├── ClaudeAdapter   — ProseMirror (div.ProseMirror inside fieldset)
  └── GeminiAdapter   — Angular (rich-textarea [contenteditable])

content.js  (pure orchestrator)
  Resolves adapter from ADAPTER_REGISTRY by hostname
  Delegates all DOM work to adapter
  Guards: isIntercepting flag + bypassCount counter
```

### SPA-Safe `writeText` Strategy

| Attempt | Method | Target |
|---------|--------|--------|
| 0–1 | `execCommand('insertText')` after `selectAll` | ProseMirror, Lexical, Draft.js |
| 2 | DOM clear + `createTextNode` + `beforeinput`/`input`/`change` events | React 18 |
| Fallback | `el.textContent = text` | Plain contenteditable |

### Adding a New Platform (6 steps)

1. Create `src/adapters/my-platform-adapter.js`
2. Implement `locateComposer()` using 3 layers: CSS selectors → ARIA scan → heuristic
3. Implement `locateSubmitButton()` similarly
4. Register in `src/content.js` `ADAPTER_REGISTRY`
5. Add host permission + match pattern to `manifest.json`
6. Add the file to `manifest.json` `content_scripts[1].js` (before `content.js`)

No changes to `BaseChatAdapter`, `content.js`, or any other existing file.

---

---

## Tokenizer & Network Telemetry Engine

Since Phase 3, BrevityPrompt integrates a dual-mode local tokenizer and a deterministic network telemetry engine inside the MV3 service worker.

### BrevityTokenizer (cl100k_base alignment)

- **WASM Mode**: Auto-detects and loads `wasm/tiktoken_bg.wasm` on extension initialization. Compiles directly within the service worker sandbox.
- **Calibrated BPE Fallback**: If the WASM binary is not bundled, the engine degrades gracefully to a highly calibrated JavaScript BPE regex estimator.
- **Accuracy**: The BPE regex splits on cl100k_base GPT-4 boundaries (contractions, whitespace-prefixed words, numeric sequences, symbols) with an error margin of ≤12% on standard prompts (vs. 30–200% for traditional `char.length / 4` heuristics).

### Network Telemetry (webRequest API)

In Manifest V3, request bodies cannot be modified or read asynchronously from background service workers. Telemetry is split into two complementary tracks:
1. **Autoritative Telemetry (Service Worker)**: `chrome.webRequest.onCompleted` intercepts and counts API calls, recording success/failure counts and latency per domain to `chrome.storage.local`.
2. **Dashboard UI Telemetry (MAIN world sniffer)**: `sniffer.js` intercepts client-side payload bodies to estimate token usage in real-time, feeding the Shadow DOM token HUD.

---

## Development & Testing Harness

BrevityPrompt includes a local browser launch and watch script to speed up development cycles.

- **Cross-Platform Launcher**: Boots an isolated Chrome developer instance with the unpacked extension loaded, opening chat sites automatically.
- **Directory Watcher**: Monitors `src/` files and alerts in the terminal when modifications are saved.

To launch the development browser sandbox:
```bash
sfw pnpm run dev
```

To run all tokenizer and regex unit tests:
```bash
sfw pnpm test
```

For complete instructions on inspecting the Service Worker console, content scripts, and setting up Ollama/Podman companion ports, see **[DEVELOPMENT.md](DEVELOPMENT.md)**. Docker Compose remains a compatibility fallback.

- Chrome/Chromium 88+
- Extension: vanilla JS (no bundler)
- Backend: Python 3.12, FastAPI, httpx — see `backend/requirements.txt`
- Regex defaults: edit `src/shared/cleaner-rules.js` **only** (single source of truth)

### Key files

| Goal | File |
|------|------|
| Tokenizer / telemetry routing | `src/background.js` |
| Add a new platform | `src/adapters/` (new file) + `manifest.json` |
| Fix broken selector | `src/adapters/<platform>-adapter.js` |
| Change cleaning rules | `src/shared/cleaner-rules.js` |
| Interception pipeline | `src/content.js` |
| Settings UI | `src/settings.js` |

---

## Changelog (project)

### 2026-07-11 — v5.0.0 Phase 5: UI & Final Integrations

- **src/dashboard.js:** Upgraded token estimation to query the background worker's `BrevityTokenizer` asynchronously, completely removing traditional client-side `chars / 4` estimation.
- **src/sniffer.js:** Refactored outbound fetch/XHR payload capture to extract and forward raw query text (`bodyText`) to dashboard event listeners.
- **src/preview-modal.js:** Upgraded statistical displays (`show` and `update`) to accept pre-calculated token metadata and show exact values.
- **manifest.json:** Bumped extension version to 5.0.0.
- **License Alignment:** Documented and verified unified license claims across all files (now consistently declared as **Apache License 2.0**).

### 2026-07-11 — v4.0.0 Phase 4: Persistent SQLite Caching Layer

- **backend/app/main.py:** Replaced in-memory cache with persistent SQLite database (`cache.db`) running in Write-Ahead Logging (WAL) mode. Enabled concurrent reads and sequential writes with `sqlite3` busy timeouts.
- **SQL Parameterisation:** Implemented parameterized SQL queries (`?`) for database lookups and updates, eliminating SQL injection vulnerability paths.
- **Eviction / TTL Handling**: Preserves maximum of `64` entries with a `10-minute` cache expiration lifecycle, using transaction context managers.
- **Podman Compose**: Creator-preferred container workflow; Docker Compose remains compatible. SQLite cache behavior is documented for deployment verification.

### 2026-07-11 — v3.0.0 Phase 3: Telemetry, Tokenizer, & Routing Engine

- **src/background.js:** Integrated `BrevityTokenizer` (loads Tiktoken WASM with calibrated cl100k_base BPE fallback) and `NetworkTracker` (uses `chrome.webRequest` to track API request statuses).
- **manifest.json:** Added `webRequest` and `declarativeNetRequest` permissions. Registered wildcard API host permissions.
- **wasm/WASM_README.md [NEW]:** Guide on compiling and copying `tiktoken_bg.wasm` into the bundle.
- **tests/test_tokenizer.js [NEW]:** Dedicated test suite asserting BPE accuracy on standard prose, code, and numeric strings.

### 2026-07-11 — v2.0.0 Phase 2: Adapter Pattern DOM Engine

- **src/adapters/base-chat-adapter.js [NEW]:** Abstract base class. 3-strategy SPA-safe `writeText`, ARIA utilities, abstract `locateComposer`/`locateSubmitButton`.
- **src/adapters/chatgpt-adapter.js [NEW]:** ChatGPT adapter — Lexical editor (`#prompt-textarea`) + `data-testid="send-button"`.
- **src/adapters/claude-adapter.js [NEW]:** Claude adapter — ProseMirror (`div.ProseMirror`) + `aria-label="Send"`.
- **src/adapters/gemini-adapter.js [NEW]:** Gemini adapter — Angular `rich-textarea [contenteditable]` + localisation-aware submit detection.
- **src/content.js [REWRITTEN]:** Pure orchestrator. Zero platform code. Dual-guard loop prevention (`isIntercepting` + `bypassCount`). `ADAPTER_REGISTRY` resolves adapter by hostname.
- **manifest.json:** 3 duplicate `content_scripts` entries → 1. Adapter files in load order. Version 2.0.0.

### 2026-07-11 — v1.2.0 Phase 1 Refactor (Master Engineering Spec)

- **src/shared/cleaner-rules.js [NEW]:** Single canonical ES Module — sole owner of `DEFAULT_PATTERNS`, `DEFAULT_COMPANION_CONFIG`, `DEFAULT_STATS`, `cleanPrompt`, `extractCodeBlocks`, `restoreCodeBlocks`, `getCleaningStats`, `validatePattern`. All other files import from here.
- **manifest.json:** Added `"type": "module"` to background entry — enables native ES `import` in the service worker (Chrome 92+).
- **background.js:** Replaced all duplicated constants + helper functions with a single `import` from `./shared/cleaner-rules.js`. Service worker is now ~70 lines shorter.
- **settings.js:** Removed duplicated `DEFAULT_PATTERNS` / `DEFAULT_COMPANION_CONFIG`. Loaded via `<script type="module">` from settings.html. `validateRegex()` delegates to shared `validatePattern()`.
- **settings.html:** `<script type="module" src="settings.js">` — required for ES module loading.
- **shortener.js:** Converted to an explicit content-script compatibility shim. Prominently documents why ES import cannot be used here (MV3 content script limitation) and points to `shared/cleaner-rules.js` as the authority. Phase 2 will replace this with the BaseChatAdapter pattern.
- **tests/test_clean_prompt.mjs:** All logic removed; now imports directly from `src/shared/cleaner-rules.js`. Test count expanded from 12 to 25, including `extractCodeBlocks`/`restoreCodeBlocks` unit tests.

### 2026-07-11 — v1.1.0 Track 3 build-out

- **sniffer.js (MAIN world):** fetch/XHR observe, token estimates, abort bridge
- **dashboard.js:** Shadow DOM HUD, bypass / kill / hide hotkeys
- **content.js:** platform Enter rules; React/ProseMirror `setInputText`; working overlay; re-entry-safe programmatic send; dashboard + provider
- **background.js:** enabled default off; 12s remote timeout; honest stats; safer fillers
- **backend:** CORS, hash cache (no raw prompt stored), richer `/health`, max_tokens headroom
- **settings:** companion URL (localhost-only); AI tab
- **manifest 1.1.0:** `default_icon`, MAIN sniffer, 127.0.0.1 hosts
- **docs:** SUBMISSION.md, README/QUICKREF/VERIFICATION/INSTALL sync
- **tests:** `node tests/test_clean_prompt.mjs`

### Roadmap (post-hackathon)

- Pattern export/import · optional non-localhost host permissions · deeper MAIN-world body rewrite (opt-in only)

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Code of Conduct

Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
testing, privacy, and pull-request requirements.

### Contributors

- [Swathy J](https://github.com/swathyj348)
- [Muhammed Adil C](https://github.com/tWiNFigHTer-gif)

### Roadmap ideas

- [x] MAIN-world fetch sniffer (strategy: deeper intercept)
- [x] Shadow DOM token dashboard
- [x] Configurable companion URL in Settings UI
- [x] Automated tests for `cleanPrompt`
- [ ] Export/import pattern sets
- [ ] Dark mode settings

---

## Known Issues & What Needs Fixing

1. **Fragile DOM Selectors:** ChatGPT, Claude, and Gemini periodically update their site DOM. If selectors in `src/content.js` change, interception breaks.
2. **SPA Text Insertion Quirks:** SPAs using Draft.js or ProseMirror sometimes fail to sync programmatically updated text unless specific input events are fired.
3. **Non-localhost AI Endpoints:** Setting a remote (non-localhost) endpoint for the companion or Ollama fails because of strict host permissions in `manifest.json`.
4. **Timeout Latency:** If the remote companion or Ollama server is slow, the 3-second semantic deadline may expire before a result arrives, so only the local regex result is shown. The modal still appears instantly.
5. **Regex Pattern Precision:** Local regex patterns can inadvertently strip keywords (e.g., "please", "thanks") inside markdown code blocks or code examples.

---

**Local-first by default. Cloud only when you opt in.**
