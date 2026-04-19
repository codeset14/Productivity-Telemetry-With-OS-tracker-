# Focus Intelligence Engine — System Design

## Overview

Add a real-time behavioral analysis layer that computes a **dynamic focus state** (`deep_focus` | `drifting` | `distracted`) from raw activity signals — without breaking any existing functionality.

> [!IMPORTANT]
> This engine sits **between** data ingestion and analytics. It enriches every log/session with a computed `focusState` before `engine.js` processes them.

---

## 1. Updated Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Chrome Extension / Electron Tracker                             │
│  (existing — unchanged)                                          │
│  Emits: { site, duration, category, interactions, tabSwitches }  │
└────────────────────┬─────────────────────────────────────────────┘
                     │ window.postMessage / IPC
┌────────────────────▼─────────────────────────────────────────────┐
│  store.js _startBridgeListener()                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  [NEW] behaviorEngine.js                                    │ │
│  │  ─ Maintains sliding window of recent signals               │ │
│  │  ─ Computes focusState + confidence + reasons               │ │
│  │  ─ Writes focus_states to IndexedDB                         │ │
│  │  ─ Returns enriched data to store                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  db.js addLog() / addSession()                                   │
│  engine.js processLogs() ← now includes focusState metrics       │
│  insights.js ← new behavioral insight rules                      │
│  Zustand state → React re-render                                 │
│                                                                  │
│  [NEW] Components:                                               │
│  ─ FocusStateIndicator.jsx (live pill: 🟢 / 🟡 / 🔴)            │
│  ─ FocusTimeline.jsx (state changes over time)                   │
│  ─ FocusConsistencyCard.jsx (consistency score)                  │
└──────────────────────────────────────────────────────────────────┘
```

**Key principle:** The engine is a pure function layer. Existing `background.js`, `tracker.js`, `bridge.js`, and `content.js` remain untouched.

---

## 2. Behavioral Signals (already available in code)

| Signal | Source | Current Location | How It's Collected |
|---|---|---|---|
| Tab switches per session | Extension | `background.js` L324, L209 | `currentSession.tabSwitches++` on `tabs.onActivated` |
| Interactions (clicks, keys, scroll) | Extension | `content.js` L71-87 | Throttled `INTERACTION` messages → `currentSession.interactions` |
| Session duration | Both | `background.js` L199, `tracker.js` L215 | `endTime - startTime` |
| Site category | Both | `categories.js`, `tracker.js` L82-107 | Domain/app classification |
| Idle state changes | Extension | `background.js` L371-383 | `chrome.idle.onStateChanged` |
| App switch frequency | Electron | `tracker.js` L178-186 | `active-win` poll detects app change |
| Repeat visits to distracting sites | Extension | `background.js` L221-234 | All sessions logged to `activity_log` |

> [!NOTE]
> No new data collection is needed. The engine derives focus state from signals the system already captures.

---

## 3. Focus State Model

### Three States

| State | Label | Color | Meaning |
|---|---|---|---|
| `deep_focus` | Focused | 🟢 `#22c55e` | Sustained productive work, low switching |
| `drifting` | Drifting | 🟡 `#f59e0b` | Mixed signals — starting to lose focus |
| `distracted` | Distracted | 🔴 `#ef4444` | High switching, distracting content, low engagement |

### Confidence Levels

Each state has a confidence: `high` (≥0.8), `medium` (0.5–0.79), `low` (<0.5).

---

## 4. Detection Algorithm — Pseudocode

