/**
 * distraction-integration.js — Central orchestration for distraction detection
 *
 * Coordinates:
 * 1. Signal collection from extension/electron
 * 2. Behavior engine evaluation
 * 3. Warning trigger logic
 * 4. UI updates
 */

import {
  evaluateStateTransition,
  computeFocusScore,
  determineWarningTrigger,
  aggregateSignalsToMetrics,
  BASE_THRESHOLDS,
} from './focusBehaviorEngine';
import { computeAdaptiveThresholds } from './behaviorAnalytics';

/**
 * Main distraction detection loop.
 * Call this periodically (every 5 seconds) during a focus session.
 *
 * Input:
 * - tracker: DistractionStateTracker instance
 * - adaptiveThresholds: current adaptive thresholds
 * - onWarning: callback when warning should trigger
 *
 * Output:
 * - updated tracker state
 */
export function updateDistractionState(tracker, adaptiveThresholds, onWarning) {
  if (!tracker) return null;

  // Get current metrics
  const metrics = aggregateSignalsToMetrics(tracker.signals, tracker.getSessionDuration());
  const durations = tracker.getDurations();
  const thresholds = adaptiveThresholds || BASE_THRESHOLDS;

  // Evaluate state transition
  const newState = evaluateStateTransition(
    tracker.currentState,
    metrics,
    thresholds,
    durations.session
  );

  // Update tracker if state changed
  const stateChanged = tracker.transitionState(newState);

  // Compute focus score
  const { score, confidence, reasons } = computeFocusScore(newState, metrics);

  // Determine if warning should trigger
  const warningTrigger = determineWarningTrigger(
    tracker.previousState,
    newState,
    durations.drifting,
    durations.distracted,
    {
      soft: tracker.warningState.soft,
      strong: tracker.warningState.strong,
    },
    thresholds
  );

  // Trigger warning if needed
  if (warningTrigger.shouldWarn && onWarning) {
    const warningEvent = tracker.triggerWarning(warningTrigger.level, warningTrigger.reason);
    onWarning({
      level: warningTrigger.level,
      reasons,
      message: generateWarningMessage(warningTrigger.level),
      event: warningEvent,
    });
  }

  return {
    state: newState,
    score,
    confidence,
    reasons,
    metrics,
    durations,
    stateChanged,
    warningTriggered: warningTrigger.shouldWarn,
    warningLevel: warningTrigger.level,
  };
}

/**
 * Generate user-friendly warning message.
 */
function generateWarningMessage(level) {
  const messages = {
    soft: '💡 You\'re drifting away from focus',
    strong: '⚠️ You\'re getting distracted. Return to your task',
    persistent: '🚨 Extended distraction. Consider taking a break',
  };
  return messages[level] || 'Warning';
}

/**
 * Process session end and return summary for storage.
 */
export function summarizeSession(tracker) {
  if (!tracker) return null;

  const summary = tracker.endSession();

  return {
    sessionId: summary.sessionId,
    startTime: summary.startTime,
    endTime: summary.endTime,
    durationSeconds: summary.durationSeconds,
    finalState: summary.finalState,
    stateHistory: summary.stateHistory,
    recoveryStats: summary.recoveryStats,
    totalWarnings: summary.totalWarnings,
  };
}

/**
 * Compute adaptive thresholds from historical data.
 * Call once per day or after accumulating enough data.
 */
export function updateAdaptiveThresholdsFromHistory(sessions = [], focusStates = []) {
  return computeAdaptiveThresholds(sessions, focusStates);
}

export default {
  updateDistractionState,
  summarizeSession,
  updateAdaptiveThresholdsFromHistory,
  generateWarningMessage,
};
