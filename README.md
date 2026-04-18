# Productivity Telemetry — Desktop App

Full-stack productivity tracker: React dashboard + Chrome extension + Electron OS layer.

---

## 📁 Project Structure

```
productivity-telemetry-desktop/
├── dashboard/          ← Next.js React dashboard (UNCHANGED)
├── extension/          ← Chrome extension (UNCHANGED)
└── electron/           ← NEW: Electron OS wrapper
    ├── main.js
    ├── preload.js
    ├── tracker.js
    ├── package.json
    └── build/
        └── entitlements.mac.plist
```

---

## 🚀 Quick Start

### Option A — One command (starts everything)
```bash
cd electron
npm install
npm run electron:dev
```

### Option B — Manual (two terminals)

**Terminal 1 — Start the dashboard:**
```bash
cd dashboard
npm install
npm run dev
# → runs at http://localhost:3000
```

**Terminal 2 — Start Electron:**
```bash
cd electron
npm install
npm run electron
```

---

## 🔄 How It Works

```
active-win (OS)
     ↓  polls every 3 seconds
tracker.js → detects app switch → builds segment
     ↓
main.js → classify + notify if distracting
     ↓
preload.js → window.postMessage({ source: 'focus_tracker_bridge' })
     ↓
store.js _startBridgeListener() (already existed — no changes)
     ↓
db.js addLog() / addSession() → IndexedDB → your UI renders it
```

---

## 🖥️ OS Permissions

**macOS:** Grant Screen Recording permission when prompted
(System Preferences → Privacy & Security → Screen Recording → your app)

**Windows / Linux:** No extra permissions needed.

---

## 🔔 Distraction Notifications

When a distracting app is detected, a system notification fires:
> "You are getting distracted"

Rate-limited to once per 5 minutes to avoid spam.

---

## 📦 Build for Distribution

```bash
cd electron
npm run electron:build
# Output in electron/dist/
```
