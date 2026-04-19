/**
 * behaviorEngine.js — Focus Intelligence Engine
 *
 * Pure-function module that computes a dynamic focus state from raw
 * activity signals. Sits between data ingestion and analytics.
 *
 * Three states:
 *   deep_focus  — sustained productive work, low switching
 *   drifting    — mixed signals, starting to lose focus
 *   distracted  — high switching, short sessions, distracting content
 *
 * Every output includes a reasons[] array for explainability.
 */

const WINDOW_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sum(arr, key) {
  return arr.reduce((s, e) => s + (e[key] || 0), 0);
}

function avg(arr, key) {
  if (arr.length === 0) return 0;
  return sum(arr, key) / arr.length;
}

// ─── Core: Compute Focus State ───────────────────────────────────────────────

/**
 * computeFocusState(recentEvents)
 *
 * @param {Array} recentEvents — last N activity events (log/session entries).
 *   Each must have: { site, duration, category, timestamp }
 *   Optional: { interactions, tabSwitches }
 *
 * @returns {{ state: string, score: number, confidence: number, reasons: string[], timestamp: string }}
 */
export function computeFocusState(recentEvents) {
  if (!recentEvents || recentEvents.length === 0) {
    return {
      state: 'deep_focus',
      score: 50,
      confidence: 0,
      reasons: ['No recent activity data'],
      timestamp: new Date().toISOString(),
    };
  }

  // ── Signal extraction ──────────────────────────────────────────────────────

  const sorted = [...recentEvents].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
  const oldestTs = new Date(sorted[0].timestamp).getTime();
  const windowSec = Math.max(1, (Date.now() - oldestTs) / 1000);

  const totalSwitches     = sum(sorted, 'tabSwitches');
  const totalInteractions = sum(sorted, 'interactions');
  const avgDuration       = avg(sorted, 'duration');
  const uniqueSites       = new Set(sorted.map(e => e.site)).size;
  const distractingCount  = sorted.filter(e => e.category === 'distracting').length;
  const distractingRatio  = distractingCount / sorted.length;

  // ── Scoring (0–100, higher = more focused) ─────────────────────────────────

  let score = 50;
  const reasons = [];

  // Signal 1: Tab switching frequency (switches per minute)
  const switchRate = totalSwitches / (windowSec / 60);
  if (switchRate > 8) {
    score -= 25;
    reasons.push(`High tab switching (${switchRate.toFixed(1)}/min)`);
  } else if (switchRate > 4) {
    score -= 12;
    reasons.push(`Moderate tab switching (${switchRate.toFixed(1)}/min)`);
  } else if (switchRate <= 2 && windowSec > 60) {
    score += 15;
    reasons.push('Low tab switching — sustained attention');
  }

  // Signal 2: Session duration
  if (avgDuration >= 600) {
    score += 20;
    reasons.push(`Long sessions (avg ${Math.round(avgDuration / 60)}m)`);
  } else if (avgDuration >= 180) {
    score += 5;
  } else if (avgDuration > 0) {
    score -= 20;
    reasons.push(`Very short sessions (avg ${Math.round(avgDuration)}s)`);
  }

  // Signal 3: Interaction density (interactions per minute of session time)
  if (avgDuration > 0 && totalInteractions > 0) {
    const interactionRate = (totalInteractions / sorted.length) / (avgDuration / 60);
    if (interactionRate >= 5) {
      score += 10;
      reasons.push('High interaction density — active engagement');
    } else if (interactionRate < 1 && avgDuration > 120) {
      score -= 10;
      reasons.push('Low interaction — passive browsing');
    }
  }

  // Signal 4: Category distribution
  if (distractingRatio >= 0.8) {
    score -= 30;
    reasons.push(`${Math.round(distractingRatio * 100)}% of recent activity is distracting`);
  } else if (distractingRatio >= 0.4) {
    score -= 15;
    reasons.push('Mix of productive and distracting activity');
  } else if (distractingRatio === 0 && sorted.some(e => e.category === 'productive')) {
    score += 15;
    reasons.push('All recent activity is productive or neutral');
  }

  // Signal 5: Site scatter
  if (uniqueSites >= 4 && sorted.length <= WINDOW_SIZE) {
    score -= 10;
    reasons.push(`Scattered across ${uniqueSites} different sites`);
  } else if (uniqueSites <= 2 && sorted.length >= 3) {
    score += 10;
    reasons.push('Concentrated on 1–2 sites');
  }

  // ── Clamp & classify ──────────────────────────────────────────────────────

  score = Math.max(0, Math.min(100, score));
  const confidence = Math.min(1, sorted.length / WINDOW_SIZE);

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
    windowEvents: sorted.length,
  };
}

// ─── Focus Consistency Score ──────────────────────────────────────────────────

