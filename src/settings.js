/**
 * @file src/settings.js
 * Loaded as <script type="module"> from settings.html.
 * All default patterns and companion config come from the canonical
 * shared module — do NOT duplicate constants here.
 */
import {
  DEFAULT_PATTERNS,
  DEFAULT_COMPANION_CONFIG,
  validatePattern
} from './shared/cleaner-rules.js';

// Module-level mutable state
let currentPatterns = { ...DEFAULT_PATTERNS };
let isDirty = false;

// Initialize settings page

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  loadPatterns();
  loadAiSettings();
  setupEventListeners();
});

/**
 * Set up tab switching
 */
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      
      // Update button active state
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      // Update content visibility
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
}

/**
 * Load patterns from storage and render form
 */
async function loadPatterns() {
  try {
    const storage = await chrome.storage.sync.get(['patterns']);
    if (storage.patterns) {
      currentPatterns = storage.patterns;
      // Ensure metadata is present
      Object.keys(currentPatterns).forEach(key => {
        if (!currentPatterns[key].displayName) {
          currentPatterns[key].displayName = DEFAULT_PATTERNS[key]?.displayName || key;
        }
        if (!currentPatterns[key].hint) {
          currentPatterns[key].hint = DEFAULT_PATTERNS[key]?.hint || '';
        }
      });
    } else {
      currentPatterns = { ...DEFAULT_PATTERNS };
    }
    
    renderPatternForm();
  } catch (error) {
    console.error('[BrevityPrompt Settings] Error loading patterns:', error);
    showToast('Error loading settings', 'error');
  }
}

/**
 * Render pattern form fields
 */
function renderPatternForm() {
  const patternsList = document.getElementById('patterns-list');
  patternsList.innerHTML = '';
  
  Object.entries(currentPatterns).forEach(([key, patternObj], index) => {
    const item = createPatternItem(key, patternObj, index);
    patternsList.appendChild(item);
  });
}

/**
 * Create a single pattern form item
 */
function createPatternItem(key, patternObj, index) {
  const item = document.createElement('div');
  item.className = `pattern-item ${!patternObj.enabled ? 'disabled' : ''}`;
  item.dataset.key = key;
  
  const checkboxId = `pattern-${key}`;
  
  item.innerHTML = `
    <input type="checkbox" id="${checkboxId}" class="pattern-checkbox" ${patternObj.enabled ? 'checked' : ''}>
    <label for="${checkboxId}" class="pattern-toggle" title="Toggle pattern">✓</label>
    <div class="pattern-details">
      <div class="pattern-category">${escapeHtml(patternObj.displayName)}</div>
      <div class="pattern-input-wrapper">
        <label class="pattern-label">Regex Pattern</label>
        <input type="text" class="pattern-input" data-key="${key}" value="${escapeHtml(patternObj.pattern)}" ${!patternObj.enabled ? 'disabled' : ''}>
        <div class="pattern-error-msg" style="display: none;"></div>
        <div class="pattern-hint">${escapeHtml(patternObj.hint)}</div>
        ${key.startsWith('custom_') ? '<button type="button" class="remove-filter">Remove filter</button>' : ''}
      </div>
    </div>
  `;
  
  // Attach event listeners
  const checkbox = item.querySelector('.pattern-checkbox');
  const input = item.querySelector('.pattern-input');
  
  checkbox.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    currentPatterns[key].enabled = enabled;
    input.disabled = !enabled;
    item.classList.toggle('disabled', !enabled);
    isDirty = true;
  });
  
  input.addEventListener('change', (e) => {
    const newPattern = e.target.value;
    
    // Validate regex
    const validation = validateRegex(newPattern);
    const errorMsg = item.querySelector('.pattern-error-msg');
    
    if (!validation.valid) {
      input.classList.add('error');
      errorMsg.textContent = validation.error;
      errorMsg.style.display = 'block';
      return;
    }
    
    input.classList.remove('error');
    errorMsg.style.display = 'none';
    currentPatterns[key].pattern = newPattern;
    isDirty = true;
  });
  
  input.addEventListener('input', () => {
    isDirty = true;
  });
  item.querySelector('.remove-filter')?.addEventListener('click', () => {
    delete currentPatterns[key];
    isDirty = true;
    renderPatternForm();
  });
  
  return item;
}

// validateRegex: delegates to validatePattern from shared/cleaner-rules.js
function validateRegex(pattern) {
  return validatePattern(pattern);
}