```javascript
// behaviorEngine.js — Focus Intelligence Engine

const WINDOW_SIZE = 5; // Analyze last 5 events (sliding window)

/**
 * computeFocusState(recentEvents)
 *
 * Input: array of recent activity events (last 5 sessions/segments)
 * Each event: { site, duration, category, interactions, tabSwitches, timestamp, source }
 *
 * Output: { state, confidence, reasons[] }
 */
function computeFocusState(recentEvents) {
  if (recentEvents.length === 0) {
    return { state: 'deep_focus', confidence: 0, reasons: ['No activity data'] };
  }

  // ── Signal Extraction ──────────────────────────────────────
  const windowSec = (Date.now() - new Date(recentEvents[0].timestamp).getTime()) / 1000;
  const totalSwitches     = sum(recentEvents, 'tabSwitches');
  const totalInteractions = sum(recentEvents, 'interactions');
  const avgDuration       = avg(recentEvents, 'duration');
  const uniqueSites       = new Set(recentEvents.map(e => e.site)).size;
  const distractingCount  = recentEvents.filter(e => e.category === 'distracting').length;
  const distractingRatio  = distractingCount / recentEvents.length;

  // ── Scoring (0–100, higher = more focused) ─────────────────
  let score = 50; // baseline
  const reasons = [];

  // Signal 1: Tab switching frequency
  const switchRate = windowSec > 0 ? (totalSwitches / (windowSec / 60)) : 0;
  if (switchRate > 8) {
    score -= 25;
    reasons.push(`High tab switching (${switchRate.toFixed(1)}/min)`);
  } else if (switchRate > 4) {
    score -= 12;
    reasons.push(`Moderate tab switching (${switchRate.toFixed(1)}/min)`);
  } else if (switchRate <= 2) {
    score += 15;
    reasons.push('Low tab switching — sustained attention');
  }

  // Signal 2: Session duration (longer = more focused)
  if (avgDuration >= 600) {       // 10+ min average
    score += 20;
    reasons.push(`Long sessions (avg ${Math.round(avgDuration / 60)}m)`);
  } else if (avgDuration >= 180) { // 3–10 min
    score += 5;
  } else {                         // < 3 min — rapid switching
    score -= 20;
    reasons.push(`Very short sessions (avg ${Math.round(avgDuration)}s)`);
  }

  // Signal 3: Interaction density
  const interactionRate = avgDuration > 0
    ? (totalInteractions / recentEvents.length) / (avgDuration / 60)
    : 0;
  if (interactionRate >= 5) {
    score += 10;
    reasons.push('High interaction density — active engagement');
  } else if (interactionRate < 1 && avgDuration > 120) {
    score -= 10;
    reasons.push('Low interaction — passive browsing');
  }

  // Signal 4: Category distribution
  if (distractingRatio >= 0.8) {
    score -= 30;
    reasons.push(`${Math.round(distractingRatio * 100)}% of recent activity is distracting`);
  } else if (distractingRatio >= 0.4) {
    score -= 15;
    reasons.push('Mix of productive and distracting activity');
  } else if (distractingRatio === 0) {
    score += 15;
    reasons.push('All recent activity is productive or neutral');
  }

  // Signal 5: Site scatter (many unique sites = unfocused)
  if (uniqueSites >= 4 && recentEvents.length <= 5) {
    score -= 10;
    reasons.push(`Scattered across ${uniqueSites} different sites`);
  } else if (uniqueSites <= 2) {
    score += 10;
    reasons.push('Concentrated on 1–2 sites');
  }

  // ── Clamp & Classify ───────────────────────────────────────
  score = Math.max(0, Math.min(100, score));
  const confidence = Math.min(1, recentEvents.length / WINDOW_SIZE);

  let state;
  if (score >= 65)      state = 'deep_focus';
  else if (score >= 35) state = 'drifting';
  else                  state = 'distracted';

  return {
    state,
    score,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    timestamp: new Date().toISOString(),
  };
}
```

### Threshold Summary

| Score Range | State | Typical Behavior |
|---|---|---|
| 65–100 | `deep_focus` | Long sessions, low switching, productive sites |
| 35–64 | `drifting` | Mixed signals, moderate switching, some distracting |
| 0–34 | `distracted` | Rapid switching, short sessions, distracting sites |

---

## 5. Data Structure Changes

### New IndexedDB Store: `focus_states`

Add to `db.js` `openDB()` in a v3 upgrade:

