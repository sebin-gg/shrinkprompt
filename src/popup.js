// Popup.js - Handles the extension popup UI

const enableToggle = document.getElementById('enableToggle');
const toggleText = document.getElementById('toggleText');
const settingsBtn = document.getElementById('settingsBtn');
const tokensSaved = document.getElementById('tokensSaved');
const promptsOptimized = document.getElementById('promptsOptimized');

// Load current state on popup open
document.addEventListener('DOMContentLoaded', () => {
  loadToggleState();
  loadStats();
});

// Load toggle state from storage
async function loadToggleState() {
  try {
    const storage = await chrome.storage.sync.get(['enabled']);
    // Missing key = off (matches install default and background isExtensionEnabled)
    const isEnabled = storage.enabled === true;
    enableToggle.checked = isEnabled;
    updateToggleText(isEnabled);
  } catch (error) {
    console.error('[BrevityPrompt] Error loading toggle state:', error);
  }
}

function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
    const stats = response?.stats || {};
    tokensSaved.textContent = Number(stats.tokensSaved || 0).toLocaleString();
    promptsOptimized.textContent = Number(stats.promptsOptimized || 0).toLocaleString();
  });
}

// Update toggle text and visual state
function updateToggleText(isEnabled) {
  toggleText.textContent = isEnabled ? 'Enabled' : 'Disabled';
}

// Listen for toggle changes
enableToggle.addEventListener('change', async (e) => {
  const isEnabled = e.target.checked;
  updateToggleText(isEnabled);
  
  try {
    await chrome.storage.sync.set({ enabled: isEnabled });
    console.log('[BrevityPrompt] Toggle state saved:', isEnabled);
  } catch (error) {
    console.error('[BrevityPrompt] Error saving toggle state:', error);
  }
});

// Open settings page
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage !== undefined 
    ? chrome.runtime.openOptionsPage() 
    : chrome.tabs.create({ url: chrome.runtime.getURL('src/settings.html') });
});
