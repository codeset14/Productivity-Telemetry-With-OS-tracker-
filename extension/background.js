/**
 * background.js — Service Worker (v2 fixed)
 *
 * KEY FIXES:
 * 1. Focus state synced to chrome.storage.local — content script reads it on load
 *    without needing message passing (eliminates race condition)
 * 2. Sessions stored with error logging (was silent catch)
 * 3. Sensitivity thresholds fixed: high=always, medium=first visit, low=after grace period
 * 4. DB upgrade is idempotent — safe to run even if stores already exist
 */

importScripts("categories.js");

// ─── Constants ────────────────────────────────────────────────────────────────
const DB_NAME    = "focus_tracker_db";
const DB_VERSION = 2;
const MIN_SESSION_SECONDS = 3;

// ─── State ────────────────────────────────────────────────────────────────────
let currentSession = null;

// ─── Smart Distraction Warning State ───────────────────────────────────────────
const DISTRACTION_WARNING_STATE = {
  lastWarningPerSite: new Map(),     // site → timestamp
  warningLevelPerSite: new Map(),    // site → 'soft' | 'strong'
  cooldownMs: {
    soft: 1 * 60 * 1000,   // 1 minute between soft warnings
    strong: 5 * 60 * 1000, // 5 minutes between strong warnings
    global: 30 * 1000,     // 30 seconds between any warnings
  },
  lastGlobalWarning: 0,
};

// ─── Behavioral Signal Tracking (for distraction detection) ──────────────────
let visitedSitesIn10Min = new Map(); // site → count in last 10 minutes
let lastInteractionTime = Date.now();
let cumulativeIdleTime = 0;

// ─── IndexedDB ────────────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db  = e.target.result;
      const old = e.oldVersion;

      if (old < 1) {
        if (!db.objectStoreNames.contains("activity_log")) {
          const log = db.createObjectStore("activity_log", { keyPath: "id", autoIncrement: true });
          log.createIndex("timestamp", "timestamp");
          log.createIndex("site", "site");
          log.createIndex("category", "category");
        }
      }
      if (old < 2) {
        if (!db.objectStoreNames.contains("sessions")) {
          const s = db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
          s.createIndex("startTime", "startTime");
          s.createIndex("site", "site");
        }
        if (!db.objectStoreNames.contains("focus_events")) {
          const fe = db.createObjectStore("focus_events", { keyPath: "id", autoIncrement: true });
          fe.createIndex("type", "type");
          fe.createIndex("timestamp", "timestamp");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("user_labels")) {
          db.createObjectStore("user_labels", { keyPath: "site" });
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => {
      console.error("[FocusTracker] DB open error:", e.target.error);
      reject(req.error);
    };
  });
}

async function dbGet(store, key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, "readonly").objectStore(store).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror   = () => { db.close(); reject(req.error); };
    });
  } catch (e) {
    console.error("[FocusTracker] dbGet error:", store, key, e);
    return null;
  }
}

async function dbPut(store, data) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, "readwrite");
      t.objectStore(store).put(data);
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror    = (e) => { db.close(); console.error("[FocusTracker] dbPut error:", store, e.target.error); reject(t.error); };
    });
  } catch (e) {
    console.error("[FocusTracker] dbPut outer error:", store, e);
  }
}

async function dbAdd(store, data) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, "readwrite");
      const req = t.objectStore(store).add(data);
      t.oncomplete = () => { db.close(); resolve(req.result); };
      t.onerror    = (e) => { db.close(); console.error("[FocusTracker] dbAdd error:", store, e.target.error); reject(t.error); };
    });
  } catch (e) {
    console.error("[FocusTracker] dbAdd outer error:", store, e);
    return null;
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
// chrome.storage.local IS the single source of truth for focus settings.
// The dashboard writes here via bridge.js. Background reads from here.

function getSetting(key, def = null) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] !== undefined ? result[key] : def);
    });
  });
}

