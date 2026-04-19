/**
 * distractionState.js — Real-Time Session State Tracker
 *
 * Maintains live session state during focus sessions:
 * - Accumulates behavioral signals
 * - Tracks state transitions
 * - Manages warning cooldowns
 * - Computes metrics for distraction detection
 */

export class DistractionStateTracker {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.startTime = Date.now();
    this.currentState = 'focused';
    this.previousState = 'focused';

    // Signal accumulation (5-second window)
    this.signals = {
      contextSwitches: 0,
      idleTime: 0,
      interactions: 0,
      scrollEvents: 0,
      pageLoads: 0,
      sessionCoherence: 1.0,
      repeatVisits: 0,
    };

    // State transition tracking
    this.stateTransitionTime = this.startTime;
    this.driftingStartTime = null;
    this.distractedStartTime = null;
    this.deeplyDistractionStartTime = null;

    // Warning state
    this.warningState = {
      active: false,
      level: null,
      triggeredAt: null,
      soft: {
        shownAt: null,
        expireAt: null,
      },
      strong: {
        shownAt: null,
        expireAt: null,
      },
      dismissalCount: 0,
    };

    // Recovery tracking
    this.recoveryStats = {
      totalRecoveries: 0,
      avgTimeToRecovery: 0,
      recoveryStreak: 0,
      lastRecoveryAt: null,
    };

    // History of all state changes
    this.stateHistory = [
      {
        state: 'focused',
        timestamp: this.startTime,
        durationMs: 0,
        metrics: this.signals,
      },
    ];

