'use client';

import useFocusStore from '../lib/store';

const CATEGORY_COLORS = {
  productive:  'var(--productive)',
  distracting: 'var(--distracting)',
  neutral:     'var(--neutral)',
};

function fmtDuration(secs) {
  if (!secs) return '0m';
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function SessionHistory() {
  const { sessionHistory, labelSite, removeLabel, refreshHistory } = useFocusStore();

  return (
    <div className="card">
      <div className="card-label-row">
        <span className="card-label">Session History</span>
        <button className="text-btn" onClick={() => refreshHistory()}>↻ Refresh</button>
      </div>
      <p className="card-sub">
        Label sessions to improve future classification. Your labels always override the automatic classifier.
      </p>

      {sessionHistory.length > 0 ? (
        <ul className="session-list">
          {sessionHistory.map((s, i) => {
            const effective = s.userLabel || s.category;
            const color     = CATEGORY_COLORS[effective] ?? 'var(--neutral)';
            return (
              <li key={s.id ?? i} className="session-item">
                <img
                  className="site-favicon"
                  src={`https://www.google.com/s2/favicons?domain=${s.site}&sz=32`}
                  alt="" aria-hidden
                  onError={e => { e.target.style.visibility = 'hidden'; }}
                />
                <div className="session-info">
                  <span className="session-site">{s.site}</span>
                  <span className="session-meta">
                    {fmtDuration(s.duration)} · {fmtDate(s.startTime)}
                  </span>
                </div>
                <div className="session-right">
                  {/* Category badge */}
                  <span className="cat-badge" style={{ color, borderColor: color + '55' }}>
                    {s.userLabel ? '★ ' : ''}{effective}
                  </span>
                  {/* Label buttons */}
                  <div className="label-btns">
                    <button
                      className={`lbl-btn lbl-prod${effective === 'productive' ? ' lbl-active' : ''}`}
                      onClick={() => s.userLabel === 'productive' ? removeLabel(s.site) : labelSite(s.site, 'productive')}
                      title="Mark as productive"
                    >
                      ✓
                    </button>
                    <button
                      className={`lbl-btn lbl-dist${effective === 'distracting' ? ' lbl-active' : ''}`}
                      onClick={() => s.userLabel === 'distracting' ? removeLabel(s.site) : labelSite(s.site, 'distracting')}
                      title="Mark as distracting"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty-state">
          No sessions recorded yet. Start browsing with the extension installed.
        </div>
      )}
    </div>
  );
}
