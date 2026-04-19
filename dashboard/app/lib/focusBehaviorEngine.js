/**
 * focusBehaviorEngine.js — Real-Time Distraction Detection Engine
 *
 * Detects user distraction through behavioral signals:
 * - Tab/app switching frequency
 * - Idle gaps
 * - Interaction density changes
 * - Session coherence
 * - Repeat site visits
 *
 * Implements state machine: FOCUSED → DRIFTING → DISTRACTED → DEEPLY_DISTRACTED
 * with cooldown logic and warning triggers.
 */

// ────────────────────────────────────────────────────────────────────────────
// BASE THRESHOLDS (Fixed defaults)
// ────────────────────────────────────────────────────────────────────────────

export const BASE_THRESHOLDS = {
  // Context switching (switches per minute)
  contextSwitchThreshold: 2.0,        // switches/min = FOCUSED
  contextSwitchDrifting: 3.5,         // switches/min = DRIFTING
  contextSwitchDistracted: 5.0,       // switches/min = DISTRACTED

  // Idle detection
  idleThreshold: 120,                 // seconds of idle = idle gap
  maxIdlePerSession: 300,             // cumulative idle (seconds) before distraction signal
  idlePercentageThreshold: 0.15,      // 15% idle time = signal

  // Interaction density (events/min)
  interactionDropThreshold: 0.2,      // 20% drop = drifting signal
  lowInteractionThreshold: 0.3,       // events/min < 0.3 = low activity
  normalInteractionThreshold: 2.0,    // healthy interaction rate

  // Time-based
  focusBlockMinDuration: 300,         // seconds (5 min) before "focused" state lock-in
  driftingDuration: 30,               // seconds drifting before soft warning
  distractedDuration: 45,             // seconds distracted after soft warning = strong warning
  deeplyDistractionDuration: 300,     // 5 min in distracted = deeply_distracted

  // Session coherence (0-1 scale)
  sessionCoherenceThreshold: 0.6,     // coherence < 0.6 = distraction signal
  repeatVisitThreshold: 3,            // visits to same distracting site in 10 min = signal

  // Warning cooldown (milliseconds)
  softWarningCooldown: 5 * 60 * 1000,    // 5 minutes
  strongWarningCooldown: 10 * 60 * 1000, // 10 minutes
};

// ────────────────────────────────────────────────────────────────────────────
// STATE MACHINE: Core Logic
// ────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates state transition based on current state and metrics.
 * Returns new state: 'focused' | 'drifting' | 'distracted' | 'deeply_distracted'
 */
export function evaluateStateTransition(
  currentState,
  metrics,
  thresholds,
  sessionDuration
) {
  // FOCUSED state checks
  if (currentState === 'focused') {
    // Only transition if we have enough data (30+ seconds in session)
    if (sessionDuration < 30) return 'focused';

    // High context switching = drift
    if (metrics.contextSwitchFreq > thresholds.contextSwitchDrifting) {
      return 'drifting';
    }

    // High idle percentage = drift
    if (metrics.idlePercentage > thresholds.idlePercentageThreshold) {
      return 'drifting';
    }

    // Significant interaction drop = drift
    if (metrics.interactionDensity < thresholds.lowInteractionThreshold) {
      return 'drifting';
    }

    // Low session coherence = drift
    if (metrics.sessionCoherence < thresholds.sessionCoherenceThreshold * 0.8) {
      return 'drifting';
    }

    return 'focused';
  }

  // DRIFTING state checks
  if (currentState === 'drifting') {
    // Strong distraction signals = full distracted
    if (
      metrics.contextSwitchFreq > thresholds.contextSwitchDistracted ||
      metrics.idlePercentage > thresholds.idlePercentageThreshold * 2 ||
      metrics.repeatVisits > thresholds.repeatVisitThreshold ||
      metrics.sessionCoherence < thresholds.sessionCoherenceThreshold * 0.5
    ) {
      return 'distracted';
    }

    // Recovery: activity resumes and coherence improves
    if (
      metrics.interactionDensity > thresholds.normalInteractionThreshold * 0.6 &&
      metrics.contextSwitchFreq < thresholds.contextSwitchThreshold * 1.2 &&
      metrics.sessionCoherence > thresholds.sessionCoherenceThreshold * 1.1
    ) {
      return 'focused';
    }

    return 'drifting';
  }

  // DISTRACTED state checks
  if (currentState === 'distracted') {
    // Recovery wins
    if (
      metrics.interactionDensity > thresholds.normalInteractionThreshold * 0.8 &&
      metrics.contextSwitchFreq < thresholds.contextSwitchThreshold * 0.7 &&
      metrics.sessionCoherence > thresholds.sessionCoherenceThreshold * 1.3
    ) {
      return 'focused';
    }

    // Drifting back if activity drops but not severely
    if (
      metrics.contextSwitchFreq > thresholds.contextSwitchDistracted * 1.2 &&
      metrics.interactionDensity < thresholds.lowInteractionThreshold * 0.5
    ) {
      // Stay distracted for now, don't go back to drifting
      return 'distracted';
    }

    return 'distracted';
  }

  // DEEPLY_DISTRACTED state: only escapes via session reset or explicit user action
  if (currentState === 'deeply_distracted') {
    // User can manually reset, otherwise stay deeply distracted
    return 'deeply_distracted';
  }

  return 'focused'; // default fallback
}

