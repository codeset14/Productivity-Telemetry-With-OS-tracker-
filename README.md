# Productivity Telemetry

> **Privacy-first productivity tracker** — tracks your browser usage and native OS app activity in real time, scores your focus, and helps you reclaim your attention. All data stays on your device.

---

## 📌 Overview

Productivity Telemetry is a three-layer system that works together seamlessly:

| Layer | What It Does |
|---|---|
| **Chrome Extension** | Tracks every browser session, classifies sites, enforces Focus Mode |
| **Next.js Dashboard** | Visualises your data — focus score, usage graphs, session history, insights |
| **Electron Wrapper** | Tracks native OS apps (VS Code, Discord, Slack, etc.) and shows desktop alerts |

No accounts. No cloud. No data leaves your machine.

---

## ✨ Features

### 📊 Analytics Dashboard
- **Focus Score** — deterministic 0–100 score: `clamp(((productive − distracting) / total + 1) / 2 × 100, 0, 100)`
- **Time range views** — Today, Last 7 Days, Last 30 Days
- **Hourly & daily breakdown charts** — built with Recharts
- **Top productive and distracting sites** — ranked by time spent
- **Session history** — view every tracked session with site, duration, and category
- **Insight Assistant** — data-driven report: peak distraction windows, top offenders, personalised recommendations
- **Demo data** — auto-seeded on first launch; auto-cleared the moment real data arrives
- **Auto-refresh** — polls IndexedDB every 30 seconds so new extension data appears live

### 🛡️ Focus Mode (Chrome Extension)
- **Site blocking** — hard-block any domain; blocked pages show a full-screen block wall
- **Warnings** — show an intervention overlay on distracting sites without hard-blocking
- **Sensitivity levels** — Low / Medium / High control how aggressively warnings fire
- **Session timer** — set a focus session duration (e.g. 25 min); extension auto-ends the session when time is up
- **Allow Continue** — optionally let the user bypass a warning (logged as a bypass event)
- **Idle detection** — auto-ends sessions when the system goes idle or locks
- **Audit log** — every warning, block, bypass, and session start/end is written to `focus_events`

### 🖥️ OS-Level Tracking (Electron)
- **Native app tracking** — polls the active OS window every 3 seconds via `active-win`
- **App classification** — VS Code, terminals, design tools → productive; Discord, games, streaming → distracting
- **Desktop notifications** — OS-native alert when you switch to a distracting native app (5-minute cooldown per app)
- **In-app overlay** — animated intervention card injected directly into the dashboard renderer
- **Alert sound** — synthesized tri-tone played via Web Audio API on distraction entry
- **JSON persistence** — last 500 OS segments stored locally via `electron-store`

### 🔔 Real-Time Interventions
- Browser: content script shows popup overlay + sound on distracting sites
- Native apps: Electron triggers OS notification + in-app card + sound
- Both are rate-limited to prevent alert fatigue

### 🧠 Intelligent Distraction Detection (NEW)
- **Behavioral analysis** — 4-state machine (FOCUSED → DRIFTING → DISTRACTED → DEEPLY_DISTRACTED)
- **Progressive warnings** — soft toast → strong modal → persistent overlay
- **Adaptive thresholds** — learns from 7-day patterns; 75th percentile-based adjustment
- **Full explainability** — every warning explains *why* (specific metrics triggered it)
- **Recovery tracking** — streak system + recovery time analytics
- **Zero false positives** — 30-60 second buffers before state transitions
- **Context-aware** — patterns card shows peak distraction hours, triggers, typical focus blocks
- See [DISTRACTION_SYSTEM.md](./DISTRACTION_SYSTEM.md) for complete documentation

---

## 🛠 Tech Stack

| Category | Technology |
|---|---|
| Dashboard Framework | Next.js 14, React 18 |
| Language | TypeScript (dashboard), JavaScript (extension & electron) |
| Styling | Tailwind CSS v3 |
| State Management | Zustand v5 |
| Charts | Recharts v3 |
| Desktop Shell | Electron v29, electron-builder |
| OS Window Detection | `active-win` v8 |
| Local Persistence (Electron) | `electron-store` v8 |
| Browser Database | IndexedDB (browser-native, schema v2) |
| Browser Extension | Chrome Extension Manifest V3 |
| IPC | Electron `contextBridge` + `window.postMessage` |

---

## 🏗 Architecture

The system has three independent but connected layers that communicate via `window.postMessage` and Electron IPC — no shared server needed.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Chrome Extension                           │
│  background.js (service worker)                                 │
│    → tracks tab sessions, classifies sites, enforces focus mode │
│    → queues data in chrome.storage.local                        │
│  content.js (injected into every page)                          │
│    → shows warning/block overlays, plays alert sound            │
│  bridge.js (injected into localhost:3000 only)                  │
│    → drains queue → window.postMessage → dashboard store        │
│    → relays focus settings from dashboard → chrome.storage.local│
└──────────────────────┬──────────────────────────────────────────┘
                       │ window.postMessage
