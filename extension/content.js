/**
 * content.js — Content Script (v4)
 *
 * THREE PATHS FOR RELIABILITY:
 * 1. On page load: proactively read chrome.storage.local for focus state
 * 2. On message: respond to background for dynamic events (mid-session blocks)
 * 3. SPA navigation: patch history.pushState/replaceState + popstate to
 *    re-run focus check on every client-side URL change (YouTube Shorts, etc.)
 *
 * ─── [ADDED v4] SMART REAL-TIME INTERVENTION LAYER ───────────────────────────
 * Fires an intervention popup + alert sound the INSTANT the user lands on a
 * distracting site — completely independent of Focus Mode.
 *
 * Key design decisions:
 *  • Triggers on page entry, not on a timer — zero perceptible delay.
 *  • Fires ONCE per site visit. Resets only when user navigates away.
 *  • Does NOT interfere with the existing focus-mode block overlay.
 *  • Sound is a programmatically generated tone — no external assets needed.
 *  • Popup auto-dismisses after 12 s if user ignores it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  const TOAST_ID        = 'ft-toast-root';
  const OVERLAY_ID      = 'ft-block-root';
  const STYLE_ID        = 'ft-styles';

  // [ADDED] Intervention overlay IDs
  const INTERVENTION_ID       = 'ft-intervention-root';
  const INTERVENTION_STYLE_ID = 'ft-intervention-styles';

  // Lightweight distracting site list (content scripts can't import categories.js)
  const DISTRACTING = new Set([
    'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
    'instagram.com', 'facebook.com', 'reddit.com', 'tiktok.com',
    'snapchat.com', 'pinterest.com', 'twitch.tv', 'netflix.com',
    'primevideo.com', '9gag.com', 'tumblr.com', 'discord.com',
    'whatsapp.com', 'telegram.org', 'amazon.com', 'flipkart.com',
    'quora.com', 'buzzfeed.com', 'hotstar.com', 'disneyplus.com',
    'hbomax.com', 'hulu.com', 'peacocktv.com', 'espn.com',
    'linkedin.com',
  ]);

  // [ADDED] Human-readable site labels for the popup
  const SITE_LABELS = {
    'youtube.com':    'YouTube',   'youtu.be':       'YouTube',
    'twitter.com':    'Twitter/X', 'x.com':          'Twitter/X',
    'instagram.com':  'Instagram', 'facebook.com':   'Facebook',
    'reddit.com':     'Reddit',    'tiktok.com':     'TikTok',
    'snapchat.com':   'Snapchat',  'pinterest.com':  'Pinterest',
    'twitch.tv':      'Twitch',    'netflix.com':    'Netflix',
    'primevideo.com': 'Prime Video','discord.com':   'Discord',
    'whatsapp.com':   'WhatsApp',  'telegram.org':   'Telegram',
    'amazon.com':     'Amazon',    'flipkart.com':   'Flipkart',
    'linkedin.com':   'LinkedIn',  'espn.com':       'ESPN',
    'hulu.com':       'Hulu',      'disneyplus.com': 'Disney+',
    'hbomax.com':     'HBO Max',   'buzzfeed.com':   'BuzzFeed',
    'hotstar.com':    'Hotstar',   'peacocktv.com':  'Peacock',
    '9gag.com':       '9GAG',      'tumblr.com':     'Tumblr',
    'quora.com':      'Quora',
  };

  const hostname = window.location.hostname.replace(/^www\./, '');

  // ── Interaction Tracking ───────────────────────────────────────────────────
  let interactionThrottle = null;
  let contextInvalidated  = false;

  function reportInteraction() {
    if (interactionThrottle || contextInvalidated) return;
    interactionThrottle = setTimeout(() => {
      try {
        if (!chrome.runtime?.id) { contextInvalidated = true; return; }
        chrome.runtime.sendMessage({ type: 'INTERACTION' }).catch(() => {});
      } catch (err) {
        if (err.message?.includes('Extension context invalidated')) contextInvalidated = true;
      } finally {
        interactionThrottle = null;
      }
    }, 2000);
  }

  document.addEventListener('click',  reportInteraction, { passive: true });
  document.addEventListener('keydown', reportInteraction, { passive: true });
  document.addEventListener('scroll', reportInteraction, { passive: true });

  // ── Styles (unchanged) ──────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #ft-toast-root {
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        animation: ft-slide-in 0.25s cubic-bezier(0.4,0,0.2,1);
      }
      @keyframes ft-slide-in {
        from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      #ft-toast {
        background: #1a1d23; border: 1px solid #30363d;
        border-top: 3px solid #ef4444; border-radius: 10px;
        padding: 14px 20px; display: flex; align-items: center; gap: 16px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5); min-width: 320px; max-width: 480px;
      }
      #ft-toast-msg { flex: 1; font-size: 13px; color: #e6edf3; line-height: 1.4; }
      #ft-toast-msg strong { display: block; font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 2px; }
      #ft-toast-actions { display: flex; gap: 8px; flex-shrink: 0; }
      .ft-btn { padding: 6px 14px; font-size: 12px; font-weight: 600; border-radius: 6px;
        cursor: pointer; border: 1px solid transparent; font-family: inherit; transition: opacity 0.15s; }
      .ft-btn:hover { opacity: 0.8; }
      .ft-btn-continue { background: transparent; border-color: #30363d; color: #8b949e; }
      .ft-btn-end      { background: #ef4444; color: #fff; border-color: #ef4444; }
      #ft-block-root {
        position: fixed; inset: 0; z-index: 2147483647; background: #0d1117;
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }
      #ft-block-card { background: #161b22; border: 1px solid #30363d; border-radius: 12px;
        padding: 40px 48px; text-align: center; max-width: 440px; }
      #ft-block-icon  { font-size: 40px; display: block; margin-bottom: 16px; }
      #ft-block-title { font-size: 22px; font-weight: 700; color: #e6edf3; margin-bottom: 10px; }
      #ft-block-desc  { font-size: 14px; color: #8b949e; line-height: 1.6; margin-bottom: 24px; }
      #ft-block-actions { display: flex; justify-content: center; gap: 10px; }
      #ft-block-back { padding: 10px 24px; background: #3b82f6; color: #fff;
        border: none; border-radius: 6px; font-size: 14px; font-weight: 600;
        cursor: pointer; font-family: inherit; }
      #ft-block-back:hover { opacity: 0.85; }
      #ft-block-cont { padding: 10px 24px; background: transparent; color: #8b949e;
        border: 1px solid #30363d; border-radius: 6px; font-size: 14px;
        font-weight: 600; cursor: pointer; font-family: inherit; }
      #ft-block-cont:hover { opacity: 0.75; }
    `;
    document.head.appendChild(s);
  }

  // ── [ADDED] Intervention popup styles ────────────────────────────────────────
  function injectInterventionStyles() {
    if (document.getElementById(INTERVENTION_STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = INTERVENTION_STYLE_ID;
    s.textContent = `
      #ft-intervention-root {
        position: fixed; inset: 0; z-index: 2147483646;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.72);
        backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        animation: ft-iv-fade 0.18s ease;
      }
      @keyframes ft-iv-fade { from { opacity:0; } to { opacity:1; } }

      #ft-iv-card {
        background: #161b22; border: 1px solid #30363d;
        border-top: 3px solid #f59e0b; border-radius: 14px;
        padding: 36px 44px 32px; text-align: center;
        max-width: 420px; width: calc(100vw - 48px);
        box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
        animation: ft-iv-pop 0.25s cubic-bezier(0.34,1.56,0.64,1);
        position: relative;
      }
      @keyframes ft-iv-pop {
        from { opacity:0; transform: scale(0.88) translateY(10px); }
        to   { opacity:1; transform: scale(1)    translateY(0);    }
      }

      /* Auto-dismiss progress bar */
      #ft-iv-timer-bar {
        position: absolute; bottom:0; left:0; height:3px;
        background: linear-gradient(90deg, #f59e0b, #ef4444);
        border-radius: 0 0 14px 14px;
        animation: ft-iv-shrink 12s linear forwards;
        transform-origin: left;
      }
      @keyframes ft-iv-shrink { from { width:100%; } to { width:0%; } }

      #ft-iv-icon-wrap {
        width:64px; height:64px; border-radius:50%;
        background: rgba(245,158,11,0.12); border: 2px solid rgba(245,158,11,0.35);
        display:flex; align-items:center; justify-content:center;
        margin:0 auto 18px; font-size:28px;
      }
      #ft-iv-badge {
        display:inline-flex; align-items:center; gap:5px;
        background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3);
        color:#f59e0b; font-size:10px; font-weight:700;
        letter-spacing:1px; text-transform:uppercase;
        padding:3px 10px; border-radius:100px; margin-bottom:14px;
      }
      #ft-iv-title { font-size:20px; font-weight:700; color:#f0f6fc; margin:0 0 8px; line-height:1.25; }
      #ft-iv-desc  { font-size:13.5px; color:#8b949e; line-height:1.6; margin:0 0 26px; }
      #ft-iv-desc strong { color:#e6edf3; font-weight:600; }
      #ft-iv-actions { display:flex; flex-direction:column; gap:10px; }
      #ft-iv-go-back {
        padding:11px 24px; background:#3b82f6; color:#fff;
        border:none; border-radius:8px; font-size:14px; font-weight:600;
        cursor:pointer; font-family:inherit; width:100%;
        transition: background 0.15s, transform 0.1s;
      }
      #ft-iv-go-back:hover  { background:#2563eb; transform:translateY(-1px); }
      #ft-iv-go-back:active { transform:translateY(0); }
      #ft-iv-continue {
        padding:11px 24px; background:transparent; color:#6e7681;
        border:1px solid #30363d; border-radius:8px; font-size:13px;
        font-weight:500; cursor:pointer; font-family:inherit; width:100%;
        transition: color 0.15s, border-color 0.15s;
      }
      #ft-iv-continue:hover { color:#8b949e; border-color:#484f58; }
      #ft-iv-dismiss {
        position:absolute; top:14px; right:14px;
        width:28px; height:28px; border-radius:50%;
        border:1px solid #30363d; background:transparent; color:#6e7681;
        font-size:14px; cursor:pointer; font-family:inherit;
        display:flex; align-items:center; justify-content:center;
        transition: background 0.15s, color 0.15s;
      }
      #ft-iv-dismiss:hover { background:#21262d; color:#e6edf3; }
    `;
    document.head.appendChild(s);
  }
  // ── [END ADDED] styles ────────────────────────────────────────────────────────

  // ── State variables for Misuse Detection ─────────────────────────────────
  let currentlyBlocked       = false;
  let lastAllowContinueState = true;

  setInterval(() => {
    if (currentlyBlocked && !document.getElementById(OVERLAY_ID)) {
      console.warn('[FocusTracker] Block overlay removed! Logging bypass attempt.');
      chrome.runtime.sendMessage({
        type: 'BYPASS_ATTEMPT_LOG', site: hostname, reason: 'deleted_overlay',
      }).catch(() => {});
      showBlockOverlay(hostname, lastAllowContinueState);
    }
  }, 2000);

  // ── Toast Warning ──────────────────────────────────────────────────────────
  function showWarningToast(site, allowContinue) {
    if (document.getElementById(TOAST_ID)) return;
    injectStyles();
    const root = document.createElement('div');
    root.id = TOAST_ID;
    root.innerHTML = `
      <div id="ft-toast">
        <div id="ft-toast-msg">
          <strong>You are getting distracted</strong>
          <span>${site} is a distracting site</span>
        </div>
        <div id="ft-toast-actions">
          ${allowContinue !== false
            ? '<button class="ft-btn ft-btn-continue" id="ft-continue">Continue</button>' : ''}
          <button class="ft-btn ft-btn-end" id="ft-end">End Session</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#ft-continue')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CONTINUE', site }).catch(() => {});
      removeToast();
    });
    root.querySelector('#ft-end')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'END_SESSION', site }).catch(() => {});
      removeToast(); removeBlockOverlay();
    });
    setTimeout(removeToast, 20000);
  }
  function removeToast() { document.getElementById(TOAST_ID)?.remove(); }

  // ── Blocking Overlay ───────────────────────────────────────────────────────
  function showBlockOverlay(site, allowContinue) {
    if (document.getElementById(OVERLAY_ID)) return;
    injectStyles();
    const root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.innerHTML = `
      <div id="ft-block-card">
        <span id="ft-block-icon">&#9889;</span>
        <div id="ft-block-title">Focus Mode Active</div>
        <div id="ft-block-desc"><strong>${site}</strong> is blocked during your focus session.</div>
        <div id="ft-block-actions">
          ${allowContinue !== false ? '<button id="ft-block-cont">Continue Anyway</button>' : ''}
          <button id="ft-block-back">Go Back</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#ft-block-back')?.addEventListener('click', () => {
      window.history.length > 1 ? window.history.back() : window.close();
    });
    root.querySelector('#ft-block-cont')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CONTINUE', site }).catch(() => {});
      removeBlockOverlay();
    });
  }
  function removeBlockOverlay() { document.getElementById(OVERLAY_ID)?.remove(); }

  // ─────────────────────────────────────────────────────────────────────────────
  // ── [ADDED] SMART INTERVENTION SYSTEM ────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  let _interventionFired    = false;
  let _interventionCooldown = false;
  let _lastDistractionKey   = '';

  /**
   * playAlertSound — synthesizes a short tri-tone alert via Web Audio API.
   * No external files. Works in any modern browser content script context.
   */
  function playAlertSound() {
    try {
      const ctx    = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.2;
      master.connect(ctx.destination);

      // Descending minor triad: F5 → D5 → Bb4 (attention-grabbing, not harsh)
      [698.5, 587.3, 466.2].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type             = 'sine';
        osc.frequency.value  = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.13);
        gain.gain.linearRampToValueAtTime(0.85, ctx.currentTime + i * 0.13 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.2);
        osc.connect(gain);
        gain.connect(master);
        osc.start(ctx.currentTime + i * 0.13);
        osc.stop(ctx.currentTime + i * 0.13 + 0.22);
      });

      setTimeout(() => ctx.close(), 700);
    } catch (_) {
      // AudioContext blocked or not supported — fail silently
    }
  }

  /**
   * showInterventionPopup — renders the centered ⚠️ intervention overlay.
   * Fires immediately on distracting site entry, independent of Focus Mode.
   */
  function showInterventionPopup(site) {
    if (document.getElementById(INTERVENTION_ID)) return;
    injectInterventionStyles();

    const label = SITE_LABELS[site] || site;
    const root  = document.createElement('div');
    root.id = INTERVENTION_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Distraction detected');

    root.innerHTML = `
      <div id="ft-iv-card">
        <button id="ft-iv-dismiss" aria-label="Dismiss">✕</button>
        <div id="ft-iv-timer-bar"></div>
        <div id="ft-iv-icon-wrap">⚠️</div>
        <div id="ft-iv-badge">⚡ Distraction Detected</div>
        <h2 id="ft-iv-title">You opened ${label}</h2>
        <p id="ft-iv-desc">
          You're on <strong>${label}</strong> during focus time.<br>
          Stay on track — your goals are worth it.
        </p>
        <div id="ft-iv-actions">
          <button id="ft-iv-go-back">← Go Back</button>
          <button id="ft-iv-continue">Continue Anyway</button>
        </div>
      </div>`;

    document.body.appendChild(root);

    root.querySelector('#ft-iv-go-back').addEventListener('click', () => {
      removeInterventionPopup();
      window.history.length > 1 ? window.history.back() : (window.location.href = 'about:blank');
    });
    root.querySelector('#ft-iv-continue').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'INTERVENTION_CONTINUE', site }).catch(() => {});
      removeInterventionPopup();
    });
    root.querySelector('#ft-iv-dismiss').addEventListener('click', removeInterventionPopup);

    // Close on backdrop click
    root.addEventListener('click', (e) => { if (e.target === root) removeInterventionPopup(); });

    // Auto-dismiss at 12 s (matches timer bar CSS animation)
    setTimeout(removeInterventionPopup, 12000);

    chrome.runtime.sendMessage({ type: 'INTERVENTION_SHOWN', site, label, ts: Date.now() }).catch(() => {});
  }

  function removeInterventionPopup() {
    document.getElementById(INTERVENTION_ID)?.remove();
  }

  /**
   * maybeIntervene — gated entry point for the intervention system.
   *
   * Rules:
   *  1. Skip if the focus-mode block overlay is already showing (it's stricter).
   *  2. Skip if we already fired for this "distracting key" (hostname + path prefix).
   *  3. Skip if within the sensitivity-based cooldown window.
   *  4. Otherwise: play sound + show popup immediately.
   */
  function maybeIntervene(currentHostname) {
    if (document.getElementById(OVERLAY_ID)) return; // Focus Mode block takes priority

    const isDistracting = DISTRACTING.has(currentHostname);
    if (!isDistracting) {
      // User navigated away — reset gate so next visit fires fresh
      _interventionFired    = false;
      _interventionCooldown = false;
      _lastDistractionKey   = '';
      return;
    }

    // Key = hostname + first path segment (catches YouTube /watch vs /shorts as different)
    const distractionKey = currentHostname + (window.location.pathname.split('/')[1] || '');
    if (_interventionFired && distractionKey === _lastDistractionKey) return;
    if (_interventionCooldown) return;

    chrome.storage.local.get(['sensitivity'], (data) => {
      if (contextInvalidated) return;

      const sensitivity = data.sensitivity || 'medium';
      let cooldownMs = 3 * 60 * 1000;          // medium: 3 min
      if (sensitivity === 'high') cooldownMs = 60 * 1000;        // 1 min
      if (sensitivity === 'low')  cooldownMs = 10 * 60 * 1000;   // 10 min

      const storageKey = 'ft_iv_last_' + currentHostname;
      const lastShown  = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
      const now        = Date.now();

      if (now - lastShown < cooldownMs) {
        _interventionCooldown = true;
        return;
      }

      // ── Fire ─────────────────────────────────────────────────────────────
      _interventionFired  = true;
      _lastDistractionKey = distractionKey;
      sessionStorage.setItem(storageKey, String(now));

      playAlertSound();          // sound first — zero added latency
      showInterventionPopup(currentHostname);
    });
  }
  // ── [END ADDED] INTERVENTION SYSTEM ──────────────────────────────────────────

  // ── Core focus check ────────────────────────────────────────────────────────
  function runFocusCheck() {
    if (contextInvalidated) return;
    chrome.storage.local.get(
      ['focusEnabled', 'blockedSites', 'allowContinue', 'sensitivity', 'sessionStart', 'sessionDuration'],
      function (data) {
        if (!data.focusEnabled) {
          removeToast();
          removeBlockOverlay();
          // [ADDED] Run intervention even when Focus Mode is off
          maybeIntervene(hostname);
          return;
        }

        if (data.sessionDuration && data.sessionStart) {
          const elapsed = (Date.now() - new Date(data.sessionStart).getTime()) / 60000;
          if (elapsed >= data.sessionDuration) {
            chrome.storage.local.set({ focusEnabled: false, sessionStart: null });
            removeToast(); removeBlockOverlay();
            return;
          }
        }

        const blocked = Array.isArray(data.blockedSites) ? data.blockedSites : [];
        const currentPath = (hostname + window.location.pathname).replace(/\/$/, '').toLowerCase();
        const isBlocked = blocked.some(entry => {
          const e = entry.toLowerCase();
          if (e.includes('/')) return currentPath === e || currentPath.startsWith(e + '/');
          return hostname === e || hostname.endsWith('.' + e);
        });

        if (isBlocked) {
          currentlyBlocked       = true;
          lastAllowContinueState = data.allowContinue;
          if (!document.getElementById(OVERLAY_ID)) {
            chrome.runtime.sendMessage({ type: 'SITE_BLOCKED_LOG', site: hostname }).catch(() => {});
            showBlockOverlay(hostname, data.allowContinue);
          }
          return;
        }

        currentlyBlocked = false;
        removeBlockOverlay();

        const siteSensitivity = data.sensitivity || 'medium';
        const isDistracting   = DISTRACTING.has(hostname);

        if (isDistracting) {
          const now         = Date.now();
          const lastWarning = parseInt(sessionStorage.getItem('ft_last_warning') || '0', 10);
          let cooldownMs = 60000;
          if (siteSensitivity === 'medium') cooldownMs = 300000;
          if (siteSensitivity === 'low')    cooldownMs = 900000;

          if (now - lastWarning >= cooldownMs) {
            if (siteSensitivity === 'low') {
              const firstVisit = parseInt(sessionStorage.getItem('ft_first_visit') || '0', 10);
              if (!firstVisit) { sessionStorage.setItem('ft_first_visit', now.toString()); }
              else if (now - firstVisit >= 300000 && !document.getElementById(TOAST_ID)) {
                sessionStorage.setItem('ft_last_warning', now.toString());
                chrome.runtime.sendMessage({ type: 'WARNING_SHOWN_LOG', site: hostname }).catch(() => {});
                showWarningToast(hostname, data.allowContinue);
              }
            } else if (!document.getElementById(TOAST_ID)) {
              sessionStorage.setItem('ft_last_warning', now.toString());
              chrome.runtime.sendMessage({ type: 'WARNING_SHOWN_LOG', site: hostname }).catch(() => {});
              showWarningToast(hostname, data.allowContinue);
            }
          }

          // [ADDED] Intervention runs alongside focus-mode toast
          maybeIntervene(hostname);
        }
      }
    );
  }

  // ── SPA Navigation Detection ───────────────────────────────────────────────
  let lastUrl = location.href;

  function onUrlChange() {
    const newUrl = location.href;
    if (newUrl === lastUrl) return;
    lastUrl = newUrl;
    setTimeout(runFocusCheck, 300);
  }

  const _pushState = history.pushState.bind(history);
  history.pushState = function (...args) { _pushState(...args); onUrlChange(); };

  const _replaceState = history.replaceState.bind(history);
  history.replaceState = function (...args) { _replaceState(...args); onUrlChange(); };

  window.addEventListener('popstate', onUrlChange);

  let urlCheckTimer = null;
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(() => {
      if (urlCheckTimer) return;
      urlCheckTimer = setTimeout(() => { urlCheckTimer = null; onUrlChange(); }, 500);
    }).observe(titleEl, { childList: true });
  }

  // ── Initial page load ──────────────────────────────────────────────────────
  // document_start runs before <body> exists — wait for it before injecting DOM.
  if (document.body) {
    runFocusCheck();
  } else {
    document.addEventListener('DOMContentLoaded', runFocusCheck, { once: true });
  }

  // ── Message Listener ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'SHOW_WARNING':      showWarningToast(msg.site, msg.allowContinue); break;
      case 'SHOW_BLOCK':        showBlockOverlay(msg.site, msg.allowContinue); break;
      case 'FOCUS_ENDED':       removeToast(); removeBlockOverlay(); break;
      // [ADDED] background can push an intervention explicitly
      case 'SHOW_INTERVENTION': playAlertSound(); showInterventionPopup(msg.site || hostname); break;
    }
  });

  // ── Storage Listener ──────────────────────────────────────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.focusEnabled || changes.blockedSites) setTimeout(runFocusCheck, 100);
  });

})();