function setSetting(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

// ─── Dashboard Queue ──────────────────────────────────────────────────────────
// Appends data to chrome.storage.local queues that bridge.js drains on
// the dashboard page (localhost:3000).
async function queueForDashboard(session, logEntry) {
  try {
    await new Promise((resolve) => {
      chrome.storage.local.get(["pendingSessions", "pendingLogs"], (result) => {
        const sessions = result.pendingSessions || [];
        const logs     = result.pendingLogs     || [];
        sessions.push(session);
        logs.push(logEntry);
        chrome.storage.local.set({ pendingSessions: sessions, pendingLogs: logs }, resolve);
      });
    });
  } catch (e) {
    console.error("[FocusTracker] queueForDashboard error:", e);
  }
}

// ─── User labels ──────────────────────────────────────────────────────────────

async function getUserLabel(site) {
  const rec = await dbGet("user_labels", site);
  return rec ? rec.label : null;
}

// ─── Hybrid Classifier ────────────────────────────────────────────────────────

function analyzeBehavior(session) {
  const { duration, tabSwitches, interactions } = session;

  // Long focused session → productive
  if (duration >= 1800 && tabSwitches <= 3 && interactions >= 20) {
    return { category: "productive", reason: "behavior_heuristic", confidence: "medium" };
  }

  // Restless long session → distracting
  if (duration >= 1200 && tabSwitches >= 7) {
    return { category: "distracting", reason: "behavior_heuristic", confidence: "medium" };
  }

  return null;
}

async function classifySession(session) {
  // Layer 1: User override
  const userLabel = await getUserLabel(session.site);
  if (userLabel) {
    return { category: userLabel, reason: "user_override", confidence: "high" };
  }

  // Layer 2: Behavior signals
  const behaviorResult = analyzeBehavior(session);
  if (behaviorResult) return behaviorResult;

  // Layer 3: Default category map
  const cat = categorize(session.site);
  return { category: cat, reason: "default_list", confidence: "low" };
}

// ─── Session Builder ──────────────────────────────────────────────────────────

function getHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return null; }
}

async function endCurrentSession() {
  if (!currentSession) return;

  const endTime  = Date.now();
  const duration = Math.round((endTime - currentSession.startTime) / 1000);

  if (duration < MIN_SESSION_SECONDS) { currentSession = null; return; }

  const session = {
    site:         currentSession.site,
    startTime:    new Date(currentSession.startTime).toISOString(),
    endTime:      new Date(endTime).toISOString(),
    duration,
    interactions: currentSession.interactions || 0,
    tabSwitches:  currentSession.tabSwitches  || 0,
    // NEW: Behavioral signals for distraction detection
    clicks:       currentSession.clicks || 0,
    scrolls:      currentSession.scrolls || 0,
    keys:         currentSession.keys || 0,
    pageLoads:    currentSession.pageLoads || 0,
    idleTime:     currentSession.idleTime || 0,
    repeatVisits: currentSession.repeatVisits || 0,
    userLabel:    null,
  };

  const classification = await classifySession(session);
  session.category = classification.category;
  session.confidence = classification.confidence;
  session.reason = classification.reason;
  
  console.log("[FocusTracker] Session ended:", session.site, session.duration + "s", session.category, "(" + session.reason + ")");

  // Store in sessions
  const sid = await dbAdd("sessions", session);
  console.log("[FocusTracker] Session stored, id:", sid);

  // Also write activity_log for dashboard analytics
  const logEntry = {
    site:      session.site,
    duration:  session.duration,
    timestamp: session.startTime,
    category:  session.category,
    confidence: session.confidence,
    reason:    session.reason,
    source:    "extension",
  };
  await dbAdd("activity_log", logEntry);

  // Queue both for the bridge to forward to the dashboard page
  await queueForDashboard(session, logEntry);

  currentSession = null;
}

