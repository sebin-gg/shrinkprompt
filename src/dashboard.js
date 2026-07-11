/**
 * Shadow DOM token / status dashboard for BrevityPrompt.
 * Isolated world. Listens to sniffer postMessages + chrome storage stats.
 */
const BrevityDashboard = (function () {
  const SOURCE_SNIFFER = 'brevity-sniffer';
  let host = null;
  let root = null;
  let els = {};
  let sessionTokensOut = 0;
  let sessionRequests = 0;
  let lastProvider = '—';
  let bypassArmed = false;
  let enabled = false;

  function estimateTokens(text) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: 'countTokens', text }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(Math.max(0, Math.round(String(text || '').length / 4)));
            return;
          }
          resolve(response?.tokens || 0);
        });
      } catch (_) {
        resolve(Math.max(0, Math.round(String(text || '').length / 4)));
      }
    });
  }

  function ensure() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('div');
    host.id = 'brevity-dashboard-host';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;top:12px;right:12px;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .panel {
          font: 12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          color: #e5e7eb;
          background: rgba(17, 24, 39, 0.92);
          border: 1px solid #374151;
          border-radius: 10px;
          padding: 10px 12px;
          min-width: 200px;
          max-width: 260px;
          box-shadow: 0 10px 30px rgba(0,0,0,.35);
          backdrop-filter: blur(8px);
        }
        .title { font-weight: 700; font-size: 13px; margin: 0 0 8px; color: #a7f3d0; display:flex; justify-content:space-between; align-items:center; }
        .row { display:flex; justify-content:space-between; gap:8px; margin: 4px 0; color:#d1d5db; }
        .row strong { color:#f9fafb; font-variant-numeric: tabular-nums; }
        .badge { font-size:10px; padding:2px 6px; border-radius:999px; background:#065f46; color:#ecfdf5; }
        .badge.off { background:#4b5563; color:#e5e7eb; }
        .badge.bypass { background:#b45309; color:#fffbeb; }
        .hint { margin-top:8px; font-size:10px; color:#9ca3af; }
        button {
          margin-top:8px; width:100%; border:0; border-radius:6px; padding:6px 8px;
          background:#059669; color:#fff; font-weight:600; cursor:pointer; font-size:11px;
        }
        button.secondary { background:#374151; margin-top:4px; }
        .collapsed .body { display:none; }
        .drag { cursor: move; user-select:none; }
      </style>
      <div class="panel" id="panel">
        <div class="title drag" id="title">
          <span>BrevityPrompt</span>
          <span class="badge off" id="status">OFF</span>
        </div>
        <div class="body">
          <div class="row"><span>Session req</span><strong id="reqs">0</strong></div>
          <div class="row"><span>≈ tokens out</span><strong id="tok">0</strong></div>
          <div class="row"><span>Saved (local)</span><strong id="saved">0</strong></div>
          <div class="row"><span>Last path</span><strong id="prov">—</strong></div>
          <div class="hint">Alt+Shift+B arm one-send bypass · Alt+Shift+K kill in-flight fetch · Alt+Shift+D hide</div>
          <button type="button" id="bypass">Arm bypass (1 send)</button>
          <button type="button" class="secondary" id="hide">Hide</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(host);
    els = {
      panel: root.getElementById('panel'),
      status: root.getElementById('status'),
      reqs: root.getElementById('reqs'),
      tok: root.getElementById('tok'),
      saved: root.getElementById('saved'),
      prov: root.getElementById('prov'),
      bypass: root.getElementById('bypass'),
      hide: root.getElementById('hide'),
      title: root.getElementById('title')
    };
    els.bypass.addEventListener('click', () => setBypass(true));
    els.hide.addEventListener('click', () => setVisible(false));
    makeDraggable(els.title, host);
    refreshStats();
    render();
  }

  function makeDraggable(handle, el) {
    let sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
    handle.addEventListener('pointerdown', (e) => {
      drag = true;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag) return;
      el.style.left = `${ox + e.clientX - sx}px`;
      el.style.top = `${oy + e.clientY - sy}px`;
      el.style.right = 'auto';
    });
    handle.addEventListener('pointerup', () => { drag = false; });
  }

  function render() {
    if (!els.status) return;
    els.status.textContent = bypassArmed ? 'BYPASS' : (enabled ? 'ON' : 'OFF');
    els.status.className = 'badge' + (bypassArmed ? ' bypass' : (enabled ? '' : ' off'));
    els.reqs.textContent = String(sessionRequests);
    els.tok.textContent = String(sessionTokensOut);
    els.prov.textContent = lastProvider;
  }

  function refreshStats() {
    try {
      chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
        if (chrome.runtime.lastError) return;
        const n = response?.stats?.tokensSaved || 0;
        if (els.saved) els.saved.textContent = Number(n).toLocaleString();
      });
    } catch (_) {
      /* ignore */
    }
  }

  function setEnabled(v) {
    enabled = !!v;
    ensure();
    render();
  }

  function setBypass(v) {
    bypassArmed = !!v;
    window.__brevityBypassNext = bypassArmed;
    ensure();
    render();
  }

  function consumeBypass() {
    if (!bypassArmed) return false;
    setBypass(false);
    return true;
  }

  function setProvider(p) {
    lastProvider = p || '—';
    ensure();
    render();
  }

  function noteOutbound(tokens) {
    sessionRequests += 1;
    sessionTokensOut += tokens || 0;
    ensure();
    render();
  }

  function setVisible(show) {
    ensure();
    host.style.display = show ? '' : 'none';
  }

  function onWindowMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_SNIFFER) return;
    if (data.type === 'chat-request') {
      const bodyText = data.payload?.bodyText || '';
      if (bodyText) {
        estimateTokens(bodyText).then(tokens => {
          noteOutbound(tokens);
        });
      } else {
        noteOutbound(data.payload?.estimatedTokens || 0);
      }
    }
  }

  function onKey(e) {
    if (!(e.altKey && e.shiftKey)) return;
    if (e.code === 'KeyB') {
      e.preventDefault();
      setBypass(!bypassArmed);
    } else if (e.code === 'KeyD') {
      e.preventDefault();
      ensure();
      host.style.display = host.style.display === 'none' ? '' : 'none';
    } else if (e.code === 'KeyK') {
      e.preventDefault();
      window.postMessage({ source: 'brevity-content', type: 'abort-active' }, '*');
    }
  }

  function init(isEnabled) {
    ensure();
    setEnabled(isEnabled);
    window.addEventListener('message', onWindowMessage);
    window.addEventListener('keydown', onKey, true);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.stats) refreshStats();
      if (area === 'sync' && changes.enabled) setEnabled(changes.enabled.newValue === true);
    });
  }

  return {
    init,
    setEnabled,
    setBypass,
    consumeBypass,
    setProvider,
    estimateTokens,
    setVisible,
    refreshStats
  };
})();
