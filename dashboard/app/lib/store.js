'use client';

/**
 * store.js — Zustand Global State (v2)
 *
 * KEY BEHAVIORS:
 * - `demoActive`: persisted in IndexedDB settings — survives page refreshes
 * - `hasRealData`: true when extension has logged at least one real session
 * - clearDemo(): deletes ONLY source:'demo' entries, preserves real data
 * - Auto-refresh: polls IndexedDB every 30s when extension is expected to be active
 */

import { create } from 'zustand';
import {
  getTodayLogs, getLast7DaysLogs, getLast30DaysLogs, getLogCount,
  clearDemoData, hasRealData as checkRealData,
  getSetting, setSetting,
  addLog, addSession,
  addFocusState, getFocusTimeline, getRecentLogs,
  addDistractionEvent, getDistractionEvents, getRecentDistractionEvents,
} from './db';
import { processLogs } from './engine';
import { generateReport } from './insights';
import { seedMockData } from './mockData';
import { computeFocusState, focusConsistencyScore, detectPatterns } from './behaviorEngine';
import { calculateAdaptiveThresholds, BASE_THRESHOLDS } from './focusBehaviorEngine';
import { sessionStateManager, DistractionStateTracker } from './distractionState';
import {
  loadFocusSettings, saveFocusSettings,
  startFocusSession, endFocusSession,
  addBlockedSite, removeBlockedSite,
  setUserLabel, removeUserLabel,
  getRecentSessions, getEventStats,
  getElapsedSeconds,
} from './focusMode';
import {
  updateDistractionState,
  summarizeSession,
  updateAdaptiveThresholdsFromHistory,
} from './distraction-integration';

let autoRefreshTimer = null;