```javascript
// v3: focus_states
if (prev < 3) {
  if (!db.objectStoreNames.contains('focus_states')) {
    const fs = db.createObjectStore('focus_states', { keyPath: 'id', autoIncrement: true });
    fs.createIndex('timestamp', 'timestamp');
    fs.createIndex('state', 'state');
  }
}
```

**`focus_states` entry shape:**
```json
{
  "id": 42,
  "state": "drifting",
  "score": 48,
  "confidence": 0.8,
  "reasons": ["Moderate tab switching (5.2/min)", "Mix of productive and distracting activity"],
  "timestamp": "2026-04-19T10:32:00.000Z",
  "windowEvents": 5
}
```

### Enriched `activity_log` entries (additive field)

Existing entries get an optional `focusState` field:
```json
{
  "site": "github.com",
  "duration": 420,
  "timestamp": "...",
  "category": "productive",
  "source": "extension",
  "focusState": "deep_focus"
}
```

> [!NOTE]
> This is purely additive. Existing entries without `focusState` still work — `engine.js` treats missing `focusState` as `null`.

---

## 6. New Files

### `dashboard/app/lib/behaviorEngine.js` [NEW]

Core module. Exports:
- `computeFocusState(recentEvents)` — pure function, returns `{ state, score, confidence, reasons }`
- `focusConsistencyScore(focusStates)` — percentage of time in `deep_focus` over a period
- `detectPatterns(focusStates)` — returns behavioral insights like "You lose focus after ~8 minutes"

### `dashboard/app/components/FocusStateIndicator.jsx` [NEW]

Live pill in the header:
```
🟢 Focused (87%)  |  🟡 Drifting (52%)  |  🔴 Distracted (28%)
```

### `dashboard/app/components/FocusTimeline.jsx` [NEW]

Horizontal timeline showing state transitions throughout the day. Each block is colored by state with tooltip showing reasons.

### `dashboard/app/components/FocusConsistencyCard.jsx` [NEW]

Card showing:
- Consistency score (% of tracked time in `deep_focus`)
- Longest focus streak
- Average time before drifting
- Comparison to previous period

---

## 7. Integration Points (zero breaking changes)

### `store.js` — Add behavior engine to bridge listener

```javascript
// In _startBridgeListener(), after addLog/addSession:
import { computeFocusState } from './behaviorEngine';
import { addFocusState, getRecentLogs } from './db';

// After receiving new data:
const recent = await getRecentLogs(5); // last 5 events
const focusResult = computeFocusState(recent);
await addFocusState(focusResult);
set({ currentFocusState: focusResult });
```

### `store.js` — New state fields

```javascript
// Add to Zustand store:
currentFocusState: null,  // { state, score, confidence, reasons, timestamp }
focusTimeline: [],        // array of focus_states for the current range
consistencyScore: 0,      // percentage
```

### `engine.js` — Extend `processLogs()` output

Add to the returned object:
```javascript
return {
  ...existing,
  // NEW: focus state distribution
  focusStateBreakdown: {
    deep_focus: countByState(logs, 'deep_focus'),
    drifting: countByState(logs, 'drifting'),
    distracted: countByState(logs, 'distracted'),
  },
};
```

### `page.jsx` — Add indicator to dashboard tab

```jsx
// In the dashboard tab, before FocusScoreCard:
<FocusStateIndicator state={currentFocusState} />

// After the existing grid-2 sections:
<div className="grid-2">
  <FocusConsistencyCard data={data} timeline={focusTimeline} />
  <FocusTimeline timeline={focusTimeline} />
</div>
```

### `insights.js` — Add behavioral findings

```javascript
// New finding type:
if (avgTimeBeforeDrift < 480) { // < 8 minutes
  findings.push({
    type: 'warning',
    text: `You typically lose focus after ${Math.round(avgTimeBeforeDrift / 60)} minutes.`,
    detail: 'Try shorter, more intense focus blocks (e.g. 5-minute sprints).',
  });
}
```

---

## 8. Focus Consistency Score Formula

```
consistencyScore = (timeInDeepFocus / totalTrackedTime) × 100
```