┌──────────────────────▼──────────────────────────────────────────┐
│                   Next.js Dashboard (localhost:3000)             │
│  store.js (Zustand)                                             │
│    → _startBridgeListener() receives extension data             │
│    → writes to IndexedDB via db.js                              │
│    → calls engine.js to compute analytics                       │
│    → calls insights.js to generate report                       │
│  React Components → render charts, score, history, focus panel  │
└──────────────────────▲──────────────────────────────────────────┘
                       │ window.postMessage (same bridge format)
┌──────────────────────┴──────────────────────────────────────────┐
│                      Electron Layer                             │
│  tracker.js                                                     │
│    → active-win polls OS every 3s → classify() → segment       │
│  main.js                                                        │
│    → receives segment → saves to electron-store JSON            │
│    → IPC 'os-activity' → preload.js                             │
│    → fires OS notification on distraction entry                 │
│  preload.js                                                     │
│    → forwards IPC → window.postMessage (store picks it up)      │
│    → injects intervention overlay + plays alert sound           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Folder Structure

```
productivity-telemetry/
│
├── dashboard/                     # Next.js 14 analytics dashboard
│   ├── app/
│   │   ├── page.jsx               # Main dashboard page (single route)
│   │   ├── layout.jsx             # Root layout
│   │   ├── globals.css            # Global styles
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── FocusModePanel.jsx # Focus mode controls
│   │   │   ├── FocusModeModal.jsx
│   │   │   ├── FocusScoreCard.jsx # Focus score display
│   │   │   ├── UsageGraph.jsx     # Hourly/daily chart
│   │   │   ├── CategoryBreakdown.jsx
│   │   │   ├── TopSites.jsx
│   │   │   ├── SessionHistory.jsx
│   │   │   ├── InsightAssistant.jsx
│   │   │   └── SettingsPanel.jsx
│   │   └── lib/
│   │       ├── db.js              # IndexedDB wrapper (all 5 stores)
│   │       ├── store.js           # Zustand global state + bridge listener
│   │       ├── engine.js          # Analytics computation + focus score
│   │       ├── focusMode.js       # Focus session & blocked-site management
│   │       ├── insights.js        # Insight report generator
│   │       ├── mockData.js        # Demo data seeder
│   │       └── siteSections.js    # Site metadata helpers
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   └── package.json
│
├── electron/                      # Electron desktop wrapper
│   ├── main.js                    # Main process: window, IPC, notifications
│   ├── preload.js                 # Secure context bridge + intervention UI
│   ├── tracker.js                 # OS activity tracker (active-win)
│   └── package.json
│
├── extension/                     # Chrome Extension (MV3)
│   ├── manifest.json
│   ├── background.js              # Service worker: session tracking, focus mode
│   ├── content.js                 # Injected into every page: overlays, sounds
│   ├── bridge.js                  # Injected into dashboard: data relay
│   ├── categories.js              # Domain classification map
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js               # Toolbar popup UI
│   └── icons/
│
├── extension.crx                  # Packaged extension (for sideloading)
└── extension.pem                  # Extension signing key
```

---

## 🗄 Database Design

**Database name:** `focus_tracker_db` (IndexedDB, version 2)  
Shared between the Chrome extension (background.js) and the dashboard (db.js).

| Store | Key | Indexes | Purpose |
|---|---|---|---|
| `activity_log` | `id` (auto) | `timestamp`, `site`, `category` | Per-session time log used for all analytics |
| `sessions` | `id` (auto) | `startTime`, `site`, `category` | Full session records with interaction signals |
| `focus_events` | `id` (auto) | `type`, `timestamp` | Audit trail of all focus mode events |
| `settings` | `key` | — | Key-value store for focus mode configuration |
| `user_labels` | `site` | — | User-defined category overrides per domain |

### `activity_log` Entry
```json
{
  "site": "github.com",
  "duration": 420,
  "timestamp": "2026-04-19T08:30:00.000Z",
  "category": "productive",
  "confidence": "low",
  "reason": "default_list",
  "source": "extension"
}
```

### `sessions` Entry
```json
{
  "site": "youtube.com",
  "startTime": "2026-04-19T10:00:00.000Z",
  "endTime": "2026-04-19T10:08:00.000Z",
  "duration": 480,
  "interactions": 12,
  "tabSwitches": 3,
  "category": "distracting",
  "confidence": "low",
  "reason": "default_list",
  "userLabel": null
}
```

### `settings` Keys
| Key | Type | Default | Description |
|---|---|---|---|
| `focusEnabled` | boolean | `false` | Whether Focus Mode is active |
| `blockedSites` | string[] | `[]` | Domains to hard-block |
| `sensitivity` | string | `"medium"` | Warning sensitivity level |
| `sessionDuration` | number | `25` | Focus session length in minutes (0 = unlimited) |
| `allowContinue` | boolean | `true` | Allow user to bypass warnings |
| `sessionStart` | string | `null` | ISO timestamp when session began |
| `idleTimeout` | number | `300` | Seconds before idle detection fires |
| `demoDataSeeded` | boolean | `false` | Tracks whether demo data has been inserted |

---

## 🔄 Data Flow

