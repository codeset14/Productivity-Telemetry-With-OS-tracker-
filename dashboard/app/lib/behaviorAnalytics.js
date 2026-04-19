/**
 * behaviorAnalytics.js — Historical Behavior Analysis & Adaptive Learning
 *
 * Analyzes 7-day user behavior patterns to:
 * 1. Compute adaptive thresholds personalized to user
 * 2. Identify distraction patterns (peak times, triggers)
 * 3. Calculate behavior consistency/confidence
 * 4. Generate reasoning for threshold adjustments
 */

import { BASE_THRESHOLDS, calculateAdaptiveThresholds } from './focusBehaviorEngine';

// ────────────────────────────────────────────────────────────────────────────
// HISTORICAL DATA PROCESSING
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract behavioral metrics from a list of sessions.
 * Sessions should have: duration, tabSwitches, clicks, scrolls, keys, idleTime, etc.
 */
export function extractSessionMetrics(sessions = []) {
  if (sessions.length === 0) {
    return {
      sessions: [],
      contextSwitchFreqs: [],
      idlePercentages: [],
      interactionDensities: [],
      focusBlockDurations: [],
      stats: null,
    };
  }

  const contextSwitchFreqs = [];
  const idlePercentages = [];
  const interactionDensities = [];
  const focusBlockDurations = [];

  for (const session of sessions) {
    const duration = session.duration || 1;
    
    // Context switch frequency (per minute)
    const contextSwitchFreq = ((session.tabSwitches || 0) / (duration / 60));
    contextSwitchFreqs.push(contextSwitchFreq);

    // Idle percentage
    const idlePercentage = (session.idleTime || 0) / duration;
    idlePercentages.push(idlePercentage);

    // Interaction density (events per minute)
    const interactions = (session.clicks || 0) + (session.keys || 0) + (session.scrolls || 0);
    const interactionDensity = interactions / (duration / 60);
    interactionDensities.push(interactionDensity);

    // Focus block duration (session duration acts as proxy for focus block)
    focusBlockDurations.push(duration);
  }

  return {
    sessions,
    contextSwitchFreqs,
    idlePercentages,
    interactionDensities,
    focusBlockDurations,
    stats: computeStats({
      contextSwitchFreqs,
      idlePercentages,
      interactionDensities,
      focusBlockDurations,
    }),
  };
}

/**
 * Compute statistical measures (mean, median, std dev, percentiles).
 */