/**
 * Set up event listeners for buttons
 */
function setupEventListeners() {
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  
  saveBtn.addEventListener('click', savePatterns);
  resetBtn.addEventListener('click', resetPatterns);
  document.getElementById('addFilterBtn').addEventListener('click', addCustomFilter);
  document.getElementById('saveAiBtn').addEventListener('click', saveAiSettings);
}

function addCustomFilter() {
  const name = document.getElementById('customFilterName').value.trim();
  const pattern = document.getElementById('customFilterRegex').value.trim();
  const validation = validateRegex(pattern);
  if (!name || !pattern) return showToast('Enter a filter name and regex', 'error');
  if (!validation.valid) return showToast(validation.error, 'error');
  currentPatterns[`custom_${Date.now()}`] = { pattern, enabled: true, displayName: name, hint: 'Custom regex filter' };
  document.getElementById('customFilterName').value = '';
  document.getElementById('customFilterRegex').value = '';
  isDirty = true;
  renderPatternForm();
}

function isAllowedLocalUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

async function loadAiSettings() {
  const storage = await chrome.storage.sync.get(['companionConfig']);
  const config = { ...DEFAULT_COMPANION_CONFIG, ...(storage.companionConfig || {}) };
  const local = { ...DEFAULT_COMPANION_CONFIG.localModel, ...(config.localModel || {}) };
  document.getElementById('localModelEnabled').checked = local.enabled;
  document.getElementById('localModelEndpoint').value = local.endpoint;
  document.getElementById('localModelName').value = local.model;
  document.getElementById('cloudCompression').checked = config.cloudCompression;
  document.getElementById('companionApiUrl').value = config.apiUrl || DEFAULT_COMPANION_CONFIG.apiUrl;
  document.getElementById('minCloudCharacters').value = config.minCloudCharacters;
}

async function saveAiSettings() {
  const endpoint = document.getElementById('localModelEndpoint').value.trim();
  const model = document.getElementById('localModelName').value.trim();
  const apiUrl = document.getElementById('companionApiUrl').value.trim().replace(/\/$/, '');
  const minCloudCharacters = Number(document.getElementById('minCloudCharacters').value);
  if (!endpoint || !model || !apiUrl || !Number.isFinite(minCloudCharacters) || minCloudCharacters < 1) {
    return showToast('Enter valid AI settings', 'error');
  }
  if (!isAllowedLocalUrl(apiUrl) || !isAllowedLocalUrl(endpoint)) {
    return showToast('Companion and Ollama URLs must be localhost/127.0.0.1 (extension host permissions)', 'error');
  }
  await chrome.storage.sync.set({ companionConfig: {
    apiUrl,
    cloudCompression: document.getElementById('cloudCompression').checked,
    minCloudCharacters,
    localModel: { enabled: document.getElementById('localModelEnabled').checked, endpoint, model }
  }});
  showToast('AI settings saved', 'success');
}

/**
 * Save patterns to storage
 */
async function savePatterns() {
  // Validate all patterns before saving
  const allValid = Array.from(document.querySelectorAll('.pattern-input')).every(input => {
    const validation = validateRegex(input.value);
    return validation.valid;
  });
  
  if (!allValid) {
    showToast('Please fix validation errors before saving', 'error');
    return;
  }
  
  try {
    await chrome.storage.sync.set({ patterns: currentPatterns });
    isDirty = false;
    showToast('Settings saved successfully!', 'success');
    console.log('[BrevityPrompt Settings] Patterns saved:', currentPatterns);
  } catch (error) {
    console.error('[BrevityPrompt Settings] Error saving patterns:', error);
    showToast('Error saving settings', 'error');
  }
}

/**
 * Reset patterns to defaults
 */
async function resetPatterns() {
  if (!confirm('Are you sure you want to reset all patterns to defaults?')) {
    return;
  }
  
  currentPatterns = { ...DEFAULT_PATTERNS };
  isDirty = true;
  renderPatternForm();
  
  try {
    await chrome.storage.sync.set({ patterns: currentPatterns });
    isDirty = false;
    showToast('Patterns reset to defaults', 'success');
    console.log('[BrevityPrompt Settings] Patterns reset to defaults');
  } catch (error) {
    console.error('[BrevityPrompt Settings] Error resetting patterns:', error);
    showToast('Error resetting settings', 'error');
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/**
 * Escape HTML for safe display
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

// Warn if leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
