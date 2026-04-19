/**
 * BehaviorPatternsCard.jsx — Detected Behavioral Patterns & Triggers
 */

'use client';

import React from 'react';

export function BehaviorPatternsCard({
  patterns = {},
  isLoading = false,
}) {
  const {
    peakDistractionHour = null,
    commonDistractionTimes = [],
    typicalFocusBlockDuration = 0,
    focusBlockConsistency = 'variable',
    averageRecoveryTime = 0,
    distractionFrequency = 0,
    identifiedTriggers = [],
  } = patterns;

  const formatSeconds = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  };

  const consistencyColor = {
    consistent: 'text-green-400',
    variable: 'text-amber-400',
    highly_variable: 'text-red-400',
  }[focusBlockConsistency] || 'text-slate-400';

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white">Behavioral Patterns</h3>
        <div className="text-2xl">📊</div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-12 bg-slate-700 rounded animate-pulse"></div>
          <div className="h-24 bg-slate-700 rounded animate-pulse"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Peak Distraction Time */}
          <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
            <div className="text-sm text-slate-400 mb-2">Peak Distraction Time</div>
            {peakDistractionHour !== null ? (
              <div>
                <div className="text-lg font-semibold text-red-400">
                  {peakDistractionHour}:00 - {peakDistractionHour + 1}:00
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Most distraction events occur during this hour
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-sm">No pattern detected yet</div>
            )}
          </div>

          {/* Common Distraction Times */}
          {commonDistractionTimes.length > 0 && (
            <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
              <div className="text-sm text-slate-400 mb-2">Also distracted at</div>
              <div className="flex flex-wrap gap-2">
                {commonDistractionTimes.slice(0, 3).map((time, i) => (
                  <span
                    key={i}
                    className="bg-red-900/30 border border-red-700/50 text-red-300 text-xs px-2.5 py-1 rounded"
                  >
                    {time}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Focus Block Duration */}
            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-1">Typical Focus Block</div>
              <div className="text-xl font-bold text-blue-400">
                {formatSeconds(typicalFocusBlockDuration)}
              </div>
              <div className="text-xs text-slate-500 mt-1">sustained focus</div>
            </div>

            {/* Focus Consistency */}
            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-1">Consistency</div>
              <div className={`text-xl font-bold capitalize ${consistencyColor}`}>
                {focusBlockConsistency}
              </div>
              <div className="text-xs text-slate-500 mt-1">focus blocks</div>
            </div>

            {/* Distraction Frequency */}
            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-1">Distraction Rate</div>
              <div className="text-xl font-bold text-amber-400">{distractionFrequency}%</div>
              <div className="text-xs text-slate-500 mt-1">of sessions</div>
            </div>

            {/* Recovery Speed */}
            <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-1">Recovery Speed</div>
              <div className="text-xl font-bold text-green-400">
                {formatSeconds(averageRecoveryTime)}
              </div>
              <div className="text-xs text-slate-500 mt-1">average</div>
            </div>
          </div>

          {/* Top Triggers */}
          {identifiedTriggers.length > 0 && (
            <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
              <div className="text-sm text-slate-400 mb-3">Top Distraction Triggers</div>
              <div className="space-y-2">
                {identifiedTriggers.slice(0, 3).map((trigger, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="text-lg">🎯</div>
                      <span className="text-slate-300 truncate">{trigger.trigger}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-red-900/30 border border-red-700/30 rounded px-2 py-1 text-xs text-red-300">
                        {trigger.percentage}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insight */}
          <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-3">
            <div className="text-xs font-semibold text-purple-300 mb-1">💡 Recommendation</div>
            <div className="text-xs text-purple-200">
              {peakDistractionHour !== null
                ? `Schedule important work outside ${peakDistractionHour}:00-${peakDistractionHour + 1}:00 when you're most distracted.`
                : 'Keep building data by running focus sessions. Patterns will appear soon.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BehaviorPatternsCard;
