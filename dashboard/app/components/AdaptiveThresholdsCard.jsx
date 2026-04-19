/**
 * AdaptiveThresholdsCard.jsx — Threshold Transparency & Personalization
 */

'use client';

import React from 'react';

export function AdaptiveThresholdsCard({
  adaptiveThresholds = {},
  confidence = 0,
  reasoning = [],
  isLoading = false,
}) {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white">Detection Thresholds</h3>
        <div className="text-2xl">⚙️</div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-16 bg-slate-700 rounded animate-pulse"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-slate-700 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Confidence Score */}
          <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-lg p-4 border border-blue-700/30">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-300 font-semibold">Personalization Confidence</div>
              <div className={`text-lg font-bold ${confidence > 0.8 ? 'text-green-400' : confidence > 0.5 ? 'text-amber-400' : 'text-slate-400'}`}>
                {(confidence * 100).toFixed(0)}%
              </div>
            </div>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  confidence > 0.8
                    ? 'bg-green-500'
                    : confidence > 0.5
                    ? 'bg-amber-500'
                    : 'bg-slate-500'
                }`}
                style={{ width: `${confidence * 100}%` }}
              ></div>
            </div>
            <div className="text-xs text-slate-400 mt-2">
              {confidence > 0.8
                ? '✓ Thresholds are well-personalized to your behavior'
                : confidence > 0.5
                ? '◐ More data will improve personalization'
                : '○ Keep running focus sessions for better adaptation'}
            </div>
          </div>

          {/* Key Thresholds */}
          <div className="space-y-2">
            <div className="text-sm text-slate-400 font-semibold mb-3">Active Thresholds</div>

            {/* Context Switch */}
            {adaptiveThresholds.contextSwitchThreshold && (
              <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-300">Context Switching</span>
                  <span className="text-sm font-semibold text-blue-400">
                    {adaptiveThresholds.contextSwitchThreshold.toFixed(1)}/min
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  Tab switches per minute before warning
                </div>
              </div>
            )}

            {/* Idle Threshold */}
            {adaptiveThresholds.idlePercentageThreshold && (
              <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-300">Idle Time</span>
                  <span className="text-sm font-semibold text-purple-400">
                    {(adaptiveThresholds.idlePercentageThreshold * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  Maximum idle time before drifting
                </div>
              </div>
            )}

            {/* Focus Block */}
            {adaptiveThresholds.focusBlockMinDuration && (
              <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-300">Focus Block Duration</span>
                  <span className="text-sm font-semibold text-green-400">
                    {Math.round(adaptiveThresholds.focusBlockMinDuration / 60)}m
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  Minimum sustained activity to lock "focused" state
                </div>
              </div>
            )}
          </div>

          {/* Reasoning */}
          {reasoning.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-4">
              <div className="text-sm text-amber-300 font-semibold mb-2">Why These Thresholds?</div>
              <ul className="space-y-1.5">
                {reasoning.map((reason, i) => (
                  <li key={i} className="text-xs text-amber-200 flex items-start">
                    <span className="mr-2 text-amber-400">→</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Help Text */}
          <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600">
            <div className="text-xs font-semibold text-slate-300 mb-1">📖 How it works</div>
            <div className="text-xs text-slate-400 space-y-1">
              <div>• Thresholds adapt based on your 7-day behavior patterns</div>
              <div>• Higher confidence = more personalized detection</div>
              <div>• Warnings trigger when metrics exceed thresholds</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdaptiveThresholdsCard;
