/**
 * bridge.js — Bidirectional Extension ↔ Dashboard Bridge
 *
 * Injected ONLY into localhost:3000 (the dashboard).
 * Has access to chrome.* APIs since it runs as a content script.
 *
 * Direction 1 — Extension → Dashboard (sessions/logs):
 *   Drains pendingSessions/pendingLogs from chrome.storage.local
 *   and posts them to the page via window.postMessage.
 *
 * Direction 2 — Dashboard → Extension (focus settings):
 *   Listens for window.postMessage from the page and writes
 *   focusEnabled, blockedSites, etc. into chrome.storage.local
 *   so content scripts on other tabs can immediately read them.
 */

const SOURCE_FROM_PAGE = 'ft_page_to_ext';
const SOURCE_TO_PAGE   = 'focus_tracker_bridge';

// ── Direction 1: Extension → Dashboard ────────────────────────────────────────

function flushToPage() {
  if (!chrome?.runtime?.id) return; // Extension context invalidated
  chrome.storage.local.get(['pendingSessions', 'pendingLogs'], (result) => {
    const sessions = result.pendingSessions || [];
    const logs     = result.pendingLogs     || [];

    if (sessions.length > 0) {
      window.postMessage({ source: SOURCE_TO_PAGE, type: 'SESSIONS', payload: sessions }, '*');
      chrome.storage.local.remove('pendingSessions');
    }
    if (logs.length > 0) {
      window.postMessage({ source: SOURCE_TO_PAGE, type: 'LOGS', payload: logs }, '*');
      chrome.storage.local.remove('pendingLogs');
    }
  });
}

// Initial flush on page load
flushToPage();

// Real-time: flush whenever the extension writes new session data
if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.pendingSessions || changes.pendingLogs) {
      flushToPage();
    }
  });
}

// ── Direction 2: Dashboard → Extension ────────────────────────────────────────

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== SOURCE_FROM_PAGE) return;
  if (!chrome?.runtime?.id) return; // Extension context invalidated

  if (msg.type === 'SYNC_FOCUS_STATE') {
    // Write the focus state directly to chrome.storage.local
    // so content scripts on every tab can read it immediately
    const {
      focusEnabled    = false,
      blockedSites    = [],
      sensitivity     = 'medium',
      allowContinue   = true,
      sessionStart    = null,
      sessionDuration = 25,
    } = msg.payload;

    chrome.storage.local.set({
      focusEnabled, blockedSites, sensitivity,
      allowContinue, sessionStart, sessionDuration,
    }, () => {
      // Confirm write back to page
      window.postMessage({ source: SOURCE_TO_PAGE, type: 'SYNC_ACK' }, '*');
    });
  }
});
