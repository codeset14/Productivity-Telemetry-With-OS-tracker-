'use client';

import { useEffect, useRef } from 'react';
import { fmtDuration, scoreLabel, scoreColor } from '../lib/engine';

export default function FocusScoreCard({ data }) {
  const barRef = useRef(null);
  const numRef = useRef(null);

  const score = data?.focusScore ?? 0;
  const prod  = data?.productiveTime ?? 0;
  const dist  = data?.distractingTime ?? 0;
  const neut  = data?.neutralTime ?? 0;
  const total = data?.totalTime ?? 0;
  const label = scoreLabel(score);
  const color = scoreColor(score);

  // Animate score bar on mount/change
  useEffect(() => {
    if (!barRef.current || !numRef.current) return;
    barRef.current.style.width = `${score}%`;
    barRef.current.style.background = color;

    let cur = 0;
    const step = Math.max(1, Math.ceil(score / 35));
    const timer = setInterval(() => {
      cur = Math.min(cur + step, score);
      if (numRef.current) numRef.current.textContent = cur;
      if (cur >= score) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [score, color]);

  return (
    <div className="card score-card">
      <div className="score-card-header">
        <span className="card-label">Focus Score</span>
        <span className="score-badge" style={{ color, borderColor: color }}>
          {label}
        </span>
      </div>

      <div className="score-body">
        {/* Big number */}
        <div className="score-number-wrap">
          <span ref={numRef} className="score-number">0</span>
          <span className="score-denom"> / 100</span>
        </div>

        {/* Progress bar */}
        <div className="score-bar-track" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
          <div ref={barRef} className="score-bar-fill" style={{ width: 0 }} />
        </div>

        {/* Formula explanation */}
        <p className="score-formula">
          Score = (Productive − Distracting) / Active time, normalized to 0–100
        </p>
      </div>

      {/* Stats row */}
      <div className="score-stats">
        <div className="score-stat">
          <span className="stat-dot" style={{ background: 'var(--productive)' }} />
          <div>
            <div className="stat-label">Productive</div>
            <div className="stat-val productive">{fmtDuration(prod)}</div>
          </div>
        </div>
        <div className="score-stat">
          <span className="stat-dot" style={{ background: 'var(--distracting)' }} />
          <div>
            <div className="stat-label">Distracting</div>
            <div className="stat-val distracting">{fmtDuration(dist)}</div>
          </div>
        </div>
        <div className="score-stat">
          <span className="stat-dot" style={{ background: 'var(--neutral)' }} />
          <div>
            <div className="stat-label">Neutral</div>
            <div className="stat-val neutral">{fmtDuration(neut)}</div>
          </div>
        </div>
        <div className="score-stat">
          <div>
            <div className="stat-label">Total Active</div>
            <div className="stat-val">{fmtDuration(total)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
