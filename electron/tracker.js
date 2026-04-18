/**
 * tracker.js — OS-Level Activity Tracker
 *
 * Uses `active-win` to poll the currently focused window every N ms.
 * Accumulates time per app and emits completed segments back to main.js.
 *
 * Data flow:
 *   active-win (OS)  →  tracker.js (accumulate)  →  main.js (handleActivity)
 *                                                        ↓
 *                                               preload.js (IPC → postMessage)
 *                                                        ↓
 *                                           store.js _startBridgeListener()
 *                                                        ↓
 *                                         db.js addLog() / addSession()
 *
 * Segment emitted when:
 *   - The active app changes (switch away from an app)
 *   - The tracker is stopped (flush whatever is in progress)
 *
 * Segment shape (matches your existing log/session format):
 *   {
 *     appName:     string,   // "VS Code", "Google Chrome", etc.
 *     windowTitle: string,   // "main.js — my-project"
 *     startTime:   string,   // ISO 8601
 *     endTime:     string,   // ISO 8601
 *     duration:    number,   // seconds
 *     category:    string,   // "productive" | "distracting" | "neutral"
 *   }
 */

// ─── App → category classification ───────────────────────────────────────────

const PRODUCTIVE_APPS = [
  'code', 'visual studio code', 'vscodium', 'webstorm', 'intellij', 'pycharm',
  'goland', 'rider', 'clion', 'android studio', 'xcode', 'vim', 'neovim',
  'nvim', 'emacs', 'sublime text', 'atom', 'zed',
  'terminal', 'iterm', 'iterm2', 'warp', 'alacritty', 'kitty', 'hyper',
  'windows terminal', 'powershell', 'cmd',
  'figma', 'sketch', 'adobe xd', 'affinity designer', 'affinity photo',
  'affinity publisher', 'photoshop', 'illustrator', 'indesign',
  'notion', 'obsidian', 'roam', 'logseq', 'bear', 'craft', 'evernote',
  'onenote', 'typora', 'mark text',
  'slack', 'microsoft teams', 'zoom', 'google meet', 'webex',
  'word', 'excel', 'powerpoint', 'google docs', 'google sheets',
  'libreoffice', 'numbers', 'pages', 'keynote',
  'google chrome', 'chrome', 'chromium', 'firefox', 'safari', 'edge',
  'opera', 'brave', 'arc',
  'linear', 'jira', 'asana', 'trello', 'clickup',
  'tableplus', 'datagrip', 'dbeaver', 'postico', 'sequel pro',
  'insomnia', 'postman', 'paw',
  'sourcetree', 'fork', 'gitkraken', 'github desktop',
  'docker desktop', 'lens', 'rancher desktop',
];

const DISTRACTING_APPS = [
  'youtube', 'netflix', 'prime video', 'disney+', 'hulu', 'twitch',
  'spotify', 'apple music', 'vlc', 'mpv', 'plex',
  'twitter', 'tweetdeck', 'instagram', 'facebook', 'tiktok', 'snapchat',
  'pinterest', 'reddit',
  'whatsapp', 'telegram', 'discord', 'signal', 'messenger',
  'imessage', 'messages',
  'steam', 'epic games', 'gog galaxy', 'battle.net', 'origin', 'ea app',
  'minecraft', 'valorant', 'fortnite', 'league of legends', 'dota 2',
  'counter-strike', 'overwatch',
  'amazon', 'ebay',
];

const PRODUCTIVE_TITLE_KEYWORDS = [
  'github', 'gitlab', 'stackoverflow', 'docs.', 'developer.',
  'figma', 'notion', 'jira', 'linear', 'vercel', 'netlify',
  'localhost', '127.0.0.1', 'openai', 'claude', 'gemini',
  'leetcode', 'hackerrank', 'codepen', 'codesandbox', 'replit',
];

const DISTRACTING_TITLE_KEYWORDS = [
  'youtube', 'netflix', 'instagram', 'twitter', 'reddit', 'tiktok',
  'facebook', 'discord', 'whatsapp', 'twitch', 'amazon', 'ebay',
  'flipkart', 'espn', 'prime video', 'linkedin',
];

// ─── Classify an OS window ────────────────────────────────────────────────────
function classify(appName, windowTitle) {
  const app   = (appName    || '').toLowerCase();
  const title = (windowTitle || '').toLowerCase();

  const isBrowser = ['chrome', 'firefox', 'safari', 'edge', 'brave', 'arc', 'opera', 'chromium']
    .some(b => app.includes(b));

  if (isBrowser) {
    for (const kw of DISTRACTING_TITLE_KEYWORDS) {
      if (title.includes(kw)) return 'distracting';
    }
    for (const kw of PRODUCTIVE_TITLE_KEYWORDS) {
      if (title.includes(kw)) return 'productive';
    }
    return 'neutral';
  }

  for (const name of DISTRACTING_APPS) {
    if (app.includes(name)) return 'distracting';
  }
  for (const name of PRODUCTIVE_APPS) {
    if (app.includes(name)) return 'productive';
  }

  return 'neutral';
}

