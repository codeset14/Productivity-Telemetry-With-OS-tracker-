# Real-Time Distraction Detection System

## Overview

This system detects when you're getting distracted during focus sessions and provides intelligent, context-aware warnings with full transparency about why warnings are triggered.

**Key Principle:** Privacy-first. All data stays local. No external APIs. Explainable. Adaptive.

## Architecture

### Data Flow

```
Raw Activity Signals (Browser + OS)
    ↓
Signal Aggregation (5-second windows)
    ↓
Behavior Engine (4-state machine)
    ↓
Warning Decision Logic (cooldown-aware)
    ↓
Progressive Warnings (Soft → Strong → Persistent)
    ↓
Recovery Tracking & Analytics
```

### Signal Types

| Signal | Source | Meaning |
|--------|--------|---------|
| `CLICK` | Browser extension | User interaction |
| `SCROLL` | Browser content script | Active browsing |
| `KEY` | Browser content script | Typing activity |
| `PAGE_LOAD` | Browser | New page visited |
| `IDLE` | Browser content script (30s timeout) | No interaction |
| `APP_SWITCH` | Electron tracker | OS app focus change |

### State Machine

```
FOCUSED (healthy)
    ↓ [metrics exceed threshold for 30s]
DRIFTING (subtle warning)
    ↓ [continues for 45s]
DISTRACTED (strong warning, immediate action)
    ↓ [continues for 5+ minutes]
DEEPLY_DISTRACTED (persistent overlay)
    ↑ [user returns to focus]
RECOVERY (streak tracked)
```

### Thresholds

