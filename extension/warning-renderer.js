/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WARNING POPUP RENDERER — Progressive Warning UI
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Renders three warning levels:
 * 1. SOFT: Toast notification (auto-dismiss, non-intrusive)
 * 2. STRONG: Modal dialog (requires interaction)
 * 3. PERSISTENT: Sticky overlay (for extended distraction)
 *
 * Each warning includes:
 * - Clear messaging
 * - "Stay Focused" CTA
 * - Auto-dismiss with countdown
 * - Sound feedback (optional)
 * - Animation
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WarningRenderer = (() => {
  const WARN_TOAST_ID = 'ft-distraction-toast';
  const WARN_MODAL_ID = 'ft-distraction-modal';
  const WARN_OVERLAY_ID = 'ft-distraction-overlay';
  const WARN_STYLE_ID = 'ft-distraction-styles';

  let activeWarningLevel = null;
  let dismissalCount = 0;
  let lastWarningTime = 0;

  // ── Inject styles ────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(WARN_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = WARN_STYLE_ID;
    style.textContent = `
      /* SOFT WARNING - TOAST */
      #${WARN_TOAST_ID} {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        max-width: 400px;
        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
        border: 2px solid #fbbf24;
        border-radius: 12px;
        padding: 16px 20px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: slideInRight 0.3s ease-out;
      }

      #${WARN_TOAST_ID} .toast-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }

      #${WARN_TOAST_ID} .toast-icon {
        font-size: 24px;
      }

      #${WARN_TOAST_ID} .toast-title {
        font-weight: 600;
        color: #f3f4f6;
        font-size: 14px;
      }

      #${WARN_TOAST_ID} .toast-body {
        color: #d1d5db;
        font-size: 13px;
        line-height: 1.4;
      }

      #${WARN_TOAST_ID} .toast-close {
        position: absolute;
        top: 8px;
        right: 8px;
        background: transparent;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        font-size: 18px;
        padding: 4px;
      }

      #${WARN_TOAST_ID} .toast-close:hover {
        color: #f3f4f6;
      }

      #${WARN_TOAST_ID} .toast-dismiss {
        display: inline-block;
        font-size: 12px;
        color: #6b7280;
        margin-top: 8px;
      }

      /* STRONG WARNING - MODAL */
      #${WARN_MODAL_ID} {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(5px);
        animation: fadeIn 0.2s ease-out;
      }

      #${WARN_MODAL_ID} .modal-content {
        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
        border: 2px solid #ef4444;
        border-radius: 16px;
        padding: 32px;
        max-width: 420px;
        width: 90%;
        box-shadow: 0 20px 50px rgba(0,0,0,0.7);
        text-align: center;
        animation: slideUp 0.3s ease-out;
      }

      #${WARN_MODAL_ID} .modal-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }

      #${WARN_MODAL_ID} .modal-title {
        font-size: 20px;
        font-weight: 700;
        color: #fef2f2;
        margin-bottom: 8px;
      }

      #${WARN_MODAL_ID} .modal-message {
        font-size: 14px;
        color: #d1d5db;
        margin-bottom: 20px;
        line-height: 1.5;
      }

      #${WARN_MODAL_ID} .modal-buttons {
        display: flex;
        gap: 12px;
      }

      #${WARN_MODAL_ID} .btn {
        flex: 1;
        padding: 12px 16px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      }

      #${WARN_MODAL_ID} .btn-primary {
        background: #3b82f6;
        color: white;
      }

      #${WARN_MODAL_ID} .btn-primary:hover {
        background: #2563eb;
      }

      #${WARN_MODAL_ID} .btn-secondary {
        background: #374151;
        color: #e5e7eb;
      }

      #${WARN_MODAL_ID} .btn-secondary:hover {
        background: #4b5563;
      }

      /* PERSISTENT OVERLAY */
      #${WARN_OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        animation: fadeIn 0.3s ease-out;
      }

      #${WARN_OVERLAY_ID} .overlay-content {
        background: linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%);
        border: 3px solid #dc2626;
        border-radius: 20px;
        padding: 40px;
        max-width: 480px;
        width: 90%;
        box-shadow: 0 25px 60px rgba(0,0,0,0.8);
        animation: slideUp 0.4s ease-out;
      }

      #${WARN_OVERLAY_ID} .overlay-icon {
        font-size: 60px;
        margin-bottom: 20px;
        animation: pulse 1s infinite;
      }

      #${WARN_OVERLAY_ID} .overlay-title {
        font-size: 24px;
        font-weight: 800;
        color: #fecaca;
        margin-bottom: 12px;
      }

      #${WARN_OVERLAY_ID} .overlay-message {
        font-size: 15px;
        color: #fca5a5;
        margin-bottom: 24px;
        line-height: 1.6;
      }

      #${WARN_OVERLAY_ID} .overlay-buttons {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      #${WARN_OVERLAY_ID} .btn {
        padding: 14px 20px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        font-size: 15px;
        transition: all 0.2s;
      }

      #${WARN_OVERLAY_ID} .btn-primary {
        background: #3b82f6;
        color: white;
      }

      #${WARN_OVERLAY_ID} .btn-primary:hover {
        background: #2563eb;
      }

      #${WARN_OVERLAY_ID} .btn-secondary {
        background: #dc2626;
        color: white;
      }

      #${WARN_OVERLAY_ID} .btn-secondary:hover {
        background: #b91c1c;
      }

      /* ANIMATIONS */
      @keyframes slideInRight {
        from {
          transform: translateX(420px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes slideUp {
        from {
          transform: translateY(40px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.1);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Audio feedback ───────────────────────────────────────────────────────
  function playWarningSound(level = 'soft') {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      if (level === 'soft') {
        // Soft chime: two pleasant tones
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc1.frequency.value = 528;
        osc2.frequency.value = 639;
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc1.start();
        osc2.start();
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        
        osc1.stop(audioCtx.currentTime + 0.3);
        osc2.stop(audioCtx.currentTime + 0.3);
      } else if (level === 'strong' || level === 'persistent') {
        // Strong alert: warning beep pattern
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.frequency.value = 880;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        
        osc.stop(audioCtx.currentTime + 0.2);
      }
    } catch (err) {
      console.log('[WarningRenderer] Audio context not available');
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // SOFT WARNING (Toast)
  // ────────────────────────────────────────────────────────────────────────
  function showSoftWarning(site) {
    clearWarnings();
    injectStyles();

    const container = document.createElement('div');
    container.id = WARN_TOAST_ID;

    container.innerHTML = `
      <div class="toast-header">
        <div class="toast-icon">💡</div>
        <div class="toast-title">You're drifting from focus</div>
        <button class="toast-close" aria-label="Close">✕</button>
      </div>
      <div class="toast-body">
        You opened <strong>${escapeHtml(site)}</strong> during your focus session.
      </div>
      <div class="toast-dismiss">Auto-closes in 10 seconds</div>
    `;

    document.body.appendChild(container);
    activeWarningLevel = 'soft';
    dismissalCount = 0;
    lastWarningTime = Date.now();

    playWarningSound('soft');

    // Auto-dismiss after 10 seconds
    const dismissTimer = setTimeout(() => {
      clearWarnings();
    }, 10000);

    // Manual close button
    const closeBtn = container.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      clearTimeout(dismissTimer);
      clearWarnings();
    });

    // Dismiss on click (with tracking)
    container.addEventListener('click', () => {
      dismissalCount++;
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // STRONG WARNING (Modal)
  // ────────────────────────────────────────────────────────────────────────
  function showStrongWarning(site) {
    clearWarnings();
    injectStyles();

    const container = document.createElement('div');
    container.id = WARN_MODAL_ID;

    container.innerHTML = `
      <div class="modal-content">
        <div class="modal-icon">⚠️</div>
        <div class="modal-title">You're Getting Distracted</div>
        <div class="modal-message">
          You've spent time on <strong>${escapeHtml(site)}</strong> while focus mode is active.
          This is marked as a distraction site.
        </div>
        <div class="modal-buttons">
          <button class="btn btn-primary" id="stay-focused-btn">
            ⚡ Stay Focused
          </button>
          <button class="btn btn-secondary" id="dismiss-warning-btn">
            Dismiss
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    activeWarningLevel = 'strong';
    dismissalCount = 0;
    lastWarningTime = Date.now();

    playWarningSound('strong');

    const stayFocusedBtn = document.getElementById('stay-focused-btn');
    const dismissBtn = document.getElementById('dismiss-warning-btn');

    stayFocusedBtn.addEventListener('click', () => {
      // User clicked "Stay Focused" — can auto-redirect back
      chrome.runtime?.sendMessage?.({
        type: 'DISTRACTION_WARNING_ACTION',
        action: 'stay_focused',
        site,
      }).catch(() => {});
      clearWarnings();
    });

    dismissBtn.addEventListener('click', () => {
      dismissalCount++;
      chrome.runtime?.sendMessage?.({
        type: 'DISTRACTION_WARNING_ACTION',
        action: 'dismissed',
        site,
      }).catch(() => {});
      clearWarnings();
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // PERSISTENT WARNING (Overlay)
  // ────────────────────────────────────────────────────────────────────────
  function showPersistentWarning(site) {
    clearWarnings();
    injectStyles();

    const container = document.createElement('div');
    container.id = WARN_OVERLAY_ID;

    container.innerHTML = `
      <div class="overlay-content">
        <div class="overlay-icon">🚨</div>
        <div class="overlay-title">Extended Distraction Alert</div>
        <div class="overlay-message">
          You've been on <strong>${escapeHtml(site)}</strong> for over 5 minutes during focus mode.
          Your focus is at risk. Time to refocus or take a proper break.
        </div>
        <div class="overlay-buttons">
          <button class="btn btn-primary" id="reset-focus-btn">
            🔄 Reset & Go Back to Work
          </button>
          <button class="btn btn-secondary" id="end-session-btn">
            Take a Break Instead
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    activeWarningLevel = 'persistent';
    dismissalCount = 0;
    lastWarningTime = Date.now();

    playWarningSound('persistent');

    const resetBtn = document.getElementById('reset-focus-btn');
    const endBtn = document.getElementById('end-session-btn');

    resetBtn.addEventListener('click', () => {
      chrome.runtime?.sendMessage?.({
        type: 'DISTRACTION_WARNING_ACTION',
        action: 'reset_focus',
        site,
      }).catch(() => {});
      clearWarnings();
    });

    endBtn.addEventListener('click', () => {
      chrome.runtime?.sendMessage?.({
        type: 'DISTRACTION_WARNING_ACTION',
        action: 'end_session',
        site,
      }).catch(() => {});
      clearWarnings();
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ────────────────────────────────────────────────────────────────────────
  function clearWarnings() {
    [WARN_TOAST_ID, WARN_MODAL_ID, WARN_OVERLAY_ID].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    activeWarningLevel = null;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────────
  return {
    showSoftWarning,
    showStrongWarning,
    showPersistentWarning,
    clearWarnings,
    getActiveLevel: () => activeWarningLevel,
    getDismissalCount: () => dismissalCount,
  };
})();

window.WarningRenderer = WarningRenderer;
