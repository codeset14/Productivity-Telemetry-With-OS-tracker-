'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fmtDuration, fmtHour } from '../lib/engine';

const TooltipContent = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-name">{typeof label === 'number' ? fmtHour(label) : label}</div>
      {payload.map((p, i) => (
        <div key={i} className="tooltip-row">
          <span style={{ color: p.fill }}>{p.name}</span>
          <span className="tooltip-val">{fmtDuration(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function UsageGraph({ data, range }) {
  const isToday = range === 'today';
  const rawData = isToday ? data?.hourlyBreakdown : data?.dailyBreakdown;
  const hasData = rawData?.some(d => (
    (d.productive + d.distracting + d.neutral) > 0
  ));

  // For hourly: only show active hours + 1 before/after for context
  let chartData = rawData ?? [];
  if (isToday && hasData) {
    const active = chartData
      .map((d, i) => ({ i, total: d.productive + d.distracting + d.neutral }))
      .filter(d => d.total > 0);
    const minH = Math.max(0, Math.min(...active.map(d => d.i)) - 1);
    const maxH = Math.min(23, Math.max(...active.map(d => d.i)) + 1);
    chartData = chartData.slice(minH, maxH + 1);
  }

  return (
    <div className="card">
      <div className="card-label">{isToday ? 'Activity by Hour' : 'Daily Overview'}</div>
      <p className="card-sub">{isToday ? 'Productive vs Distracting time per hour' : 'Day-by-day activity breakdown'}</p>

      {hasData ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-chart)" vertical={false} />
            <XAxis
              dataKey={isToday ? 'hour' : 'label'}
              tickFormatter={isToday ? fmtHour : v => v}
              tick={{ fill: 'var(--text-3)', fontSize: 11 }}
              axisLine={false} tickLine={false}
              interval={isToday ? 1 : 0}
            />
            <YAxis
              tickFormatter={v => `${Math.round(v / 60)}m`}
              tick={{ fill: 'var(--text-3)', fontSize: 10 }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<TooltipContent />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="productive"  name="Productive"  stackId="a" fill="var(--productive)"  fillOpacity={0.85} />
            <Bar dataKey="neutral"     name="Neutral"     stackId="a" fill="var(--neutral)"      fillOpacity={0.5}  />
            <Bar dataKey="distracting" name="Distracting" stackId="a" fill="var(--distracting)"  fillOpacity={0.85} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="empty-state">No activity data for this period</div>
      )}
    </div>
  );
}