// ────────────────────────────────────────────────────────────────────────────
// FOCUS SCORE CALCULATION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Computes focus score (0-100) from state + behavioral signals.
 * Returns: { score, confidence, reasons }
 */
export function computeFocusScore(state, metrics) {
  let score = 50; // baseline

  // State contribution (major weight: 60%)
  const stateScores = {
    focused: 95,
    drifting: 65,
    distracted: 30,
    deeply_distracted: 5,
  };
  const stateScore = stateScores[state] || 50;
  score = score * 0.4 + stateScore * 0.6;

  // Interaction density contribution (20%)
  let interactionScore = 50;
  if (metrics.interactionDensity > 3.0) interactionScore = 90;
  else if (metrics.interactionDensity > 1.5) interactionScore = 75;
  else if (metrics.interactionDensity > 0.8) interactionScore = 60;
  else if (metrics.interactionDensity < 0.2) interactionScore = 20;
  score = score * 0.8 + interactionScore * 0.2;

  // Context switching penalty (10%)
  let contextScore = 50;
  if (metrics.contextSwitchFreq > 5.0) contextScore = 20;
  else if (metrics.contextSwitchFreq > 3.0) contextScore = 40;
  else if (metrics.contextSwitchFreq < 1.5) contextScore = 80;
  score = score * 0.9 + contextScore * 0.1;

  // Session coherence bonus (10%)
  let coherenceScore = 50;
  if (metrics.sessionCoherence > 0.8) coherenceScore = 85;
  else if (metrics.sessionCoherence < 0.4) coherenceScore = 25;
  score = score * 0.9 + coherenceScore * 0.1;

  const finalScore = Math.round(Math.max(0, Math.min(100, score)));

  // Confidence based on data recency + metric consistency
  const confidence = Math.min(1.0, (metrics.dataPoints || 0) / 12);

  // Generate reasons
  const reasons = generateReasons(state, metrics);

  return { score: finalScore, confidence, reasons };
}

// ────────────────────────────────────────────────────────────────────────────
// REASONING ENGINE (Explainability)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generates human-readable reasons for the current state.
 */
function generateReasons(state, metrics) {
  const reasons = [];

  if (state === 'focused') {
    reasons.push('Consistent focus on task');
    if (metrics.interactionDensity > 2.0) {
      reasons.push(`Active engagement (${metrics.interactionDensity.toFixed(1)} events/min)`);
    }
  } else if (state === 'drifting') {
    if (metrics.contextSwitchFreq > 3.5) {
      reasons.push(
        `Frequent context switching (${metrics.contextSwitchFreq.toFixed(1)} switches/min vs normal 2/min)`
      );
    }
    if (metrics.idlePercentage > 0.15) {
      reasons.push(`Idle time detected (${(metrics.idlePercentage * 100).toFixed(0)}% of session)`);
    }
    if (metrics.interactionDensity < 0.3) {
      reasons.push(`Low activity level (${metrics.interactionDensity.toFixed(1)} events/min)`);
    }
    if (metrics.sessionCoherence < 0.6) {
      reasons.push(`Low task coherence (visiting unrelated sites)`);
    }
  } else if (state === 'distracted') {
    if (metrics.contextSwitchFreq > 5.0) {
      reasons.push(
        `High context switching (${metrics.contextSwitchFreq.toFixed(1)} switches/min)`
      );
    }
    if (metrics.repeatVisits > 3) {
      reasons.push(
        `Repeated visits to same distraction (${metrics.repeatVisits} times in 10 min)`
      );
    }
    if (metrics.sessionCoherence < 0.4) {
      reasons.push(`Very low task coherence`);
    }
    if (metrics.idlePercentage > 0.3) {
      reasons.push(`Extended idle periods`);
    }
  } else if (state === 'deeply_distracted') {
    reasons.push(`Prolonged distraction episode (>5 minutes)`);
    reasons.push(`Consider taking a break instead`);
  }

  return reasons.length > 0 ? reasons : ['State evaluated'];
}