Additional metrics:
- **Longest streak:** max consecutive `deep_focus` time before a `drifting` or `distracted` transition
- **Avg focus block:** mean duration of consecutive `deep_focus` segments
- **Drift frequency:** transitions into `drifting` per hour

---

## 9. Explainability

Every focus state change comes with a `reasons[]` array in plain English:

```
State: 🟡 Drifting (score: 48)
Reasons:
  • Moderate tab switching (5.2/min)
  • Mix of productive and distracting activity
  • Scattered across 4 different sites
```

Displayed in a tooltip on the `FocusStateIndicator` pill and as detail rows in `FocusTimeline`.

---

## 10. Future ML Upgrade Path

### Phase 1 (Current): Rule-Based Heuristics ✅
- Threshold-based scoring as described above
- Zero dependencies, deterministic, explainable
- Ships as MVP

### Phase 2: Personalized Thresholds
- After 7+ days of data, compute **per-user baselines** for each signal
- Replace hardcoded thresholds with percentile-based ones
- Example: "Your normal switch rate is 3/min, current is 8/min → flag"
- Still rule-based, but calibrated to the individual

### Phase 3: Lightweight ML (TensorFlow.js)
- Train a small classifier (logistic regression or shallow neural net) on user's own data
- Input features: switchRate, avgDuration, interactionRate, distractingRatio, uniqueSites, hourOfDay
- Labels: derived from user's manual session labels + rule-engine outputs
- Runs in-browser via TensorFlow.js — no server, no GPU required
- Model stored in IndexedDB alongside user data
- Explainability via feature importance weights

> [!TIP]
> The rule-based engine outputs can serve as training labels for Phase 3 — no manual labeling needed.

---

## 11. Constraints Satisfied

| Requirement | How |
|---|---|
| Fully local | All computation in browser/Electron, no network calls |
| No GPU | Pure arithmetic — runs on any device |
| Lightweight | Sliding window of 5 events, O(1) per computation |
| Explainable | `reasons[]` array in plain English for every state |
| Non-breaking | Additive fields, new DB store, new components — nothing removed |
| Real-time | Computed on every new event arrival via bridge listener |

---

## 12. Files Changed / Created Summary

| File | Action | What Changes |
|---|---|---|
| `dashboard/app/lib/behaviorEngine.js` | **NEW** | Core focus intelligence engine |
| `dashboard/app/lib/db.js` | MODIFY | Add v3 schema (`focus_states` store), add `addFocusState()`, `getRecentLogs()`, `getFocusTimeline()` |
| `dashboard/app/lib/store.js` | MODIFY | Add `currentFocusState`, `focusTimeline`, `consistencyScore` to state; call engine in bridge listener |
| `dashboard/app/lib/engine.js` | MODIFY | Add `focusStateBreakdown` to `processLogs()` output |
| `dashboard/app/lib/insights.js` | MODIFY | Add behavioral pattern findings (drift time, streak analysis) |
| `dashboard/app/components/FocusStateIndicator.jsx` | **NEW** | Live state pill component |
| `dashboard/app/components/FocusTimeline.jsx` | **NEW** | Horizontal state timeline chart |
| `dashboard/app/components/FocusConsistencyCard.jsx` | **NEW** | Consistency score + streak stats |
| `dashboard/app/page.jsx` | MODIFY | Import and render 3 new components in dashboard tab |
| `dashboard/app/globals.css` | MODIFY | Styles for new components |

**Zero changes to:** `extension/*`, `electron/*`, `bridge.js`, `content.js`, `background.js`, `tracker.js`, `preload.js`, `main.js`

---

## Verification Plan

### Automated
- `npm run build` in `dashboard/` — confirm no build errors
- Verify IndexedDB v3 upgrade runs cleanly on existing v2 data

### Manual
- Load dashboard with demo data → verify FocusStateIndicator shows a state
- Browse distracting sites with extension → verify state transitions to `drifting`/`distracted`
- Check `reasons[]` tooltip text matches actual signals
- Verify all existing features (score, charts, history, focus mode) work unchanged