// ─── Tracker state ────────────────────────────────────────────────────────────
let pollTimer    = null;
let activeWin    = null;

let currentApp   = null;
let currentTitle = null;
let segmentStart = null;
let onActivityCb = null;

// ─── [ADDED] Distraction entry detection state ────────────────────────────────
// Fires onDistractionEntry ONCE when user enters a distracting window.
// Resets when they leave — so next entry fires again.
let _inDistractingState   = false;
let _onDistractionEntryCb = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {object}   opts
 * @param {function} opts.onActivity          - called with each completed segment
 * @param {function} [opts.onDistractionEntry] - [ADDED] fires immediately on distraction entry.
 *                                               Receives { appName, windowTitle, category }.
 *                                               Fires ONCE per entry — not again until user leaves.
 * @param {number}   [opts.intervalMs]        - poll interval (default 3000ms)
 */
async function startTracking({ onActivity, onDistractionEntry, intervalMs = 3000 }) {
  if (pollTimer) return;
  onActivityCb          = onActivity;
  _onDistractionEntryCb = onDistractionEntry || null; // [ADDED]

  try {
    activeWin = (await import('active-win')).default;
  } catch (err) {
    console.error('[Tracker] active-win failed to load:', err.message);
    console.warn('[Tracker] Falling back to mock data for development.');
    _startMockTracking(intervalMs);
    return;
  }

  pollTimer = setInterval(_poll, intervalMs);
  console.log('[Tracker] OS tracking started (interval:', intervalMs, 'ms)');
}

function stopTracking() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
  _flushCurrent();
  console.log('[Tracker] OS tracking stopped.');
}

// ─── Internal polling ─────────────────────────────────────────────────────────
async function _poll() {
  let result;
  try {
    result = await activeWin();
  } catch {
    return;
  }

  if (!result) return;

  const app   = result.owner?.name || 'Unknown';
  const title = result.title       || '';

  // [ADDED] Run distraction entry check on every tick — before early-return.
  // This fires even when app hasn't "switched away" yet, which is the key fix.
  _checkDistractionEntry(app, title);

  // App hasn't changed — just accumulate time
  if (app === currentApp && title === currentTitle) return;

  // App changed — flush the previous segment
  _flushCurrent();

  currentApp   = app;
  currentTitle = title;
  segmentStart = new Date();
}

// ─── [ADDED] Distraction entry gate ──────────────────────────────────────────
// Called on every poll tick.
// Fires callback exactly once when user enters a distracting state.
// Resets the gate when user leaves so the next entry fires fresh.
function _checkDistractionEntry(app, title) {
  const category = classify(app, title);

  if (category === 'distracting') {
    if (!_inDistractingState) {
      _inDistractingState = true;
      if (_onDistractionEntryCb) {
        _onDistractionEntryCb({ appName: app, windowTitle: title, category });
      }
    }
    // else: already in distracting state — suppress (no spam)
  } else {
    // Left the distracting window — reset gate so next entry fires again
    _inDistractingState = false;
  }
}
// ─── [END ADDED] ──────────────────────────────────────────────────────────────

function _flushCurrent() {
  if (!currentApp || !segmentStart) return;

  const endTime  = new Date();
  const duration = Math.round((endTime - segmentStart) / 1000);

  if (duration >= 2 && onActivityCb) {
    const segment = {
      appName:     currentApp,
      windowTitle: currentTitle || '',
      startTime:   segmentStart.toISOString(),
      endTime:     endTime.toISOString(),
      duration,
      category:    classify(currentApp, currentTitle),
    };
    onActivityCb(segment);
  }

  currentApp   = null;
  currentTitle = null;
  segmentStart = null;
}

// ─── Mock tracker ─────────────────────────────────────────────────────────────
const MOCK_APPS = [
  { app: 'Visual Studio Code', title: 'main.js — my-project' },
  { app: 'Google Chrome',      title: 'github.com - GitHub'  },
  { app: 'Google Chrome',      title: 'youtube.com - YouTube' },
  { app: 'Terminal',           title: 'zsh — ~/my-project'   },
  { app: 'Slack',              title: 'Slack'                 },
  { app: 'Google Chrome',      title: 'stackoverflow.com'     },
  { app: 'Discord',            title: 'Discord'               },
  { app: 'Google Chrome',      title: 'reddit.com'            },
];

let _mockIdx = 0;
function _startMockTracking(intervalMs) {
  pollTimer = setInterval(() => {
    const mock = MOCK_APPS[_mockIdx % MOCK_APPS.length];
    _mockIdx++;

    _checkDistractionEntry(mock.app, mock.title); // [ADDED] works in mock mode too

    if (!currentApp) {
      currentApp   = mock.app;
      currentTitle = mock.title;
      segmentStart = new Date();
      return;
    }

    _flushCurrent();
    currentApp   = mock.app;
    currentTitle = mock.title;
    segmentStart = new Date();
  }, intervalMs * 5);
}

module.exports = { startTracking, stopTracking, classify };
