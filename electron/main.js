/**
 * main.js — Electron Main Process (v2)
 *
 * Responsibilities:
 *  1. Launch BrowserWindow → loads your existing Next.js dashboard
 *  2. Start OS activity tracker (active-win polling)
 *  3. Bridge IPC: push OS tracking data into the renderer (React app)
 *  4. [ADDED] Real-time intervention: desktop notification + alert sound
 *     when user switches to a distracting native app.
 *
 * ⚠️  ZERO changes to React app — this is purely additive.
 */

const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const path  = require('path');
const Store = require('electron-store');
const { startTracking, stopTracking } = require('./tracker');

const jsonStore = new Store({ name: 'os-activity' });

const DASHBOARD_URL = 'http://localhost:3000';

let mainWindow = null;

// ─── Create window ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 860,
    minWidth:  900,
    minHeight: 600,
    title: 'Productivity Telemetry',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  mainWindow.loadURL(DASHBOARD_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  mainWindow.webContents.once('did-finish-load', () => {
    startTracking({
      onActivity: handleActivity,
      intervalMs: 3000,

      // [ADDED] Fires immediately when user enters a distracting native app.
      // Triggers desktop notification + alert sound + in-app overlay.
      onDistractionEntry({ appName, windowTitle }) {
        maybeIntervene(appName, windowTitle);
      },
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopTracking();
  if (process.platform !== 'darwin') app.quit();
});

// ─── Activity handler ─────────────────────────────────────────────────────────
function handleActivity(segment) {
  if (!segment || segment.duration < 1) return;

  const history = jsonStore.get('segments', []);
  history.push(segment);
  if (history.length > 500) history.splice(0, history.length - 500);
  jsonStore.set('segments', history);

  const logEntry = {
    site:      segment.appName,
    category:  segment.category,
    duration:  segment.duration,
    timestamp: segment.startTime,
    source:    'electron-os',
  };

  const sessionEntry = {
    site:      segment.appName,
    title:     segment.windowTitle,
    startTime: segment.startTime,
    endTime:   segment.endTime,
    duration:  segment.duration,
    category:  segment.category,
    source:    'electron-os',
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('os-activity', { log: logEntry, session: sessionEntry });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ── [ADDED] REAL-TIME INTERVENTION for native apps ────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rate-limit: fire at most once per POPUP_COOLDOWN_MS per app.
 * lastPopupTimes maps appName → timestamp of last notification.
 */
const POPUP_COOLDOWN_MS  = 5 * 60 * 1000; // 5 minutes between alerts per app
const lastPopupTimes     = new Map();

/**
 * maybeIntervene — called by tracker's onDistractionEntry.
 *
 * For native (non-browser) distracting apps:
 *  1. Shows an OS desktop notification with action buttons.
 *  2. Sends IPC to renderer so preload can show an in-app overlay.
 *  3. Plays an alert sound via preload (Web Audio in renderer context).
 *
 * For browser apps (Chrome/Firefox etc.) the extension's content.js
 * handles the popup + sound directly — no duplication needed here.
 */
function maybeIntervene(appName, windowTitle) {
  const now      = Date.now();
  const appLower = (appName || '').toLowerCase();

  // Skip browsers — the Chrome extension handles those with content.js
  const isBrowser = ['chrome', 'firefox', 'safari', 'edge', 'brave', 'arc', 'opera']
    .some(b => appLower.includes(b));
  if (isBrowser) return;

  // Rate-limit per app
  const lastAt = lastPopupTimes.get(appName) || 0;
  if (now - lastAt < POPUP_COOLDOWN_MS) return;
  lastPopupTimes.set(appName, now);

  // Clean label: first segment of window title (e.g. "Discord" from "Discord - #general")
  const label = windowTitle
    ? windowTitle.split(' - ')[0].split(' — ')[0].trim()
    : appName;

  // ── 1. OS Desktop notification ────────────────────────────────────────────
  if (Notification.isSupported()) {
    const notif = new Notification({
      title:   '⚠️ Distraction Detected',
      body:    `You switched to ${label} during focus time.\nStay on track — your goals are worth it.`,
      urgency: 'normal', // 'critical' on Linux for max visibility
      timeoutType: 'default',
    });

    notif.on('click', () => {
      // Bring the dashboard window to front when notification is clicked
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    notif.show();
  }

  // ── 2. IPC → renderer in-app overlay + sound ──────────────────────────────
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('show-distraction-popup', { appName, label });
  }
}
// ── [END ADDED] ───────────────────────────────────────────────────────────────

// ─── IPC: Renderer → Main ─────────────────────────────────────────────────────
ipcMain.handle('get-os-history', () => {
  return jsonStore.get('segments', []);
});

ipcMain.handle('clear-os-history', () => {
  jsonStore.set('segments', []);
  return true;
});