// ────────────────────────────────────────────────────────────────────────────
// WARNING TRIGGER LOGIC
// ────────────────────────────────────────────────────────────────────────────

/**
 * Determines if warning should trigger and at what level.
 * Returns: { shouldWarn: boolean, level: 'soft' | 'strong' | 'persistent' | null, reason: string }
 */
export function determineWarningTrigger(
  previousState,
  currentState,
  driftingDuration,
  distractedDuration,
  lastWarningInfo,
  thresholds
) {
  const now = Date.now();
  let shouldWarn = false;
  let level = null;
  let reason = '';

  // Check cooldowns
  if (lastWarningInfo.soft?.expireAt && now < lastWarningInfo.soft.expireAt) {
    // Soft warning still in cooldown
    shouldWarn = false;
  } else if (lastWarningInfo.strong?.expireAt && now < lastWarningInfo.strong.expireAt) {
    // Strong warning still in cooldown
    shouldWarn = false;
  }

  // Soft warning: transition to drifting OR after 30 sec in drifting
  if (previousState === 'focused' && currentState === 'drifting') {
    shouldWarn = true;
    level = 'soft';
    reason = 'Transitioned to drifting state';
  } else if (
    currentState === 'drifting' &&
    driftingDuration >= thresholds.driftingDuration &&
    (!lastWarningInfo.soft?.shownAt || now - lastWarningInfo.soft.shownAt > thresholds.softWarningCooldown)
  ) {
    shouldWarn = true;
    level = 'soft';
    reason = 'Sustained drifting for 30+ seconds';
  }

  // Strong warning: transition to distracted OR after soft ignored for 45 sec
  if (previousState === 'drifting' && currentState === 'distracted') {
    shouldWarn = true;
    level = 'strong';
    reason = 'Transitioned to distracted state';
  } else if (
    currentState === 'distracted' &&
    distractedDuration >= thresholds.distractedDuration &&
    (!lastWarningInfo.strong?.shownAt || now - lastWarningInfo.strong.shownAt > thresholds.strongWarningCooldown)
  ) {
    shouldWarn = true;
    level = 'strong';
    reason = 'Sustained distraction for 45+ seconds';
  }

  // Persistent overlay: deeply distracted (always shown, no cooldown)
  if (currentState === 'deeply_distracted' && previousState !== 'deeply_distracted') {
    shouldWarn = true;
    level = 'persistent';
    reason = 'Extended distraction (5+ minutes)';
  }

  return { shouldWarn, level, reason };
}

// ────────────────────────────────────────────────────────────────────────────
// ADAPTIVE THRESHOLD CALCULATION (Learning from history)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calculates adaptive thresholds based on 7-day user behavior history.
 * Returns adjusted thresholds that are personalized to user patterns.
 */