async function startNewSession(url) {
  await endCurrentSession();

  const site = getHostname(url);
  if (!site || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;

  currentSession = {
    url,
    site,
    startTime:    Date.now(),
    interactions: 0,
    tabSwitches:  0,
    // NEW: Behavioral signal tracking
    clicks:       0,
    scrolls:      0,
    keys:         0,
    pageLoads:    1, // new session = 1 page load
    idleTime:     0,
    repeatVisits: 0,
  };

  // Track repeat visits to the same site (for distraction pattern detection)
  const now = Date.now();
  const key10MinAgo = now - 10 * 60 * 1000;
  
  // Clean up old visit records
  for (const [site, visits] of visitedSitesIn10Min.entries()) {
    visitedSitesIn10Min.set(site, visits.filter(t => t > key10MinAgo));
    if (visitedSitesIn10Min.get(site).length === 0) {
      visitedSitesIn10Min.delete(site);
    }
  }
  
  // Add current visit
  if (!visitedSitesIn10Min.has(site)) {
    visitedSitesIn10Min.set(site, []);
  }
  visitedSitesIn10Min.get(site).push(now);
  currentSession.repeatVisits = visitedSitesIn10Min.get(site).length;

  lastInteractionTime = now;
  cumulativeIdleTime = 0;

  console.log("[FocusTracker] Session started:", site);
}

// ─── Focus Mode Controller ────────────────────────────────────────────────────

async function checkFocusMode(site, tabId) {
  const focusEnabled = await getSetting("focusEnabled", false);
  if (!focusEnabled) return;

  const [blockedSites, sensitivity, allowContinue, sessionStart, sessionDuration] =
    await Promise.all([
      getSetting("blockedSites",    []),
      getSetting("sensitivity",     "medium"),
      getSetting("allowContinue",   true),
      getSetting("sessionStart",    null),
      getSetting("sessionDuration", 25),
    ]);

  // Check session time limit
  if (sessionDuration && sessionStart) {
    const elapsed = (Date.now() - new Date(sessionStart).getTime()) / 60000;
    if (elapsed >= sessionDuration) {
      console.log("[FocusTracker] Session time limit reached");
      await setSetting("focusEnabled", false);
      await setSetting("sessionStart", null);
      await logFocusEvent("session_ended_time_limit", site);
      sendToTab(tabId, { type: "FOCUS_ENDED", reason: "time_limit" });
      return;
    }
  }

  // Check blocked
  const blocked = Array.isArray(blockedSites) ? blockedSites : [];
  const isBlocked = blocked.some(d => site === d || site.endsWith("." + d));
  if (isBlocked) {
    console.log("[FocusTracker] Blocked site:", site);
    await logFocusEvent("site_blocked", site);
    sendToTab(tabId, { type: "SHOW_BLOCK", site, allowContinue });
    return;
  }

  // Check category
  const userLabel = await getUserLabel(site);
  const category  = userLabel || categorize(site);
  if (category !== "distracting") return;

  // Sensitivity: 'low' = warn after 5min on site, 'medium' = warn on enter, 'high' = warn on enter
  // (actual per-page toast is handled by content.js on load;
  //  this path handles MID-SESSION switches that content.js won't catch)
  console.log("[FocusTracker] Distracting site in focus mode:", site, "sensitivity:", sensitivity);
  await logFocusEvent("warning_shown", site);
  sendToTab(tabId, { type: "SHOW_WARNING", site, allowContinue });
}

async function logFocusEvent(type, site) {
  await dbAdd("focus_events", { type, site, timestamp: new Date().toISOString() });
}

function sendToTab(tabId, message) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message).catch(e => {
    console.log("[FocusTracker] sendMessage skipped (tab not ready):", e?.message);
  });
}