function computeStats(metrics) {
  const stats = {};

  for (const [key, values] of Object.entries(metrics)) {
    if (values.length === 0) {
      stats[key] = {
        mean: 0,
        median: 0,
        stdDev: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        min: 0,
        max: 0,
      };
      continue;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    stats[key] = {
      mean: parseFloat(mean.toFixed(2)),
      median: sorted[Math.floor(sorted.length / 2)],
      stdDev: parseFloat(stdDev.toFixed(2)),
      p25: sorted[Math.floor(sorted.length * 0.25)],
      p50: sorted[Math.floor(sorted.length * 0.50)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p90: sorted[Math.floor(sorted.length * 0.90)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  }

  return stats;
}

// ────────────────────────────────────────────────────────────────────────────
// BEHAVIORAL PATTERN DETECTION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Detect behavioral patterns from focus states and events.
 */
export function detectDistractionPatterns(focusStates = []) {
  if (focusStates.length === 0) {
    return {
      peakDistractionHour: null,
      commonDistractionTimes: [],
      typicalFocusBlockDuration: 0,
      focusBlockConsistency: 'variable',
      averageRecoveryTime: 0,
      distractionFrequency: 0,
      identifiedTriggers: [],
    };
  }

  // Peak distraction hour
  const distractionsByHour = new Map();
  for (const state of focusStates) {
    if (state.state === 'distracted' || state.state === 'deeply_distracted') {
      const hour = new Date(state.timestamp).getHours();
      distractionsByHour.set(hour, (distractionsByHour.get(hour) || 0) + 1);
    }
  }

  const peakDistractionHour = distractionsByHour.size > 0
    ? Array.from(distractionsByHour.entries()).sort(([, a], [, b]) => b - a)[0][0]
    : null;

  // Common distraction times (hours with > average distractions)
  const avgDistractionCount = Array.from(distractionsByHour.values()).reduce((a, b) => a + b, 0) / Math.max(24, distractionsByHour.size);
  const commonDistractionTimes = Array.from(distractionsByHour.entries())
    .filter(([, count]) => count > avgDistractionCount)
    .map(([hour]) => `${hour}:00-${hour + 1}:00`);

  // Focus block duration analysis
  let currentFocusStart = null;
  const focusBlockDurations = [];
  for (const state of focusStates) {
    if (state.state === 'focused' && !currentFocusStart) {
      currentFocusStart = new Date(state.timestamp).getTime();
    } else if (state.state !== 'focused' && currentFocusStart) {
      const duration = (new Date(state.timestamp).getTime() - currentFocusStart) / 1000;
      focusBlockDurations.push(duration);
      currentFocusStart = null;
    }
  }

  const typicalFocusBlockDuration = focusBlockDurations.length > 0
    ? focusBlockDurations.reduce((a, b) => a + b, 0) / focusBlockDurations.length
    : 0;

  // Consistency: low std dev = consistent focus blocks
  const focusBlockMean = typicalFocusBlockDuration;
  const focusBlockVariance = focusBlockDurations.reduce((sum, v) => sum + Math.pow(v - focusBlockMean, 2), 0) / Math.max(1, focusBlockDurations.length);
  const focusBlockStdDev = Math.sqrt(focusBlockVariance);
  const focusBlockCoeffVar = focusBlockStdDev / focusBlockMean;
  const focusBlockConsistency = focusBlockCoeffVar < 0.3 ? 'consistent' : focusBlockCoeffVar < 0.7 ? 'variable' : 'highly_variable';

  // Recovery time (from distracted to focused)
  let inDistraction = false;
  let distractionStart = null;
  const recoveryTimes = [];
  for (const state of focusStates) {
    if ((state.state === 'distracted' || state.state === 'deeply_distracted') && !inDistraction) {
      inDistraction = true;
      distractionStart = new Date(state.timestamp).getTime();
    } else if (state.state === 'focused' && inDistraction) {
      const recoveryTime = (new Date(state.timestamp).getTime() - distractionStart) / 1000;
      recoveryTimes.push(recoveryTime);
      inDistraction = false;
    }
  }

  const averageRecoveryTime = recoveryTimes.length > 0
    ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
    : 0;

  // Distraction frequency
  const distractionCount = focusStates.filter(s => s.state === 'distracted' || s.state === 'deeply_distracted').length;
  const distractionFrequency = focusStates.length > 0 ? (distractionCount / focusStates.length) : 0;

  return {
    peakDistractionHour,
    commonDistractionTimes,
    typicalFocusBlockDuration: Math.round(typicalFocusBlockDuration),
    focusBlockConsistency,
    averageRecoveryTime: Math.round(averageRecoveryTime),
    distractionFrequency: parseFloat((distractionFrequency * 100).toFixed(1)),
    identifiedTriggers: [], // populated from session data
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CONFIDENCE & CONSISTENCY MEASUREMENT
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calculate confidence in behavioral assessments.
 * Returns 0-1 score based on data volume and consistency.
 */
export function calculateConfidence(metrics) {
  // Minimum data points needed for 100% confidence
  const MIN_SESSIONS = 10;
  const data = metrics.stats;

  if (!data || !metrics.sessions || metrics.sessions.length < 3) {
    return 0.0; // Not enough data
  }

  // Data volume component (0-1)
  const volumeConfidence = Math.min(1.0, metrics.sessions.length / MIN_SESSIONS);

  // Consistency component (0-1): lower std dev = higher confidence
  const contextStdDev = data.contextSwitchFreqs?.stdDev || 1.0;
  const contextMean = data.contextSwitchFreqs?.mean || 2.0;
  const contextCoeffVar = contextStdDev / (contextMean || 1.0);
  const consistencyConfidence = Math.max(0.3, 1.0 - contextCoeffVar);

  // Combined confidence
  const confidence = (volumeConfidence * 0.6 + consistencyConfidence * 0.4);

  return parseFloat(Math.max(0, Math.min(1, confidence)).toFixed(2));
}

// ────────────────────────────────────────────────────────────────────────────
// REASONING ENGINE (Explainability)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate human-readable explanation for threshold adjustments.
 */
export function generateThresholdExplanation(
  userMetrics,
  baseThresholds,
  adaptiveThresholds,
  confidence
) {
  const reasons = [];
  const data = userMetrics.stats;

  if (!data) return reasons;

  // Context switch adjustment
  if (adaptiveThresholds.contextSwitchThreshold !== baseThresholds.contextSwitchThreshold) {
    const userMedian = data.contextSwitchFreqs?.p75 || 2.0;
    const adjustment = ((adaptiveThresholds.contextSwitchThreshold - baseThresholds.contextSwitchThreshold) / baseThresholds.contextSwitchThreshold * 100).toFixed(0);
    if (Math.abs(adjustment) > 5) {
      const direction = adjustment > 0 ? 'increased' : 'decreased';
      reasons.push(`Context switching threshold ${direction} by ${Math.abs(adjustment)}% (you typically switch ${userMedian.toFixed(1)}/min)`);
    }
  }

  // Focus block adjustment
  if (adaptiveThresholds.focusBlockMinDuration !== baseThresholds.focusBlockMinDuration) {
    const userMedian = data.focusBlockDurations?.p50 || 300;
    const adjustment = ((adaptiveThresholds.focusBlockMinDuration - baseThresholds.focusBlockMinDuration) / baseThresholds.focusBlockMinDuration * 100).toFixed(0);
    if (Math.abs(adjustment) > 5) {
      const direction = adjustment > 0 ? 'increased' : 'decreased';
      reasons.push(`Focus block duration threshold ${direction} by ${Math.abs(adjustment)}% (your typical: ${Math.round(userMedian / 60)}min)`);
    }
  }

  // Confidence note
  if (confidence < 0.5) {
    reasons.push(`Low confidence (${(confidence * 100).toFixed(0)}%) — thresholds will adjust as more data accumulates`);
  } else if (confidence > 0.8) {
    reasons.push(`High confidence (${(confidence * 100).toFixed(0)}%) — thresholds are well-personalized to your behavior`);
  }

  return reasons;
}

// ────────────────────────────────────────────────────────────────────────────
// DISTRACTION TRIGGER ANALYSIS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Analyze sessions to identify common distraction triggers.
 * Returns list of triggers with frequency and confidence.
 */
export function identifyDistractionTriggers(sessions = []) {
  const distractingSessions = sessions.filter(s => s.category === 'distracting');
  if (distractingSessions.length === 0) return [];

  // Group by site
  const siteFrequency = new Map();
  for (const session of distractingSessions) {
    if (session.site) {
      siteFrequency.set(session.site, (siteFrequency.get(session.site) || 0) + 1);
    }
  }

  // Top triggers by frequency
  const triggers = Array.from(siteFrequency.entries())
    .map(([site, frequency]) => ({
      trigger: site,
      frequency,
      percentage: parseFloat(((frequency / distractingSessions.length) * 100).toFixed(1)),
      confidence: Math.min(1.0, frequency / 5), // higher freq = higher confidence
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);

  return triggers;
}

// ────────────────────────────────────────────────────────────────────────────
// ADAPTIVE THRESHOLD COMPUTATION (Main API)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute fully adaptive thresholds based on 7-day user behavior.
 *
 * Returns:
 * {
 *   thresholds: { ...adaptive threshold values },
 *   confidence: 0-1 score,
 *   reasoning: ['explanation 1', 'explanation 2', ...],
 *   metrics: { stats and analysis },
 *   patterns: { behavioral patterns },
 * }
 */
export function computeAdaptiveThresholds(sessions = [], focusStates = []) {
  // Extract metrics from sessions
  const userMetrics = extractSessionMetrics(sessions);

  // Compute base adaptive thresholds using engine function
  const adaptiveThresholds = calculateAdaptiveThresholds({
    sessions: sessions.map(s => ({
      contextSwitchFrequency: (s.tabSwitches || 0) / (s.duration / 60),
      avgFocusBlock: s.duration,
      totalIdleTime: s.idleTime || 0,
    })),
  });

  // Calculate confidence
  const confidence = calculateConfidence(userMetrics);

  // Generate reasoning
  const reasoning = generateThresholdExplanation(
    userMetrics,
    BASE_THRESHOLDS,
    adaptiveThresholds,
    confidence
  );

  // Detect behavioral patterns
  const patterns = detectDistractionPatterns(focusStates);

  // Identify triggers
  const triggers = identifyDistractionTriggers(sessions);
  patterns.identifiedTriggers = triggers;

  return {
    thresholds: adaptiveThresholds,
    confidence,
    reasoning,
    metrics: {
      sessionCount: sessions.length,
      focusStateCount: focusStates.length,
      stats: userMetrics.stats,
    },
    patterns,
    timestamp: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

export default {
  extractSessionMetrics,
  detectDistractionPatterns,
  calculateConfidence,
  generateThresholdExplanation,
  identifyDistractionTriggers,
  computeAdaptiveThresholds,
};
