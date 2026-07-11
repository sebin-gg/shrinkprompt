# BrevityPrompt WASM Tokenizer Guide

This directory contains instructions on upgrading the lightweight, highly calibrated JavaScript BPE fallback tokenizer to a true WASM-based Tiktoken tokenizer (`cl100k_base` encoding).

## Step-by-Step WASM Integration

### 1. Install dependencies and compile
Run the following in a temporary node directory:
```bash
npm install tiktoken
```

### 2. Extract WASM binary
Locate the compiled Tiktoken WebAssembly binary. In standard `tiktoken` installations, this is found in:
`node_modules/tiktoken/tiktoken_bg.wasm` (or equivalent target path).

Copy this `tiktoken_bg.wasm` file into this `wasm/` directory:
`src/wasm/tiktoken_bg.wasm` or `wasm/tiktoken_bg.wasm` (referencing extension root).

### 3. Service Worker Lifecycle Auto-Detection
The `BrevityTokenizer` in `src/background.js` automatically attempts to load `wasm/tiktoken_bg.wasm` using Chrome extension URLs. If the file is present, it imports and compiles it using:
```javascript
WebAssembly.instantiateStreaming(fetch(chrome.runtime.getURL('wasm/tiktoken_bg.wasm')), importObject)
```
If the file is not found, the service worker will print a diagnostic log to the console and fall back to the calibrated JS BPE estimator, ensuring zero-downtime and graceful degradation.
