# BrevityPrompt Agent Guide

## Scope

Chrome MV3 extension for ChatGPT, Claude, Gemini. Optional local FastAPI
Companion provides semantic compression. Keep changes small. No new platforms,
permissions, remote endpoints, or features without explicit request.

## Map

- `manifest.json`: entrypoint, permissions, script order.
- `src/background.js`: MV3 worker, optimizer, storage, routing, tokenizer.
- `src/content.js`: interception, preview.
- `src/adapters/`: platform composer/submit logic.
- `src/shared/`, `src/optimizer/`: pure JS, Node-testable.
- `backend/app/main.py`: optional FastAPI Companion, SQLite cache.

## Extension rules

- Keep manifest content-script order. Adapters before `content.js`; MAIN-world
  `sniffer.js` first.
- Content scripts are classic scripts: no ES-module imports.
- Keep `src/shared/` + `src/optimizer/` free of `chrome.*`, DOM, network.
- Intercept synchronously; resolve every async message path; keep bypass guards
  and Preview choice.
- Limit selector changes to target adapter. MAIN-world code uses
  `window.postMessage`, never `chrome.*`.
- External URL needs matching `host_permissions` + unpacked-extension reload.
  Existing AI endpoints intentionally permit localhost only.

## Privacy / Companion

- Local optimizer network-free. Remote compression opt-in, threshold-gated.
- Never persist raw prompts. Companion cache stores compressed results only.
- Never log keys/prompt content. Keep `.env` untracked.
- Creator preference: `podman compose`. Docker Compose supported compatibility
  path; docs/commands must name Podman first.

## Verify

```powershell
pnpm test
python -m unittest discover -s backend\tests -v
git diff --check
```

Use focused tests first. For package-manager commands use `sfw pnpm ...` when
available.

## Docs / git

- Update README for behavior, privacy, setup, permissions, platform changes.
- Do not call token counts exact unless active tokenizer proves it.
- Conventional Commits. Never commit `.env`, SQLite cache, `node_modules`, or
  generated local files.
