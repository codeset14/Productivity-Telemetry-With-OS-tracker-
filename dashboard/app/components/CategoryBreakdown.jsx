'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtDuration } from '../lib/engine';

const SEGMENTS = [
  { key: 'productiveTime',  label: 'Productive',  color: 'var(--productive)'  },
  { key: 'neutralTime',     label: 'Neutral',     color: 'var(--neutral)'     },
  { key: 'distractingTime', label: 'Distracting', color: 'var(--distracting)' },
];

const TooltipContent = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-name">{payload[0].name}</div>
      <div className="tooltip-val">{fmtDuration(payload[0].value)}</div>
    </div>
  );
};

export default function CategoryBreakdown({ data }) {
  const hasData = (data?.totalTime ?? 0) > 0;

  const chartData = SEGMENTS.map(s => ({
    name: s.label,
    value: data?.[s.key] ?? 0,
    color: s.color,
  })).filter(d => d.value > 0);

  const total = data?.totalTime ?? 1;

  return (
    <div className="card">
      <div className="card-label">Time Distribution</div>

      {hasData ? (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<TooltipContent />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="breakdown-legend">
            {SEGMENTS.map(s => {
              const val = data?.[s.key] ?? 0;
              const pct = Math.round(val / total * 100);
              return (
                <div key={s.key} className="legend-row">
                  <span className="legend-dot" style={{ background: s.color }} />
                  <span className="legend-name">{s.label}</span>
                  <span className="legend-pct">{pct}%</span>
                  <span className="legend-dur">{fmtDuration(val)}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-state">No data for this period</div>
      )}
    </div>
  );
}