Default thresholds (adjusted by adaptive engine):
- **Context Switch**: 2.0 switches/min (becomes ~1.5 for high-switchers, ~2.5 for low-switchers)
- **Idle Time**: 30% of session (adjusts based on user's typical idle patterns)
- **Focus Block Duration**: 10 minutes (adjusted to user's typical focus block length)
- **Recovery Time**: Must return within 5 minutes to reset streak

Thresholds adapt using **75th percentile** of 7-day behavior:
- If you normally switch tabs 5x/min, threshold becomes ~3.75/min (75th %ile)
- If you normally switch 1x/min, threshold becomes ~0.75/min

## Warnings

### Soft Warning (Toast)
- **When**: After 30 seconds in DRIFTING state
- **Display**: Fixed top-center toast
- **Icon**: 💡 (neutral)
- **Message**: "You're drifting away from focus"
- **Auto-dismiss**: 8 seconds
- **Cooldown**: 5 minutes (won't repeat before 5 min)
- **Action**: Clickable X to dismiss

### Strong Warning (Modal)
- **When**: After 45 seconds in DISTRACTED state
- **Display**: Centered modal with 50% blur backdrop
- **Icon**: ⚠️ (warning)
- **Message**: "You're getting distracted. Return to your task"
- **Shows**: Top 2 reasons (if enabled)
- **Cooldown**: 10 minutes
- **Actions**: 
  - "Back to Work" (resets to FOCUSED)
  - "Dismiss" (acknowledges warning)

### Persistent Overlay
- **When**: 5+ minutes continuously distracted (or deeply distracted behavior)
- **Display**: Full-screen 65% opacity overlay
- **Icon**: 🚨 (animated)
- **Message**: "Extended distraction. Consider taking a break"
- **Shows**: All reasons (scrollable)
- **Cooldown**: None (always-on until user takes action)
- **Actions**:
  - "Reset & Focus" (returns to FOCUSED)
  - "Take a Break Instead" (ends focus session)
  - "End Focus Session" (closes overlay, stops tracking)

## Dashboard Insights

### Recovery Metrics Card
Shows:
- **Recovery Rate**: % of distraction episodes where you recovered (≥80% is excellent)
- **Total Recoveries**: Number of times you successfully refocused
- **Current Streak**: Consecutive recovery successes
- **Best Streak**: Longest streak achieved
- **Avg Recovery Time**: How long it typically takes to refocus
- **Insight**: Context-aware recommendation based on your rate

### Behavior Patterns Card
Shows:
- **Peak Distraction Time**: Hour of day when you're most distracted
- **Common Times**: Other distraction-prone hours
- **Typical Focus Block**: How long you normally stay focused
- **Consistency**: Whether your focus blocks are predictable
- **Top Triggers**: Apps/sites that most often trigger distraction
- **Recommendation**: Actionable advice (e.g., "avoid 2-3pm")

### Adaptive Thresholds Card
Shows:
- **Personalization Confidence**: 0-100% based on data volume + consistency
  - <50%: More data needed
  - 50-80%: Moderate personalization
  - >80%: Well-personalized detection
- **Active Thresholds**: Current detection sensitivity
- **Why These Thresholds?**: Reasoning behind adjustments
- **Explanation**: How thresholds were computed

## Configuration

Store settings in `distractionDetectionSettings`:

```javascript
{
  enabled: true,                    // Master switch
  warningMode: 'progressive',       // 'soft' | 'strong' | 'persistent' | 'progressive'
  enableAdaptiveThreshold: true,    // Use 7-day learning
  showReasons: true,                // Show "why" in warnings
  cooldownMinutes: {
    soft: 5,
    strong: 10,
  }
}
```

## Usage Flow

### Starting a Focus Session

```javascript
// 1. User starts focus session in FocusModePanel
const sessionId = crypto.randomUUID();
await store.startDistractionSession(sessionId);

// 2. Store starts distraction detection loop (updates every 5 seconds)
store.startDistractionDetectionLoop();

// 3. Real-time updates:
// - Extension sends signals (clicks, scrolls, pageLoads, idle)
// - Signal aggregates over 5-second window
// - State machine evaluates
// - If warning needed, InterventionOverlay activates
```

### Ending a Focus Session

```javascript
// 1. User ends focus session
await store.endDistractionSession();

// 2. Store cleans up:
store.stopDistractionDetectionLoop();

// 3. Session summary is logged to IndexedDB
// (distraction_events store with eventType='session_ended')

// 4. Optional: Compute patterns from historical data
await store.updateAdaptiveThresholds();
```

### User Responds to Warning

```javascript
// Soft warning auto-dismisses or user clicks X
store.dismissDistractionWarning();

// Strong warning: user clicks "Back to Work"
store.transitionDistractionState('FOCUSED');
store.dismissDistractionWarning();

// Strong warning: user clicks "Dismiss"
store.dismissDistractionWarning();

// Persistent: user clicks "Take a Break Instead"
store.dismissDistractionWarning();
setActiveTab('dashboard');  // End session
```

## Data & Privacy

### Stored Locally
- Raw signals (clicks, keys, scrolls, page loads, idle time, app switches)
- Session states and transitions
- Distraction events with timestamps
- Recovery statistics
- Behavioral patterns (aggregated, not raw)
- Adaptive thresholds

### Never Sent Anywhere
- No external APIs
- No telemetry
- No user tracking
- No profile building

### Data Retention
- Sessions: 90 days (configurable)
- Distraction events: 90 days (configurable)
- Patterns: Computed fresh daily from 7-day window
- Thresholds: Updated daily or post-session

## Debugging

### Check Active Warnings
```javascript
const store = useFocusStore();
console.log(store.warningState);
// { active: true, level: 'strong', message: '...', reasons: [...] }
```

### Monitor State Transitions
```javascript
// In distraction-integration.js updateDistractionState():
console.log('Previous state:', tracker.previousState);
console.log('New state:', result.state);
console.log('Reasons:', result.reasons);
```

### Verify Signal Collection
Open extension developer tools (chrome://extensions):
```javascript
// In extension/background.js
console.log('Current session:', store.currentSession);
// Should show: clicks, scrolls, keys, pageLoads, idleTime, repeatVisits
```

### Test Adaptive Thresholds
```javascript
// In store.js after session ends:
const analysis = await store.updateAdaptiveThresholds();
console.log('Confidence:', analysis.confidence);
console.log('Thresholds:', analysis.thresholds);
console.log('Patterns:', analysis.patterns);
```

## Performance Considerations

- **Signal Aggregation**: 5-second window balances responsiveness vs noise
- **State Machine**: <1ms per evaluation (minimal overhead)
- **Warning Cooldown**: Prevents alert fatigue without missing genuine distractions
- **Adaptive Thresholds**: Computed once per day (not real-time)
- **Dashboard Cards**: Data loaded on-demand, not continuously updated

## Known Limitations

1. **No Context Memory**: System doesn't remember "I'm in a meeting" state between sessions
   - Mitigation: User manually ends focus session when context changes

2. **Browser-Only Signals**: Early implementation focuses on browser activity
   - Mitigation: Electron integration adds OS app switching

3. **No ML Models**: Uses deterministic thresholds, not neural networks
   - Mitigation: Simpler, explainable, more privacy-friendly

4. **Single Metric Focus**: Primarily tracks clicks + idle + switches
   - Mitigation: Can extend with keypress velocity, scroll speed, etc.

## Future Enhancements

- [ ] Machine learning for anomaly detection
- [ ] Context tags ("meeting", "pair-programming", "learning")
- [ ] Collaborative focus (team distraction patterns)
- [ ] Integration with calendar (auto-detect meeting times)
- [ ] Voice/webcam distraction detection (full privacy mode)
- [ ] Customizable warning styles and sounds
- [ ] Export distraction analytics to PDF

## Testing Checklist

- [ ] Soft warning triggers after 30s drifting
- [ ] Soft warning has 5-minute cooldown
- [ ] Strong warning triggers after 45s distracted
- [ ] Strong warning has 10-minute cooldown
- [ ] Persistent warning shows after 5 minutes deeply distracted
- [ ] Recovery tracking increments on return to focus
- [ ] Adaptive thresholds widen for high-switchers
- [ ] Adaptive thresholds narrow for low-switchers
- [ ] Confidence score matches data volume
- [ ] All reasons shown in warnings are accurate
- [ ] InterventionOverlay closes on dismiss
- [ ] Dashboard cards populate with historical data
- [ ] Electron signals integrate with browser signals