// ─── Chrome Event Listeners ───────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (currentSession) currentSession.tabSwitches = (currentSession.tabSwitches || 0) + 1;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab?.url) await startNewSession(tab.url);
    // Note: content.js proactively checks focus state on load,
    // so we don't need to sendMessage here for initial page check.
  } catch {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.active) return;
  if (!tab?.url) return;
  await startNewSession(tab.url);
  // Check focus mode — small delay to let content script initialize
  setTimeout(async () => {
    await checkFocusMode(getHostname(tab.url), tabId);
  }, 500);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await endCurrentSession();
  } else {
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab?.url) await startNewSession(tab.url);
    } catch {}
  }
});

// Periodic flush — keeps sessions in DB even during very long single-site sessions
chrome.alarms.create("flush", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "flush" || !currentSession) return;
  console.log("[FocusTracker] Alarm flush for:", currentSession.site);
  const url = currentSession.url;
  await endCurrentSession();
  await startNewSession(url);
});

// ─── Idle Detection ───────────────────────────────────────────────────────────
(async () => {
  // Use a configurable idle timeout (default 5 minutes / 300s)
  const idleTimeout = await getSetting("idleTimeout", 300);
  chrome.idle.setDetectionInterval(idleTimeout);
})();

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === "idle" || newState === "locked") {
    console.log("[FocusTracker] System idle/locked, ending session to prevent metric skew");
    await logFocusEvent("system_idle", "");
    await endCurrentSession();
  } else if (newState === "active") {
    // Resume session on current tab if we became active again
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId: chrome.windows.WINDOW_ID_CURRENT });
      if (tabs[0]?.url) await startNewSession(tabs[0].url);
    } catch {}
  }
});

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {

      case "INTERACTION":
        if (currentSession) currentSession.interactions = (currentSession.interactions || 0) + 1;
        lastInteractionTime = Date.now();
        break;

      // NEW: Behavioral signal tracking for distraction detection
      case "CLICK":
        if (currentSession) currentSession.clicks = (currentSession.clicks || 0) + 1;
        lastInteractionTime = Date.now();
        break;

      case "SCROLL":
        if (currentSession) currentSession.scrolls = (currentSession.scrolls || 0) + 1;
        lastInteractionTime = Date.now();
        break;

      case "KEY":
        if (currentSession) currentSession.keys = (currentSession.keys || 0) + 1;
        lastInteractionTime = Date.now();
        break;

      case "PAGE_LOAD":
        if (currentSession) currentSession.pageLoads = (currentSession.pageLoads || 0) + 1;
        lastInteractionTime = Date.now();
        break;

      case "IDLE_DETECTED":
        // Content script detected idle (no interaction for X seconds)
        if (currentSession) currentSession.idleTime = (currentSession.idleTime || 0) + (msg.idleSeconds || 0);
        break;

      case "CONTINUE":
        await logFocusEvent("continue_clicked", msg.site || "");
        sendResponse({ ok: true });
        break;

      case "END_SESSION":
        await setSetting("focusEnabled", false);
        await setSetting("sessionStart", null);
        await logFocusEvent("session_ended_user", msg.site || "");
        await endCurrentSession();
        // Broadcast to all tabs
        const tabs = await chrome.tabs.query({});
        tabs.forEach(t => t.id && chrome.tabs.sendMessage(t.id, { type: "FOCUS_ENDED", reason: "user" }).catch(() => {}));
        sendResponse({ ok: true });
        break;

      case "START_FOCUS":
        await setSetting("focusEnabled", true);
        await setSetting("sessionStart", new Date().toISOString());
        await logFocusEvent("session_started", "");
        console.log("[FocusTracker] Focus session started");
        sendResponse({ ok: true });
        break;

      case "GET_STATUS": {
        const [settings, cs] = await Promise.all([
          Promise.all([
            getSetting("focusEnabled",    false),
            getSetting("blockedSites",    []),
            getSetting("sensitivity",     "medium"),
            getSetting("sessionDuration", 25),
            getSetting("allowContinue",   true),
            getSetting("sessionStart",    null),
          ]).then(([focusEnabled, blockedSites, sensitivity, sessionDuration, allowContinue, sessionStart]) =>
            ({ focusEnabled, blockedSites, sensitivity, sessionDuration, allowContinue, sessionStart })
          ),
          Promise.resolve(currentSession
            ? { site: currentSession.site, elapsed: Math.round((Date.now() - currentSession.startTime) / 1000) }
            : null
          ),
        ]);
        sendResponse({ settings, currentSession: cs });
        break;
      }

      case "LABEL_SITE":
        await dbPut("user_labels", { site: msg.site, label: msg.label, updatedAt: new Date().toISOString() });
        sendResponse({ ok: true });
        break;

      // Logged by content.js proactive check (not a message from background)
      case "WARNING_SHOWN_LOG":
        await logFocusEvent("warning_shown", msg.site || "");
        break;

      case "SITE_BLOCKED_LOG":
        await logFocusEvent("site_blocked", msg.site || "");
        break;

      case "BYPASS_ATTEMPT_LOG":
        await logFocusEvent("bypass_attempt", msg.site || "");
        console.warn(`[FocusTracker] Bypass attempt logged for ${msg.site}. Reason: ${msg.reason}`);
        break;

      // [ADDED] Smart intervention events — log to focus_events, no other side effects
      case "INTERVENTION_SHOWN":
        await logFocusEvent("intervention_shown", msg.site || "");
        console.log(`[FocusTracker] Intervention shown for ${msg.label || msg.site}`);
        sendResponse({ ok: true });
        break;

      case "INTERVENTION_CONTINUE":
        await logFocusEvent("intervention_continue", msg.site || "");
        console.log(`[FocusTracker] User continued past intervention on ${msg.site}`);
        sendResponse({ ok: true });
        break;

      // ━━━ NEW: Smart Distraction Warning Trigger ━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "TRIGGER_DISTRACTION_WARNING": {
        const { site, level, title, reason } = msg;
        const now = Date.now();
        const state = DISTRACTION_WARNING_STATE;

        // Check global cooldown
        if (now - state.lastGlobalWarning < state.cooldownMs.global) {
          console.log(`[FocusTracker] Global cooldown active, skipping warning for ${site}`);
          sendResponse({ ok: true });
          break;
        }

        // Check per-site cooldown
        const lastWarningTime = state.lastWarningPerSite.get(site) || 0;
        const timeSinceLastWarning = now - lastWarningTime;
        const previousLevel = state.warningLevelPerSite.get(site) || 'soft';
        const cooldown = previousLevel === 'soft' ? state.cooldownMs.soft : state.cooldownMs.strong;

        if (timeSinceLastWarning < cooldown) {
          console.log(`[FocusTracker] Site cooldown active (${previousLevel}), skipping warning for ${site}`);
          sendResponse({ ok: true });
          break;
        }

        // Update state
        state.lastWarningPerSite.set(site, now);
        state.warningLevelPerSite.set(site, level || 'soft');
        state.lastGlobalWarning = now;

        // Determine which popup to render
        const warningLevel = level || 'soft';
        console.log(`[FocusTracker] Triggering ${warningLevel} warning for ${site}`);

        // Send to all active tabs to show the appropriate popup
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (!tab.id) continue;
          chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_DISTRACTION_WARNING',
            warningLevel,
            site,
            title,
            reason,
          }).catch(() => {});
        }

        // Log the warning
        await logFocusEvent('distraction_warning_triggered', site);
        console.log(`[FocusTracker] Distraction warning logged: ${site} (${warningLevel}, reason: ${reason})`);

        sendResponse({ ok: true, queued: true });
        break;
      }

      case "DISTRACTION_WARNING_ACTION": {
        const { action, site } = msg;
        console.log(`[FocusTracker] Distraction warning action: ${action} on ${site}`);
        
        switch (action) {
          case 'stay_focused':
            await logFocusEvent('distraction_warning_stay_focused', site);
            break;
          case 'dismissed':
            await logFocusEvent('distraction_warning_dismissed', site);
            break;
          case 'reset_focus':
            await logFocusEvent('distraction_warning_reset_focus', site);
            break;
          case 'end_session':
            await logFocusEvent('distraction_warning_end_session', site);
            await setSetting('focusEnabled', false);
            await setSetting('sessionStart', null);
            await endCurrentSession();
            // Broadcast end to all tabs
            const tabs = await chrome.tabs.query({});
            tabs.forEach(t => t.id && chrome.tabs.sendMessage(t.id, { type: 'FOCUS_ENDED', reason: 'distraction_override' }).catch(() => {}));
            break;
        }
        
        sendResponse({ ok: true });
        break;
      }
      // ━━━ END NEW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    }
  })();
  return true;
});

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log("[FocusTracker] Extension installed / updated");
  // Only set defaults if they haven't been set yet (e.g. first install).
  // Never overwrite existing settings — the dashboard owns them.
  chrome.storage.local.get(["focusEnabled"], (result) => {
    if (result.focusEnabled === undefined) {
      chrome.storage.local.set({
        focusEnabled:    false,
        blockedSites:    [],
        sensitivity:     "medium",
        sessionDuration: 25,
        idleTimeout:     300,
        allowContinue:   true,
        sessionStart:    null,
      });
      console.log("[FocusTracker] Default settings applied (first install)");
    }
  });
});

