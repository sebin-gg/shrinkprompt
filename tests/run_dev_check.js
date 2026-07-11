/**
 * @file tests/run_dev_check.js
 * @description Cross-platform developer environment browser loader and directory watcher.
 *
 * This script automates:
 *  1. Locating the local Google Chrome binary path (Windows/macOS/Linux).
 *  2. Booting an isolated Chrome instance loading BrevityPrompt unpacked.
 *  3. Setting up a zero-install directory watcher over src/ to notify on edits.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Google Chrome Path Auto-Discovery
// ─────────────────────────────────────────────────────────────────────────────

function getChromeExecutablePath() {
  const platform = os.platform();

  if (platform === 'win32') {
    const commonPaths = [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p;
    }
  } else if (platform === 'darwin') {
    const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(macPath)) return macPath;
  } else if (platform === 'linux') {
    const linuxBinaries = [
      '/usr/bin/google-chrome',
      '/usr/bin/chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    for (const b of linuxBinaries) {
      if (fs.existsSync(b)) return b;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Launch Development Chrome
// ─────────────────────────────────────────────────────────────────────────────

function launchChrome() {
  const chromePath = getChromeExecutablePath();
  if (!chromePath) {
    console.error('❌ Could not locate Google Chrome on this system.');
    console.error('Supported defaults:');
    console.error(' - Windows: Program Files or LocalAppData Chrome Application folder');
    console.error(' - macOS: /Applications/Google Chrome.app');
    console.error(' - Linux: /usr/bin/google-chrome');
    process.exit(1);
  }

  console.log(`🚀 Found Chrome binary: ${chromePath}`);

  // Create isolated scratch profile directory
  const profileDir = path.join(projectRoot, 'scratch', 'dev-chrome-profile');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const args = [
    `--load-extension=${projectRoot}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'chrome://extensions/',
    'https://chatgpt.com',
    'https://claude.ai',
    'https://gemini.google.com'
  ];

  console.log('🔧 Launching isolated Chrome with args:', args.slice(0, 2).join(' '));

  const child = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore'
  });

  child.unref();
  console.log('✅ Chrome launched successfully.');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Zero-Install Directory Watcher (fs.watch)
// ─────────────────────────────────────────────────────────────────────────────

function setupWatcher() {
  const watchDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(watchDir)) {
    console.warn(`⚠️  Source directory ${watchDir} does not exist. Watcher disabled.`);
    return;
  }

  console.log(`👁️  Watching directory ${watchDir} for edits...`);
  
  let debounceTimeout = null;

  function watchRecursive(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        watchRecursive(fullPath);
      }
    });

    fs.watch(dir, (eventType, filename) => {
      if (!filename) return;

      // Debounce rapid successive events from IDE saves
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        console.log(`\n🔔 File modification detected: src/${filename} (${eventType})`);
        console.log('👉 To reload: go to chrome://extensions/, click the reload icon on BrevityPrompt, then refresh your active chat tab.');
      }, 250);
    });
  }

  try {
    watchRecursive(watchDir);
  } catch (err) {
    console.error('❌ Failed to establish directory watcher:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Main Loop
// ─────────────────────────────────────────────────────────────────────────────

launchChrome();
setupWatcher();
