// Preview Modal - Shows original vs shortened prompt comparison
// Allows user to choose which version to send

const BrevityPreviewModal = (function() {
  let currentResolve = null;
  
  /**
   * Show the preview modal
   * @param {string} original - Original prompt text
   * @param {string} shortened - Shortened prompt text
   * @returns {Promise<string>} - User's choice: 'send_shortened', 'send_original', 'edit', or 'cancel'
   */
  function show(original, shortened, meta) {
    return new Promise((resolve) => {
      currentResolve = resolve;
      
      // Create modal elements
      const modal = createModal(original, shortened, meta || {});
      
      // Add to page
      document.body.appendChild(modal);
      
      // Trigger animation
      setTimeout(() => {
        modal.classList.add('brevity-modal-visible');
      }, 10);
      
      // Focus first button
      const firstBtn = modal.querySelector('button');
      if (firstBtn) firstBtn.focus();
    });
  }
  
  /**
   * Create the modal DOM structure
   */
  function createModal(original, shortened, meta) {
    const modal = document.createElement('div');
    modal.className = 'brevity-modal';
    modal.id = 'brevity-preview-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Shorten prompt preview');
    
    // Inject styles if not already present
    injectStyles();
    
    // Calculate statistics
    const charsSaved = original.length - shortened.length;
    const percentReduction = original.length ? (charsSaved / original.length) * 100 : 0;
    const percentLabel = percentReduction < 1 ? '<1%' : `${Math.round(percentReduction)}%`;
    
    // Check if background worker provided exact token counts
    const tokensSaved = (meta.originalTokens != null && meta.shortenedTokens != null)
      ? Math.max(0, meta.originalTokens - meta.shortenedTokens)
      : (charsSaved > 0 ? Math.max(1, Math.round(charsSaved / 4)) : 0);
    const tokenLabel = (meta.originalTokens != null && meta.shortenedTokens != null)
      ? `${tokensSaved}`
      : `≈${tokensSaved}`;

    const providerLabel = meta.provider
      ? `${escapeHtml(meta.provider)}${meta.model ? ' · ' + escapeHtml(String(meta.model).split('/').pop()) : ''}`
      : 'local-regex';
    
    // Create modal content
    const content = document.createElement('div');
    content.className = 'brevity-modal-content';
    
    // Header
    const header = document.createElement('div');
    header.className = 'brevity-modal-header';
    header.innerHTML = `
      <h2>Shorten Prompt?</h2>
      <button type="button" class="brevity-modal-close" aria-label="Close">✕</button>
    `;
    content.appendChild(header);
    
    // Comparison section
    const comparison = document.createElement('div');
    comparison.className = 'brevity-modal-comparison';
    
    const stats = document.createElement('div');
    stats.className = 'brevity-modal-stats';
    stats.innerHTML = `
      <span class="stat-item"><strong>${charsSaved}</strong> chars saved</span>
      <span class="stat-separator">•</span>
      <span class="stat-item"><strong>${percentLabel}</strong> reduction</span>
      <span class="stat-separator">•</span>
      <span class="stat-item"><strong>${tokenLabel}</strong> tokens saved</span>
      <span class="stat-separator">•</span>
      <span class="stat-item">via <strong>${providerLabel}</strong></span>
    `;
    comparison.appendChild(stats);

    // Upgrade-in-progress indicator (visible when semantic compression is racing)
    if (meta.mayUpgrade) {
      const upgradeHint = document.createElement('div');
      upgradeHint.id = 'brevity-upgrade-indicator';
      upgradeHint.innerHTML = `
        <span class="brevity-upgrade-spinner"></span>
        AI compression in progress…
      `;
      comparison.appendChild(upgradeHint);
    }
    
    // Original text section
    const originalSection = document.createElement('div');
    originalSection.className = 'brevity-comparison-section original';
    originalSection.innerHTML = `
      <h3>Original</h3>
      <div class="brevity-text-preview">${escapeHtml(original)}</div>
    `;
    comparison.appendChild(originalSection);
    
    // Shortened text section
    const shortenedSection = document.createElement('div');
    shortenedSection.className = 'brevity-comparison-section shortened';
    shortenedSection.innerHTML = `
      <h3>Shortened</h3>
      <div class="brevity-text-preview">${escapeHtml(shortened)}</div>
    `;
    comparison.appendChild(shortenedSection);
    
    content.appendChild(comparison);
    
    // Button section
    const buttons = document.createElement('div');
    buttons.className = 'brevity-modal-buttons';
    buttons.innerHTML = `
      <button type="button" class="btn btn-primary btn-send-shortened">
        <span>✓</span> Send Shortened
      </button>
      <button type="button" class="btn btn-secondary btn-edit">
        <span>✏</span> Edit in Composer
      </button>
      <button type="button" class="btn btn-secondary btn-send-original">
        Send Original
      </button>
      <button type="button" class="btn btn-tertiary btn-cancel">
        Cancel
      </button>
    `;
    content.appendChild(buttons);
    
    // Append content to modal
    modal.appendChild(content);
    
    // Attach event listeners
    attachEventListeners(modal);
    
    return modal;
  }
  
  /**
   * Attach event listeners to modal buttons
   */
  function attachEventListeners(modal) {
    const closeBtn = modal.querySelector('.brevity-modal-close');
    const sendShortenedBtn = modal.querySelector('.btn-send-shortened');
    const editBtn = modal.querySelector('.btn-edit');
    const sendOriginalBtn = modal.querySelector('.btn-send-original');
    const cancelBtn = modal.querySelector('.btn-cancel');
    
    function cleanup(choice) {
      if (currentResolve) {
        currentResolve(choice);
        currentResolve = null;
      }
      modal.classList.remove('brevity-modal-visible');
      setTimeout(() => modal.remove(), 300);
    }
    
    closeBtn.addEventListener('click', () => cleanup('cancel'));
    sendShortenedBtn.addEventListener('click', () => cleanup('send_shortened'));
    editBtn.addEventListener('click', () => cleanup('edit'));
    sendOriginalBtn.addEventListener('click', () => cleanup('send_original'));
    cancelBtn.addEventListener('click', () => cleanup('cancel'));
    
    // Keyboard shortcuts
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cleanup('cancel');
      if (e.key === '1' || e.key === 'Enter' && sendShortenedBtn === document.activeElement) cleanup('send_shortened');
      if (e.key === '2') cleanup('edit');
      if (e.key === '3') cleanup('send_original');
      if (e.key === '0') cleanup('cancel');
    });
    
    // Click outside to cancel
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup('cancel');
    });
  }
  
  /**
   * Inject modal styles
   */
  function injectStyles() {
    // Only inject once
    if (document.getElementById('brevity-modal-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'brevity-modal-styles';
    style.textContent = `
      .brevity-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        transition: background 0.3s ease;
      }
      
      .brevity-modal-visible {
        background: rgba(0, 0, 0, 0.5) !important;
      }
      
      .brevity-modal-content {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: brevity-slide-in 0.3s ease;
      }
      
      @keyframes brevity-slide-in {
        from {
          opacity: 0;
          transform: translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .brevity-modal-header {
        padding: 20px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .brevity-modal-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
      }
      
      .brevity-modal-close {
        background: none;
        border: none;
        font-size: 24px;
        color: #6b7280;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s;
      }
      
      .brevity-modal-close:hover {
        background: #f3f4f6;
        color: #1f2937;
      }
      
      .brevity-modal-comparison {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      
      .brevity-modal-stats {
        display: flex;
        justify-content: center;
        gap: 16px;
        margin-bottom: 20px;
        padding: 12px;
        background: #f0fdf4;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        color: #15803d;
      }
      
      .stat-separator {
        opacity: 0.5;
      }
      
      .brevity-comparison-section {
        margin-bottom: 16px;
      }
      
      .brevity-comparison-section h3 {
        font-size: 13px;
        font-weight: 600;
        color: #4b5563;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .brevity-comparison-section.original h3 {
        color: #9ca3af;
      }
      
      .brevity-comparison-section.shortened h3 {
        color: #059669;
      }
      
      .brevity-text-preview {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 12px;
        font-size: 13px;
        line-height: 1.6;
        color: #374151;
        word-break: break-word;
        white-space: pre-wrap;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, monospace;
      }
      
      .brevity-comparison-section.shortened .brevity-text-preview {
        background: #f0fdf4;
        border-color: #dcfce7;
      }
      
      .brevity-modal-buttons {
        padding: 16px 20px;
        border-top: 1px solid #e5e7eb;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      
      .btn {
        padding: 10px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      
      .btn-primary {
        background: #059669;
        color: #fff;
        grid-column: 1 / 3;
      }
      
      .btn-primary:hover {
        background: #047857;
      }
      
      .btn-primary:active {
        transform: scale(0.98);
      }
      
      .btn-secondary {
        background: #e5e7eb;
        color: #374151;
      }
      
      .btn-secondary:hover {
        background: #d1d5db;
      }
      
      .btn-secondary:active {
        transform: scale(0.98);
      }
      
      .btn-tertiary {
        background: transparent;
        color: #6b7280;
        border: 1px solid #d1d5db;
        grid-column: 1 / 3;
      }
      
      .btn-tertiary:hover {
        background: #f9fafb;
        border-color: #9ca3af;
      }
      
      .btn-tertiary:active {
        transform: scale(0.98);
      }
      
      .btn:focus {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }

      /* Upgrade-in-progress indicator */
      #brevity-upgrade-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 8px 12px;
        margin-bottom: 12px;
        border-radius: 6px;
        background: #eff6ff;
        color: #2563eb;
        font-size: 12px;
        font-weight: 500;
        animation: brevity-pulse 1.5s ease-in-out infinite;
      }

      .brevity-upgrade-spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid #93c5fd;
        border-top-color: #2563eb;
        border-radius: 50%;
        animation: brevity-spin 0.8s linear infinite;
      }

      @keyframes brevity-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes brevity-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      /* Flash animation when semantic upgrade lands */
      @keyframes brevity-upgrade-flash {
        0% { background: #dcfce7; border-color: #86efac; }
        100% { background: #f0fdf4; border-color: #dcfce7; }
      }

      .brevity-upgraded .brevity-text-preview {
        animation: brevity-upgrade-flash 1s ease;
      }
      
      @media (max-width: 600px) {
        .brevity-modal-content {
          width: 95%;
          max-height: 90vh;
        }
        
        .brevity-modal-buttons {
          grid-template-columns: 1fr;
        }
        
        .btn-primary,
        .btn-tertiary {
          grid-column: 1 / 2;
        }
      }
    `;
    
    document.head.appendChild(style);
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
  
  /**
   * Live-update the modal with a semantic upgrade result.
   * Called by content.js when a 'semanticUpgrade' message arrives.
   */
  function update(original, shortened, meta) {
    const modal = document.getElementById('brevity-preview-modal');
    if (!modal) return; // modal already closed

    // Recalculate stats
    const charsSaved = original.length - shortened.length;
    const percentReduction = original.length ? (charsSaved / original.length) * 100 : 0;
    const percentLabel = percentReduction < 1 ? '<1%' : `${Math.round(percentReduction)}%`;
    
    const tokensSaved = (meta.originalTokens != null && meta.shortenedTokens != null)
      ? Math.max(0, meta.originalTokens - meta.shortenedTokens)
      : (charsSaved > 0 ? Math.max(1, Math.round(charsSaved / 4)) : 0);
    const tokenLabel = (meta.originalTokens != null && meta.shortenedTokens != null)
      ? `${tokensSaved}`
      : `≈${tokensSaved}`;

    const providerLabel = meta.provider
      ? `${escapeHtml(meta.provider)}${meta.model ? ' \u00b7 ' + escapeHtml(String(meta.model).split('/').pop()) : ''}`
      : 'local-regex';

    // Update stats bar
    const statsEl = modal.querySelector('.brevity-modal-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <span class="stat-item"><strong>${charsSaved}</strong> chars saved</span>
        <span class="stat-separator">\u2022</span>
        <span class="stat-item"><strong>${percentLabel}</strong> reduction</span>
        <span class="stat-separator">\u2022</span>
        <span class="stat-item"><strong>${tokenLabel}</strong> tokens saved</span>
        <span class="stat-separator">\u2022</span>
        <span class="stat-item">via <strong>${providerLabel}</strong></span>
      `;
    }

    // Update shortened text
    const shortenedSection = modal.querySelector('.brevity-comparison-section.shortened');
    if (shortenedSection) {
      const preview = shortenedSection.querySelector('.brevity-text-preview');
      if (preview) preview.textContent = shortened;
      // Flash highlight to draw attention
      shortenedSection.classList.remove('brevity-upgraded');
      // Force reflow so the animation restarts
      void shortenedSection.offsetWidth;
      shortenedSection.classList.add('brevity-upgraded');
    }

    // Remove upgrade indicator
    const indicator = document.getElementById('brevity-upgrade-indicator');
    if (indicator) indicator.remove();

    console.log('[BrevityPrompt] Modal upgraded to', meta.provider);
  }

  // Public API
  return {
    show: show,
    update: update
  };
})();