    // Last recorded signal reset time (for 5-second windowing)
    this.lastSignalResetTime = this.startTime;
  }

  /**
   * Add a raw signal to the accumulator.
   */
  addSignal(signalType, count = 1) {
    if (!this.signals.hasOwnProperty(signalType)) {
      console.warn(`[DistractionState] Unknown signal type: ${signalType}`);
      return;
    }
    this.signals[signalType] += count;
  }

  /**
   * Set a derived metric.
   */
  setMetric(metricName, value) {
    if (!['sessionCoherence', 'repeatVisits'].includes(metricName)) {
      console.warn(`[DistractionState] Unknown metric: ${metricName}`);
      return;
    }
    this.signals[metricName] = value;
  }

  /**
   * Update session idle time (cumulative).
   */
  addIdleTime(seconds) {
    this.signals.idleTime += seconds;
  }

  /**
   * Get current session duration in seconds.
   */
  getSessionDuration() {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Get elapsed time in current state (seconds).
   */
  getStateElapsedSeconds() {
    return (Date.now() - this.stateTransitionTime) / 1000;
  }

  /**
   * Transition to a new state.
   * Returns: true if state changed, false otherwise.
   */
  transitionState(newState) {
    const now = Date.now();

    if (newState === this.currentState) {
      return false; // no change
    }

    const previousState = this.currentState;
    const durationMs = now - this.stateTransitionTime;

    // Record state transition
    this.stateHistory.push({
      state: newState,
      timestamp: now,
      durationMs,
      metrics: { ...this.signals },
    });

    // Update time tracking for new state
    if (newState === 'drifting' && !this.driftingStartTime) {
      this.driftingStartTime = now;
    } else if (newState !== 'drifting') {
      this.driftingStartTime = null;
    }

    if (newState === 'distracted' && !this.distractedStartTime) {
      this.distractedStartTime = now;
    } else if (newState !== 'distracted') {
      this.distractedStartTime = null;
    }

    if (newState === 'deeply_distracted' && !this.deeplyDistractionStartTime) {
      this.deeplyDistractionStartTime = now;
    } else if (newState !== 'deeply_distracted') {
      this.deeplyDistractionStartTime = null;
    }

    // Handle recovery
    if (
      (previousState === 'distracted' || previousState === 'deeply_distracted') &&
      newState === 'focused'
    ) {
      const timeInDistraction = durationMs / 1000;
      this.recordRecovery(timeInDistraction);
    }

    // Reset recovery streak if entering distracted
    if (
      previousState === 'focused' &&
      (newState === 'distracted' || newState === 'deeply_distracted')
    ) {
      this.recoveryStats.recoveryStreak = 0;
    }

    this.previousState = previousState;
    this.currentState = newState;
    this.stateTransitionTime = now;

    return true;
  }

  /**
   * Get durations of sustained time in key states.
   */
  getDurations() {
    const now = Date.now();
    const driftingDuration = this.driftingStartTime
      ? (now - this.driftingStartTime) / 1000
      : 0;
    const distractedDuration = this.distractedStartTime
      ? (now - this.distractedStartTime) / 1000
      : 0;
    const deeplyDistractionDuration = this.deeplyDistractionStartTime
      ? (now - this.deeplyDistractionStartTime) / 1000
      : 0;

    return {
      session: this.getSessionDuration(),
      stateElapsed: this.getStateElapsedSeconds(),
      drifting: driftingDuration,
      distracted: distractedDuration,
      deeplyDistracted: deeplyDistractionDuration,
    };
  }

  /**
   * Reset accumulated signals (for next 5-second window).
   */
  resetSignals() {
    this.signals = {
      contextSwitches: 0,
      idleTime: 0,
      interactions: 0,
      scrollEvents: 0,
      pageLoads: 0,
      sessionCoherence: 1.0,
      repeatVisits: 0,
    };
    this.lastSignalResetTime = Date.now();
  }

  /**
   * Trigger a warning.
   */
  triggerWarning(level, reason = '') {
    const now = Date.now();

    this.warningState.active = true;
    this.warningState.level = level;
    this.warningState.triggeredAt = now;

    if (level === 'soft') {
      this.warningState.soft.shownAt = now;
      this.warningState.soft.expireAt = now + 5 * 60 * 1000; // 5 min cooldown
    } else if (level === 'strong') {
      this.warningState.strong.shownAt = now;
      this.warningState.strong.expireAt = now + 10 * 60 * 1000; // 10 min cooldown
    }
    // persistent: no expiration

    return {
      sessionId: this.sessionId,
      level,
      timestamp: new Date(now).toISOString(),
      reason,
      currentState: this.currentState,
      metrics: { ...this.signals },
    };
  }

  /**
   * Dismiss an active warning.
   */
  dismissWarning() {
    if (!this.warningState.active) return;

    this.warningState.active = false;
    this.warningState.dismissalCount += 1;

    // Log dismissal event
    return {
      sessionId: this.sessionId,
      dismissedAt: new Date().toISOString(),
      level: this.warningState.level,
      dismissalCount: this.warningState.dismissalCount,
      stateAfterDismissal: this.currentState,
    };
  }

  /**
   * Record a recovery event.
   */
  recordRecovery(timeInDistraction) {
    this.recoveryStats.totalRecoveries += 1;
    this.recoveryStats.avgTimeToRecovery = (
      (this.recoveryStats.avgTimeToRecovery * (this.recoveryStats.totalRecoveries - 1) +
        timeInDistraction) /
      this.recoveryStats.totalRecoveries
    );
    this.recoveryStats.recoveryStreak += 1;
    this.recoveryStats.lastRecoveryAt = new Date().toISOString();

    return {
      sessionId: this.sessionId,
      recoveredAt: new Date().toISOString(),
      timeInDistraction,
      totalRecoveries: this.recoveryStats.totalRecoveries,
      streak: this.recoveryStats.recoveryStreak,
    };
  }

  /**
   * Check if warning can be triggered (not in cooldown).
   */
  canTriggerWarning(level) {
    const now = Date.now();

    if (level === 'soft') {
      return !this.warningState.soft.expireAt || now >= this.warningState.soft.expireAt;
    } else if (level === 'strong') {
      return !this.warningState.strong.expireAt || now >= this.warningState.strong.expireAt;
    }
    // persistent: always can trigger
    return true;
  }

  /**
   * Get summary of current state (for dashboard/storage).
   */
  getSummary() {
    const durations = this.getDurations();
    return {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      currentState: this.currentState,
      score: 0, // Will be computed by engine
      confidence: 0, // Will be computed by engine
      signals: { ...this.signals },
      durations,
      warningState: { ...this.warningState },
      recoveryStats: { ...this.recoveryStats },
      stateHistoryLength: this.stateHistory.length,
    };
  }

  /**
   * Get full state history (for debugging/analysis).
   */
  getFullHistory() {
    return this.stateHistory;
  }

  /**
   * End session and return final summary.
   */
  endSession() {
    const now = Date.now();
    const durationSeconds = (now - this.startTime) / 1000;

    return {
      sessionId: this.sessionId,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date(now).toISOString(),
      durationSeconds,
      finalState: this.currentState,
      stateHistory: this.stateHistory,
      recoveryStats: this.recoveryStats,
      totalWarnings: this.warningState.dismissalCount,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON MANAGER: Manage session state across extension + dashboard
// ────────────────────────────────────────────────────────────────────────────

class SessionStateManager {
  constructor() {
    this.activeSessions = new Map(); // sessionId → DistractionStateTracker
  }

  /**
   * Start a new focus session.
   */
  startSession(sessionId) {
    const tracker = new DistractionStateTracker(sessionId);
    this.activeSessions.set(sessionId, tracker);
    return tracker;
  }

  /**
   * Get active session tracker.
   */
  getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  /**
   * End a session and clean up.
   */
  endSession(sessionId) {
    const tracker = this.activeSessions.get(sessionId);
    if (!tracker) return null;

    const summary = tracker.endSession();
    this.activeSessions.delete(sessionId);
    return summary;
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get current active session (if only one).
   */
  getCurrentSession() {
    const sessions = Array.from(this.activeSessions.values());
    return sessions.length === 1 ? sessions[0] : null;
  }
}

export const sessionStateManager = new SessionStateManager();

export default {
  DistractionStateTracker,
  sessionStateManager,
};
