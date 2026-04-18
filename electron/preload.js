/**
 * preload.js — Secure Context Bridge (v2)
 *
 * Runs in the renderer process BEFORE your React app loads.
 * Exposes a minimal, typed API on window.electronBridge so your
 * React app can receive OS activity without Node access.
 *
 * Security model:
 *   - contextIsolation: true  → preload runs in isolated world
 *   - nodeIntegration: false  → renderer has no Node APIs
 *   - Only the methods below are exposed to the page
 *
 * ⚠️  Nothing in your existing React code needs to change.
 *     The bridge injects data using the SAME window.postMessage format
 *     your store.js already listens for (source: 'focus_tracker_bridge').
 *
 * ─── [ADDED v2] INTERVENTION BRIDGE ─────────────────────────────────────────
 * Listens for 'show-distraction-popup' IPC from main.js and:
 *  1. Plays an alert sound via Web Audio API (renderer context has audio).
 *  2. Renders an in-app intervention overlay DOM element directly.
 *  3. Exposes onDistractionPopup() so host app can also subscribe if needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { contextBridge, ipcRenderer } = require('electron');

// ─── Expose safe API to the renderer ─────────────────────────────────────────
contextBridge.exposeInMainWorld('electronBridge', {

  /** Called by main.js → sends OS activity into React store. */
  onActivity: (callback) => {
    ipcRenderer.on('os-activity', (_event, data) => callback(data));
  },

  /** One-shot fetch of all stored OS segments */
  getOsHistory: () => ipcRenderer.invoke('get-os-history'),

  /** Clear JSON-persisted OS history */
  clearOsHistory: () => ipcRenderer.invoke('clear-os-history'),

  /** True if running inside Electron */
  isElectron: true,

  /**
   * [ADDED] Distraction popup IPC bridge.
   * Subscribe to 'show-distraction-popup' events fired by main.js.
   * Payload: { appName: string, label: string }
   */
  onDistractionPopup: (callback) => {
    ipcRenderer.on('show-distraction-popup', (_event, data) => callback(data));
  },
});

// ─── Auto-bridge: forward IPC → window.postMessage ───────────────────────────
ipcRenderer.on('os-activity', (_event, data) => {
  if (data.log) {
    window.postMessage({
      source:  'focus_tracker_bridge',
      type:    'LOGS',
      payload: [data.log],
    }, '*');
  }
  if (data.session) {
    window.postMessage({
      source:  'focus_tracker_bridge',
      type:    'SESSIONS',
      payload: [data.session],
    }, '*');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ── [ADDED] In-renderer intervention popup + sound ────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//
// When main.js fires 'show-distraction-popup', this preload code:
//   1. Synthesizes a tri-tone alert sound via Web Audio API.
//   2. Injects a full-screen intervention overlay into the renderer DOM.
//
// This runs in the RENDERER context (not main), so Web Audio works perfectly.
// The overlay is injected at document-body level and auto-dismisses after 12 s.
// ─────────────────────────────────────────────────────────────────────────────

const ELECTRON_IV_ID    = 'ft-electron-intervention';
const ELECTRON_IV_STYLE = 'ft-electron-iv-style';

/** Synthesize a short alert tone — no assets required */
function _playElectronAlertSound() {
  try {
    const ctx    = new window.AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);

    [698.5, 587.3, 466.2].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.13);
      gain.gain.linearRampToValueAtTime(0.85, ctx.currentTime + i * 0.13 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.2);
      osc.connect(gain);
      gain.connect(master);
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.22);
    });

    setTimeout(() => ctx.close(), 700);
  } catch (_) { /* fail silently */ }
}

