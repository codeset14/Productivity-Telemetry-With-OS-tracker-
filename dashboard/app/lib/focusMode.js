/**
 * focusMode.js — Dashboard Focus Mode Library
 *
 * All focus-mode operations go through this module.
 * Reads/writes the `settings` and `user_labels` stores in shared IndexedDB.
 */

import {
  getSetting, setSetting, getAllSettings,
  setUserLabel, getUserLabel, getAllUserLabels, removeUserLabel,
  getRecentSessions, getEventStats, addFocusEvent,
} from './db';

// ─── Extension sync ───────────────────────────────────────────────────────────
// The dashboard runs at localhost:3000 — a regular webpage — so chrome.* APIs
// are NOT available here. Instead we postMessage to bridge.js (injected content
// script that DOES have chrome access) and it writes to chrome.storage.local.
function syncToExtension(settings) {
  if (typeof window === 'undefined') return;
  const {
    focusEnabled    = false,
    blockedSites    = [],
    sensitivity     = 'medium',
    allowContinue   = true,
    sessionStart    = null,
    sessionDuration = 25,
  } = settings;
  window.postMessage({
    source:  'ft_page_to_ext',
    type:    'SYNC_FOCUS_STATE',
    payload: { focusEnabled, blockedSites, sensitivity, allowContinue, sessionStart, sessionDuration },
  }, '*');
}


// ─── Default settings ─────────────────────────────────────────────────────────

export const FOCUS_DEFAULTS = {
  focusEnabled:    false,
  blockedSites:    [],
  sensitivity:     'medium',
  sessionDuration: 25,   // minutes (0 = unlimited)
  allowContinue:   true,
  sessionStart:    null, // ISO string when session begins
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function loadFocusSettings() {
  const stored = await getAllSettings();
  return { ...FOCUS_DEFAULTS, ...stored };
}

export async function saveFocusSettings(partial) {
  for (const [key, val] of Object.entries(partial)) {
    await setSetting(key, val);
  }
  // Sync the full state to chrome.storage.local for content scripts
  const full = await loadFocusSettings();
  await syncToExtension(full);
}

// ─── Session control ──────────────────────────────────────────────────────────

export async function startFocusSession(settings = {}) {
  const start = new Date().toISOString();
  await saveFocusSettings({
    ...settings,
    focusEnabled: true,
    sessionStart: start,
  });
  await addFocusEvent({ type: 'session_started', site: '' });
  return start;
}

export async function endFocusSession() {
  await saveFocusSettings({
    focusEnabled: false,
    sessionStart: null,
  });
  await addFocusEvent({ type: 'session_ended_user', site: '' });
}

// ─── Blocked sites ────────────────────────────────────────────────────────────

/**
 * Normalise an input like 'https://www.youtube.com/shorts' → 'youtube.com/shorts'
 * Plain domains like 'reddit.com' are stored as-is.
 */
function normaliseBlockEntry(input) {
  const s = input.trim().toLowerCase();
  // Strip protocol and www.
  return s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

export async function addBlockedSite(domain) {
  const current = await getSetting('blockedSites', []);
  const clean   = normaliseBlockEntry(domain);
  if (!clean || current.includes(clean)) return current;
  const updated = [...current, clean];
  await setSetting('blockedSites', updated);
  // Immediately sync so already-open tabs get updated
  const full = await loadFocusSettings();
  syncToExtension(full);
  return updated;
}

export async function removeBlockedSite(domain) {
  const current = await getSetting('blockedSites', []);
  const updated = current.filter(d => d !== domain);
  await setSetting('blockedSites', updated);
  // Immediately sync so already-open tabs get updated
  const full = await loadFocusSettings();
  syncToExtension(full);
  return updated;
}

// ─── User labels ──────────────────────────────────────────────────────────────

export { setUserLabel, getUserLabel, getAllUserLabels, removeUserLabel };

// ─── History + stats ──────────────────────────────────────────────────────────

export { getRecentSessions, getEventStats };

// ─── Elapsed time helper ──────────────────────────────────────────────────────

export function getElapsedSeconds(sessionStart) {
  if (!sessionStart) return 0;
  return Math.round((Date.now() - new Date(sessionStart).getTime()) / 1000);
}

export function getElapsedPercent(sessionStart, durationMinutes) {
  if (!sessionStart || !durationMinutes) return 0;
  const elapsed = getElapsedSeconds(sessionStart) / 60;
  return Math.min(100, Math.round(elapsed / durationMinutes * 100));
}