console.log("[FocusTracker] Service worker started");

// ─── [ADDED] Real-time tab navigation intervention ────────────────────────────
//
// Backup guarantee: even if content.js fires too early (before DOM is ready),
// background.js independently pushes SHOW_INTERVENTION via chrome.tabs.sendMessage
// the moment the tab reaches "complete" state on a distracting URL.
//
// Rate-limit: once per tab per URL change (stored in service worker memory).
// Does NOT spam — sessionStorage on the content side also gates repeat fires.
// ─────────────────────────────────────────────────────────────────────────────

const DISTRACTING_HOSTS = new Set([
  "youtube.com", "youtu.be", "twitter.com", "x.com",
  "instagram.com", "facebook.com", "reddit.com", "tiktok.com",
  "snapchat.com", "pinterest.com", "twitch.tv", "netflix.com",
  "primevideo.com", "9gag.com", "tumblr.com", "discord.com",
  "whatsapp.com", "telegram.org", "amazon.com", "flipkart.com",
  "quora.com", "buzzfeed.com", "hotstar.com", "disneyplus.com",
  "hbomax.com", "hulu.com", "peacocktv.com", "espn.com",
  "linkedin.com",
]);

// tabId → last URL we pushed an intervention for (prevents repeat on same page)
const _tabLastIntervened = new Map();

function _getDistractionHost(urlStr) {
  try {
    const host = new URL(urlStr).hostname.replace(/^www\./, "");
    for (const d of DISTRACTING_HOSTS) {
      if (host === d || host.endsWith("." + d)) return d;
    }
  } catch (_) {}
  return null;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Fire once the tab has fully loaded its URL
  if (changeInfo.status !== "complete" || !tab.url) return;

  const host = _getDistractionHost(tab.url);
  if (!host) {
    // Navigated away — reset so next visit fires fresh
    _tabLastIntervened.delete(tabId);
    return;
  }

  // Already intervened for this exact URL in this tab — skip
  if (_tabLastIntervened.get(tabId) === tab.url) return;
  _tabLastIntervened.set(tabId, tab.url);

  // Push SHOW_INTERVENTION to content.js — it plays sound + shows popup.
  // Content.js sessionStorage cooldown prevents double-fire if it already self-triggered.
  chrome.tabs.sendMessage(tabId, { type: "SHOW_INTERVENTION", site: host }).catch(() => {
    // Tab may not have content script (chrome:// pages etc.) — ignore silently
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  _tabLastIntervened.delete(tabId);
});