/** Inject intervention overlay styles once */
function _ensureElectronIVStyles() {
  if (document.getElementById(ELECTRON_IV_STYLE)) return;
  const s = document.createElement('style');
  s.id = ELECTRON_IV_STYLE;
  s.textContent = `
    #ft-electron-intervention {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      animation: ft-el-fade 0.18s ease;
    }
    @keyframes ft-el-fade { from { opacity:0; } to { opacity:1; } }

    #ft-el-card {
      background: #161b22; border: 1px solid #30363d;
      border-top: 3px solid #f59e0b; border-radius: 14px;
      padding: 36px 44px 32px; text-align: center;
      max-width: 420px; width: calc(100vw - 48px);
      box-shadow: 0 24px 80px rgba(0,0,0,0.75);
      animation: ft-el-pop 0.25s cubic-bezier(0.34,1.56,0.64,1);
      position: relative;
    }
    @keyframes ft-el-pop {
      from { opacity:0; transform: scale(0.88) translateY(10px); }
      to   { opacity:1; transform: scale(1)    translateY(0);    }
    }
    #ft-el-timer {
      position: absolute; bottom:0; left:0; height:3px;
      background: linear-gradient(90deg, #f59e0b, #ef4444);
      border-radius: 0 0 14px 14px;
      animation: ft-el-shrink 12s linear forwards;
    }
    @keyframes ft-el-shrink { from { width:100%; } to { width:0%; } }

    #ft-el-icon {
      width:64px; height:64px; border-radius:50%;
      background: rgba(245,158,11,0.12); border: 2px solid rgba(245,158,11,0.35);
      display:flex; align-items:center; justify-content:center;
      margin:0 auto 16px; font-size:28px;
    }
    #ft-el-badge {
      display:inline-flex; align-items:center; gap:5px;
      background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3);
      color:#f59e0b; font-size:10px; font-weight:700; letter-spacing:1px;
      text-transform:uppercase; padding:3px 10px; border-radius:100px; margin-bottom:14px;
    }
    #ft-el-title { font-size:20px; font-weight:700; color:#f0f6fc; margin:0 0 8px; }
    #ft-el-desc  { font-size:13.5px; color:#8b949e; line-height:1.6; margin:0 0 26px; }
    #ft-el-desc strong { color:#e6edf3; font-weight:600; }
    #ft-el-actions { display:flex; flex-direction:column; gap:10px; }
    #ft-el-dismiss-btn {
      padding:11px 24px; background:#3b82f6; color:#fff;
      border:none; border-radius:8px; font-size:14px; font-weight:600;
      cursor:pointer; font-family:inherit; width:100%;
      transition: background 0.15s;
    }
    #ft-el-dismiss-btn:hover { background:#2563eb; }
    #ft-el-continue-btn {
      padding:11px 24px; background:transparent; color:#6e7681;
      border:1px solid #30363d; border-radius:8px; font-size:13px;
      font-weight:500; cursor:pointer; font-family:inherit; width:100%;
    }
    #ft-el-continue-btn:hover { color:#8b949e; border-color:#484f58; }
    #ft-el-x {
      position:absolute; top:14px; right:14px;
      width:28px; height:28px; border-radius:50%;
      border:1px solid #30363d; background:transparent; color:#6e7681;
      font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition: background 0.15s;
    }
    #ft-el-x:hover { background:#21262d; color:#e6edf3; }
  `;
  document.head.appendChild(s);
}

function _removeElectronIV() {
  document.getElementById(ELECTRON_IV_ID)?.remove();
}

function _showElectronInterventionPopup(appName, label) {
  if (document.getElementById(ELECTRON_IV_ID)) return;
  _ensureElectronIVStyles();

  const root = document.createElement('div');
  root.id = ELECTRON_IV_ID;
  root.innerHTML = `
    <div id="ft-el-card">
      <button id="ft-el-x" aria-label="Dismiss">✕</button>
      <div id="ft-el-timer"></div>
      <div id="ft-el-icon">⚠️</div>
      <div id="ft-el-badge">⚡ Distraction Detected</div>
      <h2 id="ft-el-title">You switched to ${label}</h2>
      <p id="ft-el-desc">
        <strong>${label}</strong> is a distracting app.<br>
        Stay on track — your goals are worth it.
      </p>
      <div id="ft-el-actions">
        <button id="ft-el-dismiss-btn">Got it, stay focused</button>
        <button id="ft-el-continue-btn">Continue Anyway</button>
      </div>
    </div>`;

  document.body.appendChild(root);

  root.querySelector('#ft-el-dismiss-btn').addEventListener('click', _removeElectronIV);
  root.querySelector('#ft-el-continue-btn').addEventListener('click', _removeElectronIV);
  root.querySelector('#ft-el-x').addEventListener('click', _removeElectronIV);
  root.addEventListener('click', (e) => { if (e.target === root) _removeElectronIV(); });

  setTimeout(_removeElectronIV, 12000);
}

// ── Wire up the IPC listener ──────────────────────────────────────────────────
ipcRenderer.on('show-distraction-popup', (_event, { appName, label }) => {
  _playElectronAlertSound();
  _showElectronInterventionPopup(appName, label || appName);
});
// ── [END ADDED] ───────────────────────────────────────────────────────────────
