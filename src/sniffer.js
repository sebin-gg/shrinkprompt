/**
 * MAIN-world fetch/XHR sniffer (Manifest V3 world: MAIN).
 * No chrome.* APIs. Bridges to the isolated content script via window.postMessage.
 *
 * Observes outbound chat traffic for the token dashboard. Does not rewrite
 * request bodies by default (DOM intercept + user preview is the safe path).
 */
(function () {
  if (window.__brevitySnifferInstalled) return;
  window.__brevitySnifferInstalled = true;

  const SOURCE = 'brevity-sniffer';
  const CHAT_HINTS = [
    /chatgpt\.com/i,
    /openai\.com/i,
    /claude\.ai/i,
    /anthropic\.com/i,
    /generativelanguage\.googleapis\.com/i,
    /gemini\.google\.com/i,
    /\/backend-api\//i,
    /\/conversation/i,
    /\/messages/i,
    /\/chat\//i,
    /\/v1\//i
  ];

  const activeControllers = new Map();
  let seq = 0;

  function post(type, payload) {
    try {
      window.postMessage({ source: SOURCE, type, payload, t: Date.now() }, '*');
    } catch (_) {
      /* ignore */
    }
  }

  function isInterestingUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // Skip our own companion / Ollama so dashboard does not double-count.
    if (/localhost:(8000|11434)/i.test(url)) return false;
    return CHAT_HINTS.some((re) => re.test(url));
  }

  function extractTextFromBody(body) {
    if (!body) return '';
    let text = '';
    if (typeof body === 'string') {
      text = body;
      try {
        const parsed = JSON.parse(body);
        if (parsed.messages) {
          text = parsed.messages.map((m) => (m && m.content) || '').join('\n');
        } else if (parsed.prompt) {
          text = String(parsed.prompt);
        } else if (parsed.input) {
          text = typeof parsed.input === 'string' ? parsed.input : JSON.stringify(parsed.input);
        }
      } catch (_) {
        /* plain string body */
      }
    } else if (body instanceof URLSearchParams) {
      text = body.toString();
    }
    return text;
  }

  function urlFromInput(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    try {
      return String(input);
    } catch {
      return '';
    }
  }

  const originalFetch = window.fetch;
  window.fetch = function brevityFetch(input, init) {
    const url = urlFromInput(input);
    const method = (init && init.method) || (input && input.method) || 'GET';
    const interesting = isInterestingUrl(url);
    const id = ++seq;

    let controller = null;
    if (interesting && !(init && init.signal)) {
      controller = new AbortController();
      init = { ...(init || {}), signal: controller.signal };
      activeControllers.set(id, controller);
    }

    if (interesting) {
      const bodyText = extractTextFromBody(init && init.body);
      const fallbackTokens = Math.max(0, Math.round(bodyText.length / 4));
      post('chat-request', {
        id,
        url: url.slice(0, 200),
        method: String(method).toUpperCase(),
        bodyText: bodyText,
        estimatedTokens: fallbackTokens,
        via: 'fetch'
      });
    }

    return originalFetch.call(this, input, init).then(
      (response) => {
        if (interesting) {
          post('chat-response', {
            id,
            ok: response.ok,
            status: response.status,
            via: 'fetch'
          });
        }
        activeControllers.delete(id);
        return response;
      },
      (err) => {
        if (interesting) {
          post('chat-error', {
            id,
            name: err && err.name,
            aborted: !!(err && err.name === 'AbortError'),
            via: 'fetch'
          });
        }
        activeControllers.delete(id);
        throw err;
      }
    );
  };

  const OriginalXHR = window.XMLHttpRequest;
  function BrevityXHR() {
    const xhr = new OriginalXHR();
    let url = '';
    let method = 'GET';
    let id = 0;
    const open = xhr.open;
    xhr.open = function (m, u, ...rest) {
      method = m;
      url = u;
      return open.call(xhr, m, u, ...rest);
    };
    const send = xhr.send;
    xhr.send = function (body) {
      if (isInterestingUrl(url)) {
        id = ++seq;
        const bodyText = extractTextFromBody(body);
        const fallbackTokens = Math.max(0, Math.round(bodyText.length / 4));
        post('chat-request', {
          id,
          url: String(url).slice(0, 200),
          method: String(method).toUpperCase(),
          bodyText: bodyText,
          estimatedTokens: fallbackTokens,
          via: 'xhr'
        });
        xhr.addEventListener('loadend', () => {
          post('chat-response', { id, ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, via: 'xhr' });
        });
      }
      return send.call(xhr, body);
    };
    return xhr;
  }
  BrevityXHR.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest = BrevityXHR;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'brevity-content' || data.type !== 'abort-active') return;
    let n = 0;
    activeControllers.forEach((c) => {
      try {
        c.abort();
        n += 1;
      } catch (_) {
        /* ignore */
      }
    });
    activeControllers.clear();
    post('aborted', { count: n });
  });

  post('ready', { version: 1 });
})();
