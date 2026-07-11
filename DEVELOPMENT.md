# BrevityPrompt — Extension Development Guide

This guide is designed for engineers developing, testing, and debugging the BrevityPrompt Manifest V3 Extension and its companion integrations.

---

## 🚀 Running the Local Development Environment

We provide a self-contained automation script that loads Google Chrome in an isolated developer sandbox profile with BrevityPrompt preloaded.

### Step 1: Start Chrome and Watcher
In the repository root directory, execute:
```bash
npm run dev
```
This performs the following operations:
1. Locates Google Chrome on your system (Windows, macOS, or Linux).
2. Launches Chrome with the flag `--load-extension` pointing to the unpacked workspace root.
3. Automatically opens `chrome://extensions/` alongside ChatGPT, Claude, and Gemini tabs.
4. Initiates a zero-dependency file watcher over `src/` that reports changes in your terminal.

---

## 🛠️ Inspecting and Debugging the Extension

Manifest V3 extensions separate logic into an isolated **Content Script** (running in the webpage) and a background **Service Worker** (routing events). Debugging them requires opening different Developer Tools panels.

### 1. Debugging the Service Worker (`background.js`)
If you make edits to `background.js` or the tokenizer/routing layer:
1. Go to the tab: `chrome://extensions/`
2. Locate the **BrevityPrompt** card.
3. Click the link next to **Inspect views**: `service worker`.
4. A dedicated DevTools window will open. Here you can inspect logs, set breakpoints, and watch network calls initiated by the background process.

### 2. Debugging DOM Interception (`content.js` and Adapters)
If you make changes to adapters (`ChatGPTAdapter`, `ClaudeAdapter`, etc.) or the preview modal:
1. Open the Developer Tools on ChatGPT, Claude, or Gemini (**F12** or **Ctrl+Shift+I**).
2. Go to the **Console** tab.
3. Observe messages prefixed with `[BrevityPrompt]`.
4. To see the injected scripts, go to **Sources** tab → **Content Scripts** accordion → expand `BrevityPrompt` folder.

### 3. Propagating Changes (Hot-Reloading)
When you edit any file in the `src/` directory, the terminal watcher will notify you:
```text
🔔 File modification detected: src/content.js (change)
👉 To reload: go to chrome://extensions/, click the reload icon on BrevityPrompt, then refresh your active chat tab.
```
1. Click the circular **↻ Reload** button on the BrevityPrompt card in `chrome://extensions/`.
2. Refresh the chat site tab (ChatGPT, Claude, or Gemini) to inject the new content scripts.

---

## 🐳 Running the FastAPI Companion Container

The FastAPI companion provides remote semantic compression.

### 1. Build and Start Backend
```bash
docker compose up --build -d
```
*(or `podman compose up --build -d` if using Podman)*

### 2. Verification
Check the container logs and endpoints:
```bash
# Verify API service status
curl http://localhost:8000/health
# Response: { "status": "ok", "cache_entries": 0, ... }

# View database files inside container volume
docker compose exec companion ls -la
# Confirms existence of cache.db, cache.db-wal, and cache.db-shm
```

---

## 🦙 Running Ollama Locally
BrevityPrompt can route queries directly to a locally running Ollama instance:
1. Download and run Ollama from https://ollama.com.
2. Download a target model:
   ```bash
   ollama run gemma2:2b
   ```
3. Open BrevityPrompt Settings (⚙️ Settings in extension popup), navigate to the **AI** tab, and toggle **Local Model Enabled**. Set the endpoint to `http://localhost:11434` and the model name to `gemma2:2b`.
