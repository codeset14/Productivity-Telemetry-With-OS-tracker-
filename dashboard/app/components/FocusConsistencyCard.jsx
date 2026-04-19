'use client';

/**
 * FocusConsistencyCard.jsx — Focus Consistency Score + Stats
 *
 * Shows:
 *  - Consistency score (% of time in deep_focus)
 *  - Longest focus streak
 *  - Average focus block duration
 *  - Number of drift transitions
 */

function fmtDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function scoreGrade(score) {
  if (score >= 80) return { label: 'Excellent', cls: 'fcc-excellent' };
  if (score >= 60) return { label: 'Good', cls: 'fcc-good' };
  if (score >= 40) return { label: 'Fair', cls: 'fcc-fair' };
  if (score >= 20) return { label: 'Poor', cls: 'fcc-poor' };
  return { label: 'Critical', cls: 'fcc-critical' };
}

export default function FocusConsistencyCard({ consistencyData }) {
  const { score, longestStreak, avgFocusBlock, driftCount } = consistencyData || {};
  const grade = scoreGrade(score || 0);

  return (
    <section className="card fcc-card">
      <div className="card-label">FOCUS CONSISTENCY</div>

      <div className="fcc-score-row">
        <div className={`fcc-score-circle ${grade.cls}`}>
          <span className="fcc-score-num">{score || 0}</span>
          <span className="fcc-score-pct">%</span>
        </div>
        <div className="fcc-score-meta">
          <span className={`fcc-grade ${grade.cls}`}>{grade.label}</span>
          <span className="fcc-desc">Time spent in deep focus</span>
        </div>
      </div>

      <div className="fcc-stats">
        <div className="fcc-stat">
          <span className="fcc-stat-value">{fmtDuration(longestStreak || 0)}</span>
          <span className="fcc-stat-label">Longest Streak</span>
        </div>
        <div className="fcc-stat">
          <span className="fcc-stat-value">{fmtDuration(avgFocusBlock || 0)}</span>
          <span className="fcc-stat-label">Avg Focus Block</span>
        </div>
        <div className="fcc-stat">
          <span className="fcc-stat-value">{driftCount || 0}</span>
          <span className="fcc-stat-label">Drift Events</span>
        </div>
      </div>
    </section>
  );
}