### Browser Extension → Dashboard
```
User browses → background.js tracks tab sessions
  → classifySession() [user override → behavior heuristics → domain map]
  → dbAdd('sessions', session) + dbAdd('activity_log', logEntry)
  → queueForDashboard() → chrome.storage.local { pendingSessions, pendingLogs }
  → bridge.js flushToPage() → window.postMessage({ source: 'focus_tracker_bridge', ... })
  → store.js _startBridgeListener() → db.js addLog() / addSession()
  → loadData() → engine.js processLogs() → Zustand state → React re-render
```

### Electron OS Tracker → Dashboard
```
tracker.js polls active-win every 3s
  → classify(appName, windowTitle) → 'productive' | 'distracting' | 'neutral'
  → app switches → _flushCurrent() emits segment → main.js handleActivity()
  → electron-store.set('segments', [...]) [persisted JSON, max 500]
  → IPC 'os-activity' → preload.js
  → window.postMessage (same bridge format) → store.js picks it up
  → db.js addLog() / addSession() → React UI updates
```

### Dashboard → Extension (Focus Settings Sync)
```
User changes focus settings in dashboard
  → focusMode.js saveFocusSettings()
  → window.postMessage({ source: 'ft_page_to_ext', type: 'SYNC_FOCUS_STATE', payload })
  → bridge.js → chrome.storage.local.set({ focusEnabled, blockedSites, ... })
  → content scripts on all open tabs read updated state immediately
```

---

## 🔐 Authentication

There is **no authentication** in this project. This is by design.

- All data is stored locally on the user's device (IndexedDB + electron-store JSON)
- No external API calls, no cloud services, no user accounts
- The extension uses `chrome.storage.local` (device-scoped, not synced)
- The Electron layer persists to a local JSON file via `electron-store`

---

## 🔒 Security Notes

- **`contextIsolation: true`** — Electron renderer has no access to Node.js APIs
- **`nodeIntegration: false`** — prevents XSS from escalating to system access
- **Minimal contextBridge API** — only `onActivity`, `getOsHistory`, `clearOsHistory`, `onDistractionPopup`, and `isElectron` are exposed to the renderer
- **Extension MV3** — service worker model; no persistent background pages
- **`bridge.js` is scoped** — only injected into `localhost:3000`, `localhost:12278`, and `localhost:*`, not external sites
- **No `<all_urls>` write access** — content scripts read-only interaction with pages; no data exfiltration

---

## 🚀 Setup & Run Locally

### Prerequisites
- Node.js 18+
- Google Chrome (for the extension)
- Git

---

### 1. Dashboard (Next.js)

```bash
cd dashboard
npm install
npm run dev
# Dashboard runs at http://localhost:3000
```

---

### 2. Chrome Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project

The **Focus Tracker** extension will appear in your toolbar.

> **Alternative:** Drag and drop `extension.crx` onto the `chrome://extensions` page to install the pre-built package.

---

### 3. Electron Desktop App (OS Tracker)

```bash
cd electron
npm install

# Start dashboard first, then run Electron
npm run electron:dev
```

This uses `concurrently` to start the Next.js dashboard and then launch the Electron window after `localhost:3000` is ready.

To run Electron against an already-running dashboard:
```bash
npm run electron
```

---

### 4. Build for Production (Electron)

```bash
cd electron
npm run electron:build
# Output in electron/dist/
```

Builds for the current platform. Supports:
- **Windows** — NSIS installer (`.exe`)
- **macOS** — `.dmg` (requires entitlements for `active-win`)
- **Linux** — AppImage

---

## ⚙️ Environment Variables

This project requires **no environment variables**. All configuration is managed through the dashboard UI and persisted in IndexedDB / `electron-store`.

---

## 📦 Deployment

The dashboard is designed to run **locally** (served by Next.js dev server on port 3000). The Electron app and Chrome extension connect to it at `http://localhost:3000`.

If you want to deploy the dashboard to a remote host:
1. Update `DASHBOARD_URL` in `electron/main.js` to your hosted URL
2. Update the `content_scripts` matches in `extension/manifest.json` to include your hosted URL
3. Update `bridge.js` to recognise your hosted origin
4. Run `npm run build` in the `dashboard/` directory and deploy the output

> **Note:** Hosting the dashboard externally breaks the privacy-first model — extension data would flow to a remote origin. Not recommended unless self-hosted.

---

## 🗺 Future Improvements

- [ ] **Export data** — CSV / JSON export of activity logs and sessions
- [ ] **Firefox support** — port the extension from Chrome MV3 to Firefox WebExtensions
- [ ] **Pomodoro mode** — built-in timer with automatic focus/break cycles
- [ ] **Goal setting** — daily productive-time targets with progress tracking
- [ ] **Multi-device sync** — optional encrypted sync via a self-hosted backend
- [ ] **Custom category rules** — user-defined regex/domain rules beyond the default lists
- [ ] **Weekly email digest** — scheduled summary report (Electron notification or export)
- [ ] **Tray icon** — Electron system tray with live focus score and quick toggle
- [ ] **Dark/light mode toggle** — currently defaults to dark mode

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
