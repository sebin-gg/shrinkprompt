# BrevityPrompt — AMD Developer Hackathon Act II  
## Track 3 (Unicorn) Submission Brief

**Product:** Hybrid browser extension + containerized AI companion  
**Version:** 1.1.0  
**Open model:** Google **Gemma-2-9b-it** via **Fireworks AI** (AMD GPU cloud inference)  
**Repo root:** folder containing `manifest.json` and `docker-compose.yml`

---

## One-sentence pitch

BrevityPrompt is a local-first Chrome extension that removes prompt fluff on ChatGPT, Claude, and Gemini, with optional semantic compression through a containerized Fireworks Gemma service for long technical context.

---

## Track 3 requirements mapping

| Requirement | How we meet it |
|-------------|----------------|
| **Product / startup oriented** | End-user extension (token savings, privacy, settings) + demoable backend |
| **Containerized** | `docker-compose.yml` → FastAPI companion (`backend/`) |
| **AMD / Fireworks** | `FIREWORKS_API_KEY` → Fireworks chat completions, Gemma model |
| **Open-source model prize pool** | Default model `accounts/fireworks/models/gemma2-9b-it` |

---

## Architecture (judge view)

```
┌─────────────────────────────────────┐     ┌──────────────────────────────────┐
│ Chrome MV3 extension                │     │ Container: brevity-companion     │
│ • content.js — Send/Enter intercept │     │ FastAPI :8000                    │
│ • preview modal — human in the loop │────►│ POST /v1/compress                │
│ • dashboard — tokens / bypass / kill│     │ Gemma via Fireworks (if keyed)   │
│ • sniffer.js MAIN world — fetch peek│     │ In-memory hash cache (no prompt) │
│ • regex + optional Ollama           │     │ Never logs prompt bodies         │
└─────────────────────────────────────┘     └──────────────────────────────────┘
```

**Default privacy:** short prompts never leave the browser. Long prompts only hit the companion when cloud compression is enabled (Settings → AI).

---

## Demo script (≈5 minutes)

### A. Extension only (local-first)

1. Chrome → `chrome://extensions/` → Load unpacked → this repo root  
2. Popup → **Enabled**  
3. Open ChatGPT (or Claude / Gemini)  
4. Type: `Hi! I was wondering if you could explain how TCP handshake works. Thanks!`  
5. Send → modal shows shortened text + savings → **Send Shortened**  
6. Note dashboard (top-right): ON, saved tokens, Alt+Shift+D to hide  

### B. Companion + Fireworks (Track 3 money shot)

1. Copy `.env.example` → `.env`, set `FIREWORKS_API_KEY`  
2. From repo root:  
   ```bash
   podman compose up --build
   # or: docker compose up --build
   ```  
3. `curl http://localhost:8000/health` → `"fireworks_configured": true`  
4. Settings → AI: cloud compression **on**, min chars **280** (or lower for demo)  
5. Paste a **long** technical prompt (≥ threshold) → send → modal shows `via fireworks` (or `cache` on repeat)  
6. Without key: health still OK; compress returns `local-fallback` (honest demo mode)

### C. Optional Ollama

1. `ollama pull gemma3:4b` and run Ollama  
2. Settings → enable local model → long prompt → provider `ollama`  

### Hotkeys (on chat page)

| Hotkey | Action |
|--------|--------|
| Alt+Shift+B | Arm one-send bypass (no modal) |
| Alt+Shift+K | Abort in-flight fetches captured by sniffer |
| Alt+Shift+D | Toggle dashboard |

---

## What judges should open

| Path | Why |
|------|-----|
| [README.md](README.md) | Product + privacy + setup |
| [SUBMISSION.md](SUBMISSION.md) | This brief |
| [backend/app/main.py](backend/app/main.py) | Fireworks + Gemma integration |
| [docker-compose.yml](docker-compose.yml) | Container entry |
| [manifest.json](manifest.json) | MV3 extension surface |
| [src/sniffer.js](src/sniffer.js) | MAIN-world network observe |
| [src/dashboard.js](src/dashboard.js) | Injected token HUD |

---

## Explicit non-goals (scope honesty)

- Full Redis cluster (in-memory cache is enough for demo)  
- Rewriting opaque chat API JSON bodies in-flight (unsafe; we use DOM intercept + preview)  
- Shipping API keys in the extension (key lives only in container env)

---

## Quick verification

```bash
# Companion
podman compose up --build -d
curl -s http://localhost:8000/health
curl -s -X POST http://localhost:8000/v1/compress -H "Content-Type: application/json" -d "{\"prompt\":\"Hi please explain DNS. Thanks\"}"

# Extension
# Load unpacked → enable → test ChatGPT/Claude/Gemini
```

---

## Team notes

- Repo folder may be named `shrinkprompt`; product name is **BrevityPrompt**  
- Icons are under `icons/` (16 / 48 / 128)  
- Toggle defaults **off** until user enables  

**Made for AMD Developer Hackathon Act II — Track 3.**
