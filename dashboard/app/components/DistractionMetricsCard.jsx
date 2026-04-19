/**
 * DistractionMetricsCard.jsx — Recovery & Distraction Statistics
 */

'use client';

import React from 'react';

export function DistractionMetricsCard({
  recoveryStats = {},
  distractionTimeline = [],
  isLoading = false,
}) {
  const {
    totalRecoveries = 0,
    avgTimeToRecovery = 0,
    recoveryStreak = 0,
    longestRecoveryStreak = 0,
  } = recoveryStats;

  const totalDistractionEvents = distractionTimeline.filter(
    e => e.eventType === 'distracted_detected'
  ).length;

  const recoveryRate = totalDistractionEvents > 0
    ? ((totalRecoveries / totalDistractionEvents) * 100).toFixed(0)
    : 0;

  const formatSeconds = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  };

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white">Recovery Metrics</h3>
        <div className="text-2xl">🎯</div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-12 bg-slate-700 rounded animate-pulse"></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-12 bg-slate-700 rounded animate-pulse"></div>
            <div className="h-12 bg-slate-700 rounded animate-pulse"></div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Main Stat: Recovery Rate */}
          <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <div className="text-sm text-slate-400 mb-1">Recovery Rate</div>
            <div className="text-3xl font-bold text-green-400">{recoveryRate}%</div>
            <div className="text-xs text-slate-500 mt-1">
              {totalRecoveries} of {totalDistractionEvents} distraction episodes recovered
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Total Recoveries */}
            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-1">Total Recoveries</div>
              <div className="text-2xl font-bold text-blue-400">{totalRecoveries}</div>
              <div className="text-xs text-slate-500">times you refocused</div>
            </div>

            {/* Current Streak */}
            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-1">Current Streak</div>
              <div className="text-2xl font-bold text-amber-400">{recoveryStreak}</div>
              <div className="text-xs text-slate-500">consecutive recoveries</div>
            </div>

            {/* Avg Recovery Time */}
            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-1">Avg Recovery Time</div>
              <div className="text-2xl font-bold text-purple-400">
                {formatSeconds(avgTimeToRecovery)}
              </div>
              <div className="text-xs text-slate-500">to refocus</div>
            </div>

            {/* Best Streak */}
            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-1">Best Streak</div>
              <div className="text-2xl font-bold text-green-400">{longestRecoveryStreak}</div>
              <div className="text-xs text-slate-500">consecutive</div>
            </div>
          </div>

          {/* Insight */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3">
            <div className="text-xs font-semibold text-blue-300 mb-1">💡 Insight</div>
            <div className="text-xs text-blue-200">
              {recoveryRate > 80
                ? "Excellent! You're recovering from distractions very quickly."
                : recoveryRate > 50
                ? "Good recovery rate. You're refocusing on most distraction events."
                : "Consider setting stricter focus sessions to minimize distraction time."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DistractionMetricsCard;