/**
 * focusConsistencyScore(focusStates)
 *
 * @param {Array} focusStates — array of { state, timestamp } from focus_states store
 * @returns {{ score: number, longestStreak: number, avgFocusBlock: number, driftCount: number }}
 */
export function focusConsistencyScore(focusStates) {
  if (!focusStates || focusStates.length === 0) {
    return { score: 0, longestStreak: 0, avgFocusBlock: 0, driftCount: 0 };
  }

  const sorted = [...focusStates].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  let deepFocusTime = 0;
  let totalTime = 0;
  let longestStreak = 0;
  let currentStreak = 0;
  let focusBlocks = [];
  let currentBlock = 0;
  let driftCount = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    const gap = (new Date(next.timestamp) - new Date(curr.timestamp)) / 1000;

    // Skip unreasonably large gaps (> 30 min) — user was away
    if (gap > 1800) continue;

    totalTime += gap;

    if (curr.state === 'deep_focus') {
      deepFocusTime += gap;
      currentStreak += gap;
      currentBlock += gap;
    } else {
      if (currentStreak > longestStreak) longestStreak = currentStreak;
      if (currentBlock > 0) focusBlocks.push(currentBlock);
      currentStreak = 0;
      currentBlock = 0;
    }

    if (curr.state === 'drifting' || curr.state === 'distracted') {
      if (i > 0 && sorted[i - 1].state === 'deep_focus') {
        driftCount++;
      }
    }
  }

  // Handle last segment
  if (currentStreak > longestStreak) longestStreak = currentStreak;
  if (currentBlock > 0) focusBlocks.push(currentBlock);

  const score = totalTime > 0 ? Math.round((deepFocusTime / totalTime) * 100) : 0;
  const avgFocusBlock = focusBlocks.length > 0
    ? Math.round(focusBlocks.reduce((s, b) => s + b, 0) / focusBlocks.length)
    : 0;

  return {
    score,
    longestStreak: Math.round(longestStreak),
    avgFocusBlock,
    driftCount,
  };
}

// ─── Pattern Detection ───────────────────────────────────────────────────────

/**
 * detectPatterns(focusStates)
 *
 * Finds behavioral patterns like "You lose focus after X minutes".
 *
 * @param {Array} focusStates — array of { state, score, reasons, timestamp }
 * @returns {Array<{ type: string, text: string, detail: string|null }>}
 */
export function detectPatterns(focusStates) {
  if (!focusStates || focusStates.length < 5) return [];

  const sorted = [...focusStates].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  const patterns = [];

  // Pattern 1: Average time before drifting
  const driftTransitions = [];
  let focusStart = null;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.state === 'deep_focus' && !focusStart) {
      focusStart = new Date(s.timestamp);
    } else if (s.state !== 'deep_focus' && focusStart) {
      const durationSec = (new Date(s.timestamp) - focusStart) / 1000;
      if (durationSec > 30 && durationSec < 7200) {
        driftTransitions.push(durationSec);
      }
      focusStart = null;
    }
  }

  if (driftTransitions.length >= 3) {
    const avgDrift = Math.round(
      driftTransitions.reduce((s, d) => s + d, 0) / driftTransitions.length
    );
    if (avgDrift < 1800) {
      const minutes = Math.round(avgDrift / 60);
      patterns.push({
        type: 'warning',
        text: `You typically lose focus after ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
        detail: minutes < 10
          ? 'Try shorter, more intense focus blocks (e.g. 5-minute sprints).'
          : 'Consider the Pomodoro technique to maintain longer focus.',
      });
    }
  }

  // Pattern 2: Recurring distraction hours
  const hourCounts = new Map();
  sorted
    .filter(s => s.state === 'distracted')
    .forEach(s => {
      const h = new Date(s.timestamp).getHours();
      hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
    });

  const peakHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (peakHour && peakHour[1] >= 3) {
    const h = peakHour[0];
    const label = `${h % 12 || 12}${h < 12 ? 'AM' : 'PM'}`;
    patterns.push({
      type: 'info',
      text: `Your most distracted hour is around ${label}.`,
      detail: 'Schedule your most important work outside this window.',
    });
  }

  // Pattern 3: Improving or declining trend
  if (sorted.length >= 10) {
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
    const avgFirst = firstHalf.reduce((s, e) => s + e.score, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, e) => s + e.score, 0) / secondHalf.length;
    const diff = avgSecond - avgFirst;

    if (diff >= 10) {
      patterns.push({
        type: 'positive',
        text: `Your focus is improving — score up ${Math.round(diff)} points recently.`,
        detail: null,
      });
    } else if (diff <= -10) {
      patterns.push({
        type: 'warning',
        text: `Your focus is declining — score down ${Math.round(Math.abs(diff))} points recently.`,
        detail: 'Consider taking a break or enabling Focus Mode.',
      });
    }
  }

  return patterns;
}
