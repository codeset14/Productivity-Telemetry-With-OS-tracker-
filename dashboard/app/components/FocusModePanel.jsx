'use client';

import useFocusStore from '../lib/store';

function fmtTimer(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function fmtDuration(secs) {
  if (!secs) return '0m';
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const SENSITIVITIES = [
  { id: 'low',    label: 'Low',    desc: 'Warn only on extended distraction' },
  { id: 'medium', label: 'Medium', desc: 'Warn on first distracting visit'   },
  { id: 'high',   label: 'High',   desc: 'Immediate warning every time'      },
];

const PRESETS = [
  { label: '25 min', value: 25 },
  { label: '50 min', value: 50 },
  { label: '90 min', value: 90 },
  { label: '∞',      value: 0  },
];

export default function FocusModePanel() {
  const {
    focusSettings, sessionElapsed, eventStats,
    startSession, endSession, updateFocusSettings,
  } = useFocusStore();

  const { focusEnabled, sessionStart, sessionDuration, sensitivity, allowContinue } = focusSettings;

  const durationPct = (focusEnabled && sessionStart && sessionDuration)
    ? Math.min(100, Math.round((sessionElapsed / 60) / sessionDuration * 100))
    : 0;

  return (
    <div className="focus-panel">

      {/* ── Active Session ── */}
      {focusEnabled ? (
        <div className="card session-active-card">
          <div className="session-header">
            <div>
              <span className="session-status-dot active" />
              <span className="session-status-label">Focus Session Active</span>
            </div>
            <span className="session-duration-label">
              {sessionDuration ? `${sessionDuration}m session` : 'Unlimited'}
            </span>
          </div>

          {/* Timer */}
          <div className="session-timer-display">{fmtTimer(sessionElapsed)}</div>

          {/* Progress bar for timed sessions */}
          {sessionDuration > 0 && (
            <div className="session-progress-track">
              <div className="session-progress-fill" style={{ width: `${durationPct}%` }} />
              <span className="session-progress-label">{durationPct}% complete</span>
            </div>
          )}

          {/* Event counts */}
          <div className="session-event-row">
            <span className="event-chip warn">⚠ {eventStats.warnings} warnings</span>
            <span className="event-chip cont">↩ {eventStats.continues} continues</span>
            <span className="event-chip block">⛔ {eventStats.blocks} blocked</span>
          </div>

          <button className="btn btn-danger" onClick={() => endSession()}>
            ■ End Focus Session
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="card-label">Focus Session</div>
          <p className="focus-intro">
            Start a timed focus session. The extension will warn you when you visit
            distracting sites and block sites on your blocked list.
          </p>

          {/* Duration presets */}
          <div className="setting-group">
            <label className="setting-label">Session Duration</label>
            <div className="preset-chips">
              {PRESETS.map(p => (
                <button
                  key={p.value}
                  className={`chip${sessionDuration === p.value ? ' chip-active' : ''}`}
                  onClick={() => updateFocusSettings({ sessionDuration: p.value })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button className="btn btn-primary focus-start-btn" onClick={() => startSession()}>
            ▶ Start Focus Session
          </button>
        </div>
      )}

      {/* ── Quick stats ── */}
      <div className="card stats-mini-grid">
        <div className="mini-stat">
          <span className="mini-val">{eventStats.warnings}</span>
          <span className="mini-lbl">Total Warnings</span>
        </div>
        <div className="mini-stat">
          <span className="mini-val">{eventStats.continues}</span>
          <span className="mini-lbl">Continued</span>
        </div>
        <div className="mini-stat">
          <span className="mini-val">{eventStats.blocks}</span>
          <span className="mini-lbl">Sites Blocked</span>
        </div>
      </div>
    </div>
  );
}
