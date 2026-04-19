/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DISTRACTION WARNING SYSTEM — Smart Real-Time Detection & Validation
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * EVENT FLOW:
 *
 *   User navigates to YouTube
 *        ↓
 *   content.js detects URL change
 *        ↓
 *   Is it a distracting site? (via embedded DISTRACTING set)
 *        ↓ YES
 *   Start 5-10 second observation window
 *        ↓
 *   Collect metrics during window:
 *   - Did user quickly leave? (false positive)
 *   - What's the page title? (YouTube tutorial vs YouTube Shorts)
 *   - Is focus mode enabled?
 *   - How many times visited in 10 min? (distraction pattern)
 *   - What's the interaction level?
 *        ↓
 *   Validate with heuristics (see validateDistraction)
 *        ↓ PASSES
 *   Check cooldown (haven't warned about this site in 1 min)
 *        ↓ PASSED
 *   Determine warning level:
 *   - First warning: SOFT (toast)
 *   - Second warning (within 5 min): STRONG (modal)
 *        ↓
 *   Trigger popup via background.js
 *        ↓
 *   Log event to focus_events + send to dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Distraction Detection State ───────────────────────────────────────────────
const DISTRACTION_STATE = {
  // Per-site tracking
  siteWarningHistory: new Map(), // site → [{ level, timestamp, dismissed }]
  lastWarningTimePerSite: new Map(), // site → timestamp
  currentSiteEntry: null, // { site, entryTime, urlOnEntry }
  
  // Session-level metrics for validation
  sessionMetrics: {
    tabSwitchesLast10Min: 0,
    interactionsDensity: 0, // interactions per minute
    visitsToCurrentSiteIn10Min: 0,
    sessionDurationSeconds: 0,
  },

  // Cooldown configuration (in milliseconds)
  cooldownMs: {
    soft: 1 * 60 * 1000,   // 1 minute between soft warnings for same site
    strong: 5 * 60 * 1000, // 5 minutes between strong warnings
    global: 30 * 1000,     // 30 seconds between any warnings globally
  },

  // Observation window before triggering warning
  observationWindowMs: 7000, // 7 seconds to observe if user leaves
  observationTimer: null,
};

// ── Productive Content Keywords (for title-based heuristics) ───────────────────
const PRODUCTIVE_KEYWORDS = [
  'tutorial', 'course', 'learn', 'education', 'training', 'conference',
  'lecture', 'workshop', 'documentation', 'guide', 'how-to',
  'documentation', 'dev docs', 'api', 'github', 'gitlab',
  'programming', 'coding', 'javascript', 'python', 'react', 'vue',
];

const DISTRACTION_KEYWORDS = [
  'shorts', 'trending', 'explore', 'discover', 'random', 'feed',
  'meme', 'funny', 'viral', 'watch', 'stream',
];

// ────────────────────────────────────────────────────────────────────────────
// SMART VALIDATION: Decide if warning should actually fire
// ────────────────────────────────────────────────────────────────────────────

/**
 * Comprehensive distraction validation.
 * Returns { shouldWarn: bool, reason: string, warningLevel: 'soft'|'strong' }
 *
 * Do NOT warn if:
 * - User is clearly consuming educational content (title keywords)
 * - Session is too short (less than 5 seconds on site = probably navigating)
 * - Interaction level is high (user is actively using the site, not mindlessly browsing)
 * - User just opened the site and is exploring
 */
async function validateDistraction(site, titleOnEntry) {
  const state = DISTRACTION_STATE;
  const now = Date.now();

  // ─── Check 1: Is this actually productive content? ───────────────────────
  if (titleOnEntry) {
    const titleLower = titleOnEntry.toLowerCase();
    
    // Strong productive indicators (e.g., "React Tutorial")
    if (PRODUCTIVE_KEYWORDS.some(kw => titleLower.includes(kw))) {
      return {
        shouldWarn: false,
        reason: 'productive_title',
        confidence: 'high',
      };
    }

    // Strong distraction indicators (e.g., "YouTube Shorts")
    if (!DISTRACTION_KEYWORDS.some(kw => titleLower.includes(kw))) {
      // No distraction keywords = probably normal browsing
      return {
        shouldWarn: false,
        reason: 'neutral_content',
        confidence: 'medium',
      };
    }
  }

  // ─── Check 2: Session duration ──────────────────────────────────────────
  // If user only stayed 3 seconds, they're probably just navigating through
  const sessionDurationSec = state.sessionMetrics.sessionDurationSeconds || 0;
  if (sessionDurationSec < 3) {
    return {
      shouldWarn: false,
      reason: 'session_too_short',
      confidence: 'high',
    };
  }

  // ─── Check 3: Is focus mode actually enabled? ────────────────────────────
  const focusEnabled = await new Promise((resolve) => {
    chrome.storage?.local?.get(['focusEnabled'], (result) => {
      resolve(result?.focusEnabled === true);
    });
  });

  if (!focusEnabled) {
    return {
      shouldWarn: false,
      reason: 'focus_mode_disabled',
      confidence: 'high',
    };
  }

  // ─── Check 4: Rapid distraction pattern ─────────────────────────────────
  // If user visited this site 5+ times in 10 minutes, they're definitely distracted
  const timesVisitedRecently = state.sessionMetrics.visitsToCurrentSiteIn10Min || 0;
  if (timesVisitedRecently >= 5) {
    return {
      shouldWarn: true,
      reason: 'rapid_revisit_pattern',
      warningLevel: 'strong', // Escalate to strong for pattern behavior
      confidence: 'high',
    };
  }

  // ─── Check 5: Has user warned about this recently? ──────────────────────
  const lastWarningTime = state.lastWarningTimePerSite.get(site) || 0;
  const timeSinceLastWarning = now - lastWarningTime;

  if (timeSinceLastWarning < state.cooldownMs.soft) {
    return {
      shouldWarn: false,
      reason: 'still_in_cooldown',
      confidence: 'high',
    };
  }

  // ─── Check 6: Determine warning level (progressive escalation) ──────────
  const history = state.siteWarningHistory.get(site) || [];
  const recentWarnings = history.filter(w => (now - w.timestamp) < 5 * 60 * 1000); // 5 min window

  let warningLevel = 'soft'; // Default: soft warning
  if (recentWarnings.length > 0) {
    warningLevel = 'strong'; // User already got a soft warning; escalate
  }

  return {
    shouldWarn: true,
    reason: 'distraction_detected',
    warningLevel,
    confidence: 'medium',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// TRIGGER: Handle site entry
// ────────────────────────────────────────────────────────────────────────────

/**
 * Called when user navigates to a distracting site.
 * Starts a 7-second observation window before deciding to warn.
 */
async function onEnterDistractingSite(site, tabTitle) {
  const state = DISTRACTION_STATE;
  const now = Date.now();

  // Clear any previous timer
  if (state.observationTimer) {
    clearTimeout(state.observationTimer);
    state.observationTimer = null;
  }

  // Record entry
  state.currentSiteEntry = {
    site,
    entryTime: now,
    urlOnEntry: window.location.href,
    titleOnEntry: tabTitle || document.title,
  };

  console.log('[DistractionDetector] Entered distracting site:', site, 'Starting observation window...');

  // Start observation timer
  // After 7 seconds, if user is still on site, trigger warning validation
  state.observationTimer = setTimeout(async () => {
    await checkAndTriggerWarning(site, tabTitle);
    state.observationTimer = null;
  }, state.observationWindowMs);
}

/**
 * Called when user leaves the current site.
 * Cancels any pending warning.
 */
function onLeaveSite(newSite) {
  const state = DISTRACTION_STATE;

  if (state.observationTimer) {
    clearTimeout(state.observationTimer);
    state.observationTimer = null;
    console.log('[DistractionDetector] User quickly left site, cancelled pending warning');
  }

  state.currentSiteEntry = null;
}

/**
 * Check if warning should fire, then trigger it.
 */
async function checkAndTriggerWarning(site, tabTitle) {
  const validation = await validateDistraction(site, tabTitle);

  if (!validation.shouldWarn) {
    console.log('[DistractionDetector] Validation failed:', validation.reason);
    return;
  }

  // Validation passed — trigger warning
  const warningLevel = validation.warningLevel || 'soft';
  console.log('[DistractionDetector] Warning triggered:', site, 'Level:', warningLevel);

  // Record this warning
  const now = Date.now();
  const history = DISTRACTION_STATE.siteWarningHistory.get(site) || [];
  history.push({
    level: warningLevel,
    timestamp: now,
    dismissed: false,
  });
  DISTRACTION_STATE.siteWarningHistory.set(site, history);
  DISTRACTION_STATE.lastWarningTimePerSite.set(site, now);

  // Send to background.js to trigger popup
  try {
    chrome.runtime.sendMessage({
      type: 'TRIGGER_DISTRACTION_WARNING',
      site,
      level: warningLevel,
      title: tabTitle || document.title,
      reason: validation.reason,
    }).catch(() => {});
  } catch (err) {
    console.error('[DistractionDetector] Message error:', err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORT for use in content.js
// ────────────────────────────────────────────────────────────────────────────

window.DistractionDetector = {
  onEnterDistractingSite,
  onLeaveSite,
  validateDistraction,
  DISTRACTION_STATE,
};
