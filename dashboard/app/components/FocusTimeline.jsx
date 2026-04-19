'use client';

/**
 * FocusTimeline.jsx — Focus State Timeline
 *
 * Horizontal timeline showing focus state transitions throughout the day.
 * Each block is colored by state with hover showing timestamp + reasons.
 */

import { useState } from 'react';

const STATE_COLORS = {
  deep_focus: 'var(--productive)',
  drifting:   'var(--warning)',
  distracted: 'var(--distracting)',
};

const STATE_LABELS = {
  deep_focus: 'Focused',
  drifting:   'Drifting',
  distracted: 'Distracted',
};

function fmtTime(isoStr) {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function FocusTimeline({ timeline }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!timeline || timeline.length === 0) {
    return (
      <section className="card ft-timeline-card">
        <div className="card-label">FOCUS TIMELINE</div>
        <div className="ft-empty">No focus data yet — browse with the extension active to see your state transitions.</div>
      </section>
    );
  }

  // Compute segment durations for proportional width
  const segments = [];
  for (let i = 0; i < timeline.length; i++) {
    const curr = timeline[i];
    const next = timeline[i + 1];
    const startMs = new Date(curr.timestamp).getTime();
    const endMs = next ? new Date(next.timestamp).getTime() : Date.now();
    const durationSec = Math.max(1, (endMs - startMs) / 1000);
    // Cap at 30 min to avoid one giant block
    segments.push({
      ...curr,
      durationSec: Math.min(durationSec, 1800),
      startMs,
    });
  }

  const totalDuration = segments.reduce((s, seg) => s + seg.durationSec, 0);

  return (
    <section className="card ft-timeline-card">
      <div className="card-label">FOCUS TIMELINE</div>

      <div className="ft-bar-container">
        {segments.map((seg, i) => {
          const widthPct = Math.max(1, (seg.durationSec / totalDuration) * 100);
          return (
            <div
              key={i}
              className="ft-bar-segment"
              style={{
                width: `${widthPct}%`,
                backgroundColor: STATE_COLORS[seg.state] || 'var(--surface-2)',
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {hoveredIdx === i && (
                <div className="ft-bar-tooltip">
                  <strong>{STATE_LABELS[seg.state] || seg.state}</strong>
                  <span>Score: {seg.score}</span>
                  <span>{fmtTime(seg.timestamp)}</span>
                  {seg.reasons && seg.reasons.length > 0 && (
                    <ul className="ft-bar-reasons">
                      {seg.reasons.slice(0, 3).map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="ft-legend">
        <span className="ft-legend-item">
          <span className="ft-legend-dot" style={{ background: 'var(--productive)' }} />
          Focused
        </span>
        <span className="ft-legend-item">
          <span className="ft-legend-dot" style={{ background: 'var(--warning)' }} />
          Drifting
        </span>
        <span className="ft-legend-item">
          <span className="ft-legend-dot" style={{ background: 'var(--distracting)' }} />
          Distracted
        </span>
      </div>
    </section>
  );
}
