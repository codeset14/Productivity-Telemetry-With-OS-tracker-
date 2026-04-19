/**
 * engine.js — Deterministic Processing Engine
 *
 * All outputs are deterministic — same logs always produce same result.
 * No randomness. Every number traces directly to input activity logs.
 *
 * Focus Score formula (BED-specified, explainable):
 *   raw   = productiveTime - distractingTime
 *   score = clamp( ((raw / activeTotal) + 1) / 2 × 100, 0, 100 )
 *
 * This means:
 *   all productive  → 100
 *   all distracting →   0
 *   equal split     →  50
 */

// ─── Public: Focus Score ──────────────────────────────────────────────────────

export function calculateFocusScore(productiveTime, distractingTime) {
  const total = productiveTime + distractingTime;
  if (total === 0) return 0;
  const raw = productiveTime - distractingTime;
  const normalized = ((raw / total) + 1) / 2 * 100;
  return Math.round(Math.max(0, Math.min(100, normalized)));
}

// ─── Formatting (used by engine + insight engine) ────────────────────────────

export function fmtDuration(seconds) {
  if (seconds <= 0) return '0m';
  if (seconds < 60)  return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60)        return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export function fmtHour(h) {
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}${suffix}`;
}

export function scoreLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 45) return 'Moderate';
  if (score >= 25) return 'Poor';
  return 'Critical';
}

export function scoreColor(score) {
  if (score >= 65) return 'var(--productive)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--distracting)';
}

// ─── Internal: Peak 2-hour window ────────────────────────────────────────────

function findPeakWindow(hourlyBreakdown, category, logs) {
  let bestTotal = 0;
  let bestStart = -1;

  for (let h = 0; h < 23; h++) {
    const total = hourlyBreakdown[h][category] + hourlyBreakdown[h + 1][category];
    if (total > bestTotal) { bestTotal = total; bestStart = h; }
  }

  if (bestTotal < 60 || bestStart < 0) return null;

  const endHour = bestStart + 2;
  const label = `${fmtHour(bestStart)}–${fmtHour(endHour)}`;

  // Compute dominant sites in this window from logs
  const siteMap = new Map();
  for (const log of logs) {
    if (log.category !== category) continue;
    const h = new Date(log.timestamp).getHours();
    if (h >= bestStart && h < endHour) {
      siteMap.set(log.site, (siteMap.get(log.site) ?? 0) + log.duration);
    }
  }

  const dominantSites = Array.from(siteMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([site, dur]) => ({ site, duration: dur }));

  return { startHour: bestStart, endHour, label, dominantSites, totalSeconds: bestTotal };
}

// ─── Main: Process logs into a single ProcessedData object ───────────────────

export function processLogs(logs) {
  if (!logs || logs.length === 0) return emptyData();

  // 1. Time totals
  let productiveTime = 0, distractingTime = 0, neutralTime = 0;
  for (const log of logs) {
    if (log.category === 'productive')  productiveTime  += log.duration;
    else if (log.category === 'distracting') distractingTime += log.duration;
    else                                neutralTime     += log.duration;
  }
  const totalTime = productiveTime + distractingTime + neutralTime;

  // 2. Focus score (deterministic from BED formula)
  const focusScore = calculateFocusScore(productiveTime, distractingTime);

  // 3. Top sites
  const siteMap = new Map();
  for (const log of logs) {
    const ex = siteMap.get(log.site);
    if (ex) ex.duration += log.duration;
    else siteMap.set(log.site, { duration: log.duration, category: log.category });
  }

  const topSites = Array.from(siteMap.entries())
    .map(([site, { duration, category }]) => ({
      site, duration, category,
      share: totalTime > 0 ? Math.round(duration / totalTime * 100) : 0,
    }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);

  const topProductiveSites  = topSites.filter(s => s.category === 'productive').slice(0, 5);
  const topDistractingSites = topSites.filter(s => s.category === 'distracting').slice(0, 5);

  // 4. Hourly breakdown
  const hourlyBreakdown = Array.from({ length: 24 }, (_, h) => ({
    hour: h, productive: 0, distracting: 0, neutral: 0,
  }));
  for (const log of logs) {
    const h = new Date(log.timestamp).getHours();
    const slot = hourlyBreakdown[h];
    if (log.category === 'productive')       slot.productive  += log.duration;
    else if (log.category === 'distracting') slot.distracting += log.duration;
    else                                     slot.neutral     += log.duration;
  }

  // 5. Daily breakdown
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayMap = new Map();
  for (const log of logs) {
    const d = new Date(log.timestamp);
    const key = d.toISOString().slice(0, 10);
    if (!dayMap.has(key)) {
      dayMap.set(key, { date: key, label: DAY[d.getDay()], productive: 0, distracting: 0, neutral: 0 });
    }
    const slot = dayMap.get(key);
    if (log.category === 'productive')       slot.productive  += log.duration;
    else if (log.category === 'distracting') slot.distracting += log.duration;
    else                                     slot.neutral     += log.duration;
  }
  const dailyBreakdown = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  // 6. Peak windows
  const peakDistractionWindow = findPeakWindow(hourlyBreakdown, 'distracting', logs);
  const peakProductiveWindow  = findPeakWindow(hourlyBreakdown, 'productive',  logs);

  // 7. Date range
  const timestamps = logs.map(l => l.timestamp).sort();
  const dateRange = {
    start: timestamps[0].slice(0, 10),
    end:   timestamps[timestamps.length - 1].slice(0, 10),
  };

  // 8. Focus state breakdown (from enriched logs)
  const focusStateBreakdown = { deep_focus: 0, drifting: 0, distracted: 0, unknown: 0 };
  for (const log of logs) {
    const fs = log.focusState;
    if (fs && focusStateBreakdown[fs] !== undefined) focusStateBreakdown[fs]++;
    else focusStateBreakdown.unknown++;
  }

  return {
    totalTime, productiveTime, distractingTime, neutralTime,
    focusScore, topSites, topProductiveSites, topDistractingSites,
    hourlyBreakdown, dailyBreakdown,
    peakDistractionWindow, peakProductiveWindow,
    focusStateBreakdown,
    logCount: logs.length,
    dateRange,
  };
}

// ─── Empty data (no logs) ─────────────────────────────────────────────────────

export function emptyData() {
  return {
    totalTime: 0, productiveTime: 0, distractingTime: 0, neutralTime: 0,
    focusScore: 0, topSites: [], topProductiveSites: [], topDistractingSites: [],
    hourlyBreakdown: Array.from({ length: 24 }, (_, h) => ({
      hour: h, productive: 0, distracting: 0, neutral: 0,
    })),
    dailyBreakdown: [],
    peakDistractionWindow: null, peakProductiveWindow: null,
    logCount: 0,
    dateRange: { start: '', end: '' },
  };
}

// ─── Distraction Detection Integration ─────────────────────────────────────────

/**
 * Process a session with behavioral signals through the distraction detection engine.
 * Used when a focus session ends to compute distraction state and metrics.
 *
 * Input session format:
 * {
 *   site, duration, category,
 *   interactions, tabSwitches,
 *   clicks, scrolls, keys, pageLoads, idleTime, repeatVisits
 * }
 *
 * Returns focus state object for storage in focus_states store.
 */
export function processSessionThroughBehaviorEngine(session, thresholds = null) {
  // Lazy import to avoid circular dependencies
  const engine = require('./focusBehaviorEngine');
  
  // Build metrics from session signals
  const metrics = engine.aggregateSignalsToMetrics(
    {
      contextSwitches: session.tabSwitches || 0,
      idleTime: session.idleTime || 0,
      interactions: session.interactions || 0,
      scrollEvents: session.scrolls || 0,
      pageLoads: session.pageLoads || 0,
      sessionCoherence: 0.7, // default, would be computed from site diversity
      repeatVisits: session.repeatVisits || 0,
    },
    session.duration
  );

  // Use adaptive thresholds if provided, otherwise use base
  const appliedThresholds = thresholds || engine.BASE_THRESHOLDS;

  // Evaluate state (start from focused, evaluate once for the session)
  const state = engine.evaluateStateTransition(
    'focused',
    metrics,
    appliedThresholds,
    session.duration
  );

  // Compute focus score
  const { score, confidence, reasons } = engine.computeFocusScore(state, metrics);

  return {
    state,
    score,
    confidence,
    reasons,
    signals: metrics,
    thresholds: appliedThresholds,
    sessionDuration: session.duration,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Compute behavioral patterns from a list of focus states.
 * Returns analysis of peak distraction times, common triggers, etc.
 */
export function analyzeBehaviorPatterns(focusStates = []) {
  if (focusStates.length === 0) {
    return {
      peakDistractionTime: null,
      commonDistractions: [],
      typicalFocusBlockDuration: 0,
      contextSwitchPattern: 'medium',
    };
  }

  // Find peak distraction hours
  const distractionHours = focusStates
    .filter(s => s.state === 'distracted' || s.state === 'deeply_distracted')
    .map(s => new Date(s.timestamp).getHours());

  const hourCounts = {};
  distractionHours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
  const peakHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0];
  const peakDistractionTime = peakHour ? `${peakHour[0]}:00 - ${parseInt(peakHour[0]) + 1}:00` : null;

  // Analyze focus block durations
  const focusBlocks = [];
  let currentBlockStart = null;
  for (const state of focusStates) {
    if (state.state === 'focused' && !currentBlockStart) {
      currentBlockStart = state.timestamp;
    } else if (state.state !== 'focused' && currentBlockStart) {
      const duration = (new Date(state.timestamp) - new Date(currentBlockStart)) / 1000;
      focusBlocks.push(duration);
      currentBlockStart = null;
    }
  }

  const typicalFocusBlockDuration = focusBlocks.length > 0
    ? Math.round(focusBlocks.reduce((a, b) => a + b, 0) / focusBlocks.length)
    : 0;

  // Analyze context switching pattern
  const switchCounts = focusStates
    .map(s => s.signals?.contextSwitchFreq || 2.0)
    .sort((a, b) => a - b);
  const medianSwitches = switchCounts[Math.floor(switchCounts.length / 2)];
  const contextSwitchPattern = medianSwitches < 2 ? 'low' : medianSwitches < 3.5 ? 'medium' : 'high';

  return {
    peakDistractionTime,
    commonDistractions: [], // would be computed from session data
    typicalFocusBlockDuration,
    contextSwitchPattern,
  };
}
