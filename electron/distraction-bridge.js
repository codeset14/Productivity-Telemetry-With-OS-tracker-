/**
 * electron-distraction-bridge.js — OS App Switching Integration
 *
 * Monitors app switches and emits distraction signals:
 * - App switches (context switching)
 * - Distraction entry events
 * - Return to focused app
 *
 * Connects tracker.js output to dashboard store via IPC.
 */

const { ipcMain } = require('electron');

let lastAppSwitch = Date.now();
let appSwitchCount = 0;
let currentCategory = 'neutral';
let distractingStartTime = null;

/**
 * Initialize OS-level distraction monitoring.
 * Call from main.js after app is ready.
 */
function initializeOSDistractionTracking(tracker, mainWindow) {
  if (!tracker || !mainWindow) return;

  // ─── Monitor app switches ────────────────────────────────────────────────
  tracker.onActivity = (segment) => {
    const isContextSwitch = segment.appName !== lastApp;

    if (isContextSwitch) {
      appSwitchCount++;

      // Emit to dashboard
      mainWindow.webContents.send('os:app-switch', {
        from: lastApp,
        to: segment.appName,
        switchCount: appSwitchCount,
        timestamp: Date.now(),
      });
    }

    lastApp = segment.appName;
    currentCategory = segment.category;

    // Track if returning to focused app
    if (segment.category !== 'distracting' && distractingStartTime) {
      const distractionDuration = (Date.now() - distractingStartTime) / 1000;

      mainWindow.webContents.send('os:returned-to-focus', {
        distractionDurationSeconds: distractionDuration,
        timestamp: Date.now(),
      });

      distractingStartTime = null;
    }
  };

  // ─── Monitor distraction entry ───────────────────────────────────────────
  tracker.onDistractionEntry = (info) => {
    if (!distractingStartTime) {
      distractingStartTime = Date.now();

      mainWindow.webContents.send('os:distraction-entry', {
        appName: info.appName,
        windowTitle: info.windowTitle,
        timestamp: Date.now(),
      });
    }
  };
}

/**
 * Convert OS app switches to behavioral signals.
 * This is what feeds into the distraction engine.
 */
function convertAppSwitchToSignal() {
  const now = Date.now();
  const timeSinceLastSwitch = now - lastAppSwitch;

  // Emit signal every switch (or periodically)
  lastAppSwitch = now;

  return {
    type: 'APP_SWITCH',
    timestamp: now,
    switchCount: appSwitchCount,
    category: currentCategory,
    isDistracting: currentCategory === 'distracting',
  };
}

/**
 * Reset tracking state (e.g., when focus session ends).
 */
function resetTracking() {
  appSwitchCount = 0;
  lastAppSwitch = Date.now();
  currentCategory = 'neutral';
  distractingStartTime = null;
}

/**
 * IPC handlers for main process to communicate with renderer.
 */
function setupIPCHandlers(mainWindow) {
  // Get current OS app tracking state
  ipcMain.handle('os:get-tracking-state', () => {
    return {
      appSwitchCount,
      currentCategory,
      inDistractionState: distractingStartTime !== null,
    };
  });

  // Reset app tracking (for new focus session)
  ipcMain.handle('os:reset-tracking', () => {
    resetTracking();
    return { success: true };
  });
}

module.exports = {
  initializeOSDistractionTracking,
  convertAppSwitchToSignal,
  resetTracking,
  setupIPCHandlers,
};
