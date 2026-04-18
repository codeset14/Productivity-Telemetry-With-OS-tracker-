/**
 * popup.js — Extension Popup (v2)
 *
 * Features:
 * - Start / End focus session
 * - Live session timer
 * - Label last visited site (productive / distracting)
 * - Today's stats from IndexedDB
 */

const DB_NAME    = 'focus_tracker_db';
const DB_VERSION = 2;

// ─── DB helpers ────────────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onupgradeneeded = () => {}; // Dashboard handles upgrades
  });
}

async function getSetting(key, def = null) {
  try {
    const db  = await openDB();
    return new Promise((resolve) => {
      const req = db.transaction('settings', 'readonly').objectStore('settings').get(key);
      req.onsuccess = () => { db.close(); resolve(req.result ? req.result.value : def); };
      req.onerror   = () => { db.close(); resolve(def); };
    });
  } catch { return def; }
}

async function getTodayStats() {
  try {
    const db  = await openDB();
    const all = await new Promise((resolve) => {
      const req = db.transaction('activity_log', 'readonly').objectStore('activity_log').getAll();
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror   = () => { db.close(); resolve([]); };
    });

    const today = new Date().toISOString().slice(0, 10);
    const todayLogs = all.filter(l => l.timestamp && l.timestamp.startsWith(today));

    let productive = 0, distracting = 0;
    todayLogs.forEach(l => {
      if (l.category === 'productive')  productive  += l.duration;
      if (l.category === 'distracting') distracting += l.duration;
    });

    const total  = productive + distracting;
    const score  = total === 0 ? 0 : Math.round(((productive - distracting) / total + 1) / 2 * 100);

    return { productive, distracting, score };
  } catch { return { productive: 0, distracting: 0, score: 0 }; }
}

async function getLastSession() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const req = db.transaction('sessions', 'readonly').objectStore('sessions').getAll();
      req.onsuccess = () => {
        db.close();
        const all = req.result || [];
        resolve(all.length ? all[all.length - 1] : null);
      };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

// ─── Formatting ────────────────────────────────────────────────────────────────

function fmtDuration(secs) {
  if (!secs || secs <= 0) return '0m';
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtTimer(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Render ────────────────────────────────────────────────────────────────────

let timerInterval = null;

async function render() {
  const root = document.getElementById('root');

  // Get status from background
  let status = {};
  try {
    status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  } catch {
    root.innerHTML = '<div class="loading">Extension not active</div>';
    return;
  }

  const { settings = {}, currentSession = null } = status;
  const sessionActive = settings.focusEnabled;

  // Stats
  const stats   = await getTodayStats();
  const lastSess = await getLastSession();

  // Timer (elapsed since session start)
  let elapsed = 0;
  if (sessionActive && settings.sessionStart) {
    elapsed = Math.round((Date.now() - new Date(settings.sessionStart).getTime()) / 1000);
  }

  // Build HTML
  const focusSection = sessionActive ? `
    <div class="focus-section">
      <div class="focus-header">
        <span class="focus-label">Focus Session</span>
        <span class="status-badge status-active">Active</span>
      </div>
      <div class="session-timer" id="timer">${fmtTimer(elapsed)}</div>
      <div class="session-site">${currentSession ? '📍 ' + currentSession.site : 'Tracking…'}</div>
      <button class="btn btn-end" id="endBtn">End Session</button>
    </div>
  ` : `
    <div class="focus-section">
      <div class="focus-header">
        <span class="focus-label">Focus Session</span>
        <span class="status-badge status-inactive">Inactive</span>
      </div>
      <button class="btn btn-start" id="startBtn">▶ Start Focus Session</button>
    </div>
  `;

  const statsSection = `
    <div class="stats-row">
      <div class="stat-box">
        <span class="stat-num">${stats.score}</span>
        <span class="stat-lbl">Score</span>
      </div>
      <div class="stat-box">
        <span class="stat-num" style="color:#22c55e">${fmtDuration(stats.productive)}</span>
        <span class="stat-lbl">Productive</span>
      </div>
      <div class="stat-box">
        <span class="stat-num" style="color:#ef4444">${fmtDuration(stats.distracting)}</span>
        <span class="stat-lbl">Distracting</span>
      </div>
    </div>
  `;

  const lastSection = lastSess ? `
    <div class="last-section">
      <div class="last-title">Label Last Session</div>
      <div class="last-row">
        <div class="last-info">
          <div class="last-site">${lastSess.site}</div>
          <div class="last-dur">${fmtDuration(lastSess.duration)} · ${lastSess.category}</div>
        </div>
        <div class="label-btns">
          <button class="lbl-btn lbl-prod ${lastSess.userLabel === 'productive' ? 'lbl-active-prod' : ''}"
                  data-site="${lastSess.site}" data-label="productive">✓ Work</button>
          <button class="lbl-btn lbl-dist ${lastSess.userLabel === 'distracting' ? 'lbl-active-dist' : ''}"
                  data-site="${lastSess.site}" data-label="distracting">✕ Distract</button>
        </div>
      </div>
    </div>
  ` : '';

  root.innerHTML = focusSection + statsSection + lastSection + `
    <div class="footer">
      <a href="http://localhost:3000" target="_blank">Open Dashboard →</a>
    </div>
  `;

  // ── Event listeners ──────────────────────────────────────────────────────────

  document.getElementById('startBtn')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'START_FOCUS' });
    render();
  });

  document.getElementById('endBtn')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'END_SESSION' });
    clearInterval(timerInterval);
    render();
  });

  document.querySelectorAll('[data-label]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { site, label } = btn.dataset;
      await chrome.runtime.sendMessage({ type: 'LABEL_SITE', site, label });
      render();
    });
  });

  // ── Timer tick ──────────────────────────────────────────────────────────────
  clearInterval(timerInterval);
  if (sessionActive && settings.sessionStart) {
    const startMs = new Date(settings.sessionStart).getTime();
    timerInterval = setInterval(() => {
      const secs = Math.round((Date.now() - startMs) / 1000);
      const el = document.getElementById('timer');
      if (el) el.textContent = fmtTimer(secs);
    }, 1000);
  }
}

render();