export function calculateAdaptiveThresholds(historicalStats = null) {
  if (!historicalStats || !historicalStats.sessions || historicalStats.sessions.length === 0) {
    // No history: return base thresholds
    return { ...BASE_THRESHOLDS, confidence: 0.0, multiplier: 1.0 };
  }

  const sessions = historicalStats.sessions;
  const sessionCount = sessions.length;

  // Extract key metrics across sessions
  const contextSwitchFreqs = sessions
    .map(s => s.contextSwitchFrequency || 2.0)
    .sort((a, b) => a - b);
  const focusBlockDurations = sessions
    .map(s => s.avgFocusBlock || 300)
    .sort((a, b) => a - b);
  const idleTimes = sessions
    .map(s => s.totalIdleTime || 0)
    .sort((a, b) => a - b);

  // Calculate 75th percentile of user's behavior
  const p75Index = Math.floor(sessionCount * 0.75);
  const userContextSwitchMedian = contextSwitchFreqs[p75Index] || 2.0;
  const userFocusBlockMedian = focusBlockDurations[p75Index] || 300;

  // Calculate variance to measure behavior consistency
  const variance = calculateVariance(contextSwitchFreqs);
  const behaviorConsistency = Math.max(0.5, 1 - variance);

  // Adjustment multiplier: -30% to +30% range
  const contextSwitchAdjustment = Math.max(-0.3, Math.min(0.3, (userContextSwitchMedian - BASE_THRESHOLDS.contextSwitchThreshold) / BASE_THRESHOLDS.contextSwitchThreshold));
  const focusBlockAdjustment = Math.max(0.7, Math.min(1.3, userFocusBlockMedian / BASE_THRESHOLDS.focusBlockMinDuration));

  // Build adaptive thresholds
  const adaptiveThresholds = {
    ...BASE_THRESHOLDS,
    contextSwitchThreshold: BASE_THRESHOLDS.contextSwitchThreshold * (1 + contextSwitchAdjustment),
    contextSwitchDrifting: BASE_THRESHOLDS.contextSwitchDrifting * (1 + contextSwitchAdjustment),
    contextSwitchDistracted: BASE_THRESHOLDS.contextSwitchDistracted * (1 + contextSwitchAdjustment),
    focusBlockMinDuration: BASE_THRESHOLDS.focusBlockMinDuration * focusBlockAdjustment,
    confidence: behaviorConsistency,
    multiplier: 1 + contextSwitchAdjustment,
    reason: `Adjusted based on 7-day history (${sessionCount} sessions)`,
  };

  return adaptiveThresholds;
}

// ────────────────────────────────────────────────────────────────────────────
// UTILITY: Variance Calculation
// ────────────────────────────────────────────────────────────────────────────

function calculateVariance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance) / (mean || 1); // coefficient of variation
}

// ────────────────────────────────────────────────────────────────────────────
// SIGNAL AGGREGATION (Combine raw signals into metrics)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Aggregates raw behavioral signals into computed metrics.
 * Expects signals object with: contextSwitches, idleTime, interactions, etc.
 */
export function aggregateSignalsToMetrics(signals, sessionDuration) {
  const elapsed = sessionDuration || 1; // avoid division by zero

  // Compute frequencies (per minute)
  const contextSwitchFreq = (signals.contextSwitches || 0) / (elapsed / 60);
  const idlePercentage = (signals.idleTime || 0) / elapsed;
  const interactionDensity = (signals.interactions || 0) / (elapsed / 60);
  const scrollIntensity = (signals.scrollEvents || 0) / (elapsed / 60);
  const pageLoadFrequency = (signals.pageLoads || 0) / (elapsed / 60);

  // Session coherence: measure of task consistency (0-1 scale)
  // Computed as: (1 - variance_of_site_categories) normalized
  const sessionCoherence = signals.sessionCoherence || 0.5;

  // Repeat visits: count of duplicate distracting sites in 10-min window
  const repeatVisits = signals.repeatVisits || 0;

  const metrics = {
    contextSwitchFreq,
    idlePercentage,
    interactionDensity,
    scrollIntensity,
    pageLoadFrequency,
    sessionCoherence,
    repeatVisits,
    dataPoints: Object.keys(signals).length,
  };

  return metrics;
}

// ────────────────────────────────────────────────────────────────────────────
// RECOVERY TRACKING
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tracks recovery events (return from distracted to focused state).
 * Updates recovery statistics.
 */
export function recordRecovery(recoveryStats, timeToRecoverySeconds) {
  return {
    ...recoveryStats,
    totalRecoveries: (recoveryStats.totalRecoveries || 0) + 1,
    avgTimeToRecovery: (
      ((recoveryStats.avgTimeToRecovery || 0) * (recoveryStats.totalRecoveries || 0) +
        timeToRecoverySeconds) /
      ((recoveryStats.totalRecoveries || 0) + 1)
    ),
    recoveryStreak: (recoveryStats.recoveryStreak || 0) + 1,
    lastRecoveryAt: new Date().toISOString(),
  };
}

/**
 * Resets recovery streak when user enters distracted state again.
 */
export function resetRecoveryStreak(recoveryStats) {
  return { ...recoveryStats, recoveryStreak: 0 };
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORT ALL
// ────────────────────────────────────────────────────────────────────────────

export default {
  BASE_THRESHOLDS,
  evaluateStateTransition,
  computeFocusScore,
  determineWarningTrigger,
  calculateAdaptiveThresholds,
  aggregateSignalsToMetrics,
  recordRecovery,
  resetRecoveryStreak,
};