const useFocusStore = create((set, get) => ({
  // ── Analytics ──────────────────────────────────────────────────────────────
  range:      'today',
  data:       null,
  report:     null,
  isLoading:  true,
  /** true when demo data is present in the DB (persisted across reloads) */
  demoActive: false,
  /** true when at least one real extension-tracked log exists */
  hasRealData: false,

  // ── Focus Mode ─────────────────────────────────────────────────────────────
  focusSettings: {
    focusEnabled:    false,
    blockedSites:    [],
    sensitivity:     'medium',
    sessionDuration: 25,
    allowContinue:   true,
    sessionStart:    null,
  },
  sessionElapsed: 0,
  sessionHistory: [],
  eventStats:     { warnings: 0, continues: 0, blocks: 0, total: 0 },

  // ── UI ─────────────────────────────────────────────────────────────────────
  darkMode:  true,
  activeTab: 'dashboard',

  // ── Focus Intelligence Engine ──────────────────────────────────────────────
  /** Current real-time focus state: { state, score, confidence, reasons, timestamp } */
  currentFocusState: null,
  /** Array of focus_states for the selected time range */
  focusTimeline: [],
  /** { score, longestStreak, avgFocusBlock, driftCount } */
  consistencyData: { score: 0, longestStreak: 0, avgFocusBlock: 0, driftCount: 0 },
  /** Behavioral patterns detected from focus states */
  behaviorPatterns: [],

  // ── Distraction Detection Engine ────────────────────────────────────────────
  /** Current distraction session state tracker */
  currentDistractionSession: null,
  /** Active warning state: { active, level, message, cooldownExpires, dismissalCount } */
  warningState: {
    active: false,
    level: null,
    message: '',
    cooldownExpires: null,
    dismissalCount: 0,
  },
  /** Timeline of distraction events for selected range */
  distractionTimeline: [],
  /** Recovery statistics: { totalRecoveries, avgTimeToRecovery, recoveryStreak } */
  recoveryStats: {
    totalRecoveries: 0,
    avgTimeToRecovery: 0,
    recoveryStreak: 0,
    longestRecoveryStreak: 0,
  },
  /** Behavioral patterns from distraction analysis */
  distractionPatterns: {
    peakDistractionTime: null,
    commonDistractions: [],
    typicalFocusBlockDuration: 0,
    contextSwitchPattern: 'medium', // 'low', 'medium', 'high'
  },
  /** Adaptive thresholds personalized to user behavior */
  adaptiveThresholds: { ...BASE_THRESHOLDS },
  /** Distraction detection settings */
  distractionDetectionSettings: {
    enabled: true, // only warn during focus mode
    warningMode: 'progressive', // 'progressive', 'aggressive', 'gentle'
    enableAdaptiveThreshold: true,
    showReasons: true,
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Init
  // ════════════════════════════════════════════════════════════════════════════

  init: async () => {
    set({ isLoading: true });

    try {
      // 1. Check seeding state (persisted across reloads)
      const demoSeeded = await getSetting('demoDataSeeded', false);
      const count      = await getLogCount();

      if (count === 0 && !demoSeeded) {
        // Fresh install — seed demo data
        await seedMockData();
        await setSetting('demoDataSeeded', true);
        set({ demoActive: true, hasRealData: false });
      } else if (demoSeeded) {
        // Previously seeded — check if extension has added real data
        const realData = await checkRealData();
        set({ demoActive: true, hasRealData: realData });
      } else {
        // Never seeded (or was cleared) — only real data
        set({ demoActive: false, hasRealData: count > 0 });
      }

      // 2. Load everything in parallel
      await Promise.all([
        get().loadData(),
        get().loadFocusState(),
      ]);

      // 3. Start auto-refresh (polls every 30s so new extension data shows up)
      get()._startAutoRefresh();

      // 4. Listen for data forwarded by the extension's bridge.js content script
      get()._startBridgeListener();

    } catch (err) {
      console.error('[Store] init error:', err);
      set({ isLoading: false });
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Data loading
  // ════════════════════════════════════════════════════════════════════════════

  loadData: async () => {
    set({ isLoading: true });
    try {
      const range = get().range;
      const logs  =
        range === 'today' ? await getTodayLogs()      :
        range === '7d'    ? await getLast7DaysLogs()   :
                            await getLast30DaysLogs();

      const data   = processLogs(logs);

      // Load focus timeline for this range
      const now = new Date();
      const rangeStart = new Date();
      if (range === 'today') rangeStart.setHours(0, 0, 0, 0);
      else if (range === '7d') { rangeStart.setDate(rangeStart.getDate() - 7); rangeStart.setHours(0, 0, 0, 0); }
      else { rangeStart.setDate(rangeStart.getDate() - 30); rangeStart.setHours(0, 0, 0, 0); }

      let focusTimeline = [];
      let consistencyData = { score: 0, longestStreak: 0, avgFocusBlock: 0, driftCount: 0 };
      let behaviorPatterns = [];
      try {
        focusTimeline = await getFocusTimeline(rangeStart, now);
        consistencyData = focusConsistencyScore(focusTimeline);
        behaviorPatterns = detectPatterns(focusTimeline);
      } catch (e) {
        console.warn('[Store] Focus timeline load failed (expected on first run):', e.message);
      }

      const report = generateReport(data, behaviorPatterns);
      set({ data, report, isLoading: false, focusTimeline, consistencyData, behaviorPatterns });

      // Re-check if real data arrived since last load
      if (get().demoActive) {
        const realData = await checkRealData();
        set({ hasRealData: realData });
      }
    } catch (err) {
      console.error('[Store] loadData error:', err);
      set({ isLoading: false });
    }
  },

  setRange: async (range) => {
    set({ range });
    await get().loadData();
  },

  refresh: async () => { await get().loadData(); },

  // ════════════════════════════════════════════════════════════════════════════
  // Demo data management
  // ════════════════════════════════════════════════════════════════════════════

  clearDemo: async () => {
    set({ isLoading: true });
    try {
      await clearDemoData();
      await setSetting('demoDataSeeded', false);
      const count = await getLogCount();
      set({ demoActive: false, hasRealData: count > 0 });
      await get().loadData();
    } catch (err) {
      console.error('[Store] clearDemo error:', err);
      set({ isLoading: false });
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Focus Mode
  // ════════════════════════════════════════════════════════════════════════════

  loadFocusState: async () => {
    const [settings, history, stats] = await Promise.all([
      loadFocusSettings(),
      getRecentSessions(20),
      getEventStats(),
    ]);
    set({ focusSettings: settings, sessionHistory: history, eventStats: stats });

    if (settings.focusEnabled && settings.sessionStart) {
      get()._startTimer(settings.sessionStart);
    }
  },

  updateFocusSettings: async (partial) => {
    await saveFocusSettings(partial);
    const updated = await loadFocusSettings();
    set({ focusSettings: updated });
  },

  startSession: async (overrides = {}) => {
    const current = get().focusSettings;
    const merged  = { ...current, ...overrides };
    const startTime = await startFocusSession(merged);
    const updated   = await loadFocusSettings();
    set({ focusSettings: updated });
    get()._startTimer(startTime);
  },

  endSession: async () => {
    get()._stopTimer();
    await endFocusSession();
    const [updated, stats, history] = await Promise.all([
      loadFocusSettings(),
      getEventStats(),
      getRecentSessions(20),
    ]);
    set({ focusSettings: updated, eventStats: stats, sessionHistory: history, sessionElapsed: 0 });
  },

  addBlocked: async (domain) => {
    await addBlockedSite(domain);
    const updated = await loadFocusSettings();
    set({ focusSettings: updated });
  },

  removeBlocked: async (domain) => {
    await removeBlockedSite(domain);
    const updated = await loadFocusSettings();
    set({ focusSettings: updated });
  },

  labelSite: async (site, label) => {
    await setUserLabel(site, label);
    const history = await getRecentSessions(20);
    set({ sessionHistory: history });
  },

  removeLabel: async (site) => {
    await removeUserLabel(site);
    const history = await getRecentSessions(20);
    set({ sessionHistory: history });
  },

  refreshHistory: async () => {
    const [history, stats] = await Promise.all([
      getRecentSessions(20),
      getEventStats(),
    ]);
    set({ sessionHistory: history, eventStats: stats });
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Distraction Detection Engine
  // ════════════════════════════════════════════════════════════════════════════

  startDistractionSession: (sessionId) => {
    const tracker = sessionStateManager.startSession(sessionId);
    set({ currentDistractionSession: tracker });
    return tracker;
  },

  updateDistractionState: async (signal) => {
    const tracker = get().currentDistractionSession;
    if (!tracker) return;

    // Update distraction tracker with signal
    if (signal.type === 'tab_switch') tracker.addSignal('contextSwitches');
    else if (signal.type === 'idle') tracker.addIdleTime(signal.duration || 0);
    else if (signal.type === 'interaction') tracker.addSignal('interactions', signal.count || 1);
    else if (signal.type === 'scroll') tracker.addSignal('scrollEvents', signal.count || 1);
    else if (signal.type === 'page_load') tracker.addSignal('pageLoads');
    else if (signal.type === 'coherence') tracker.setMetric('sessionCoherence', signal.value);
    else if (signal.type === 'repeat_visit') tracker.setMetric('repeatVisits', signal.count);

    // Store summary periodically
    const summary = tracker.getSummary();
    set({ currentDistractionSession: tracker });
    return summary;
  },

  transitionDistractionState: async (newState) => {
    const tracker = get().currentDistractionSession;
    if (!tracker) return;

    const changed = tracker.transitionState(newState);
    if (changed) {
      // Log distraction event
      await addDistractionEvent({
        sessionId: tracker.sessionId,
        eventType: `${newState}_detected`,
        state: newState,
        signals: tracker.signals,
      });

      set({ currentDistractionSession: tracker });
    }

    return changed;
  },

  triggerDistractionWarning: async (level, reason = '') => {
    const tracker = get().currentDistractionSession;
    if (!tracker) return;

    if (!tracker.canTriggerWarning(level)) {
      return null; // cooldown active
    }

    const warningEvent = tracker.triggerWarning(level, reason);

    // Log to DB
    await addDistractionEvent({
      ...warningEvent,
      eventType: 'warning_shown',
    });

    // Show warning message
    const messages = {
      soft: '💡 You\'re drifting away from focus',
      strong: '⚠️ You\'re getting distracted. Return to your task',
      persistent: '🚨 Extended distraction. Consider taking a break',
    };

    set({
      currentDistractionSession: tracker,
      warningState: {
        active: true,
        level,
        message: messages[level],
        cooldownExpires: tracker.warningState[level]?.expireAt,
        dismissalCount: tracker.warningState.dismissalCount,
      },
    });

    return warningEvent;
  },

  dismissDistractionWarning: async () => {
    const tracker = get().currentDistractionSession;
    if (!tracker || !get().warningState.active) return;

    const dismissalEvent = tracker.dismissWarning();

    // Log dismissal
    await addDistractionEvent({
      sessionId: tracker.sessionId,
      eventType: 'warning_dismissed',
      warningLevel: get().warningState.level,
      dismissalCount: tracker.warningState.dismissalCount,
      stateAfterDismissal: tracker.currentState,
    });

    set({
      currentDistractionSession: tracker,
      warningState: {
        ...get().warningState,
        active: false,
      },
    });

    return dismissalEvent;
  },

  endDistractionSession: async () => {
    const tracker = get().currentDistractionSession;
    if (!tracker) return;

    const summary = tracker.endSession();

    // Log session end
    await addDistractionEvent({
      sessionId: summary.sessionId,
      eventType: 'session_ended',
      finalState: summary.finalState,
      durationSeconds: summary.durationSeconds,
      recoveryStats: summary.recoveryStats,
    });

    // Clean up
    sessionStateManager.endSession(tracker.sessionId);
    set({
      currentDistractionSession: null,
      warningState: {
        active: false,
        level: null,
        message: '',
        cooldownExpires: null,
        dismissalCount: 0,
      },
    });

    return summary;
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Distraction Detection Loop (Real-Time)
  // ════════════════════════════════════════════════════════════════════════════

  _distractionLoopTimer: null,

  startDistractionDetectionLoop: () => {
    // Clear any existing loop
    const existing = get()._distractionLoopTimer;
    if (existing) clearInterval(existing);

    // Run detection loop every 5 seconds
    const timer = setInterval(async () => {
      const tracker = get().currentDistractionSession;
      const thresholds = get().adaptiveThresholds;

      if (!tracker) {
        clearInterval(timer);
        return;
      }

      // Update distraction state
      const result = updateDistractionState(tracker, thresholds, (warningInfo) => {
        // Handle warning triggered
        get().showDistractionWarning(
          warningInfo.level,
          warningInfo.reasons,
          warningInfo.message
        );

        // Log warning event
        addDistractionEvent({
          sessionId: tracker.sessionId,
          eventType: 'warning_shown',
          warningLevel: warningInfo.level,
          reasons: warningInfo.reasons,
        });
      });

      // Update UI
      if (result) {
        set({ currentDistractionSession: tracker });
      }
    }, 5000);

    set({ _distractionLoopTimer: timer });
  },

  stopDistractionDetectionLoop: () => {
    const timer = get()._distractionLoopTimer;
    if (timer) {
      clearInterval(timer);
      set({ _distractionLoopTimer: null });
    }
  },

  showDistractionWarning: (level, reasons, message) => {
    set(s => ({
      warningState: {
        active: true,
        level,
        message,
        cooldownExpires: null,
        dismissalCount: s.warningState.dismissalCount,
      },
    }));
  },

  loadDistractionData: async () => {
    try {
      const now = new Date();
      const rangeStart = new Date();
      const range = get().range;

      if (range === 'today') rangeStart.setHours(0, 0, 0, 0);
      else if (range === '7d') {
        rangeStart.setDate(rangeStart.getDate() - 7);
        rangeStart.setHours(0, 0, 0, 0);
      } else {
        rangeStart.setDate(rangeStart.getDate() - 30);
        rangeStart.setHours(0, 0, 0, 0);
      }

      // Load distraction events
      const events = await getDistractionEvents(rangeStart, now);
      
      // Compute statistics from events
      const totalRecoveries = events.filter(e => e.eventType === 'recovered').length;
      const avgRecoveryTime = events
        .filter(e => e.eventType === 'recovered' && e.timeToRecovery)
        .reduce((sum, e) => sum + e.timeToRecovery, 0) / Math.max(totalRecoveries, 1);

      // Analyze distraction patterns
      const distractionHours = events
        .filter(e => e.eventType.includes('distracted'))
        .map(e => new Date(e.timestamp).getHours());
      const peakHour = distractionHours.length > 0
        ? distractionHours.reduce((a, b, i, arr) =>
            arr.filter(x => x === a).length > arr.filter(x => x === b).length ? a : b
          )
        : null;

      set({
        distractionTimeline: events,
        recoveryStats: {
          totalRecoveries,
          avgTimeToRecovery: avgRecoveryTime || 0,
          recoveryStreak: 0, // recompute from session
          longestRecoveryStreak: 0,
        },
        distractionPatterns: {
          ...get().distractionPatterns,
          peakDistractionTime: peakHour ? `${peakHour}:00 - ${peakHour + 1}:00` : null,
        },
      });
    } catch (err) {
      console.warn('[Store] loadDistractionData error:', err);
    }
  },

  updateAdaptiveThresholds: async () => {
    try {
      // Get session statistics from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentEvents = await getRecentDistractionEvents(100);

      // Compute historical stats
      const historicalStats = {
        sessions: recentEvents
          .filter(e => e.eventType === 'session_ended')
          .map(e => ({
            contextSwitchFrequency: e.contextSwitchFrequency || 2.0,
            avgFocusBlock: e.avgFocusBlock || 300,
            totalIdleTime: e.totalIdleTime || 0,
          })),
      };

      // Calculate adaptive thresholds
      const adaptiveThresholds = calculateAdaptiveThresholds(historicalStats);
      set({ adaptiveThresholds });

      return adaptiveThresholds;
    } catch (err) {
      console.warn('[Store] updateAdaptiveThresholds error:', err);
      return BASE_THRESHOLDS;
    }
  },

  setDistractionDetectionSettings: (partial) => {
    set(s => ({
      distractionDetectionSettings: {
        ...s.distractionDetectionSettings,
        ...partial,
      },
    }));
  },

  // ── Internal timers ────────────────────────────────────────────────────────

  _timerRef: null,

  _startTimer: (startTime) => {
    get()._stopTimer();
    const tick = () => set({ sessionElapsed: getElapsedSeconds(startTime) });
    tick();
    const ref = setInterval(tick, 1000);
    set({ _timerRef: ref });
  },

  _stopTimer: () => {
    const ref = get()._timerRef;
    if (ref) { clearInterval(ref); set({ _timerRef: null }); }
  },

  _startAutoRefresh: () => {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(async () => {
      // Silently reload data in background — no loading spinner
      const range = get().range;
      try {
        const logs =
          range === 'today' ? await getTodayLogs()     :
          range === '7d'    ? await getLast7DaysLogs()  :
                              await getLast30DaysLogs();
        const data   = processLogs(logs);
        const report = generateReport(data);
        set({ data, report });

        if (get().demoActive) {
          const realData = await checkRealData();
          // Auto-clear demo the moment the first real extension data arrives
          if (realData && !get().hasRealData) {
            await get().clearDemo();
          } else if (realData !== get().hasRealData) {
            set({ hasRealData: realData });
          }
        }
      } catch {}
    }, 30000); // every 30 seconds
  },

  _startBridgeListener: () => {
    if (typeof window === 'undefined') return;
    window.addEventListener('message', async (event) => {
      if (event.source !== window) return;
      const msg = event.data;
      if (!msg || msg.source !== 'focus_tracker_bridge') return;

      try {
        if (msg.type === 'SESSIONS' && Array.isArray(msg.payload)) {
          for (const session of msg.payload) {
            await addSession(session);
          }
          console.log('[Store] Bridge: received', msg.payload.length, 'session(s) from extension');
        }

        if (msg.type === 'LOGS' && Array.isArray(msg.payload)) {
          for (const log of msg.payload) {
            await addLog(log);
          }
          console.log('[Store] Bridge: received', msg.payload.length, 'log(s) from extension');
        }

        // ── Focus Intelligence Engine: compute state on new data ──────────
        try {
          const recent = await getRecentLogs(5);
          const focusResult = computeFocusState(recent);
          await addFocusState(focusResult);
          set({ currentFocusState: focusResult });
        } catch (e) {
          console.warn('[Store] Focus state computation failed:', e.message);
        }

        // Reload data + check if demo should be auto-cleared
        await get().loadData();
        await get().loadFocusState();
      } catch (err) {
        console.error('[Store] Bridge listener error:', err);
      }
    });
  },

  // ── UI ────────────────────────────────────────────────────────────────────
  setActiveTab:   (activeTab) => set({ activeTab }),
  toggleDarkMode: ()          => set(s => ({ darkMode: !s.darkMode })),
}));

export default useFocusStore;
