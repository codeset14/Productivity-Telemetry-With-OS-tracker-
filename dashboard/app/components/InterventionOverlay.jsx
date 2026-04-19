/**
 * InterventionOverlay.jsx — Progressive Distraction Warning UI
 *
 * Three warning levels:
 * 1. Soft Warning (toast): "You're drifting away from focus"
 * 2. Strong Warning (modal): "You're getting distracted. Return to your task"
 * 3. Persistent Overlay: "Extended distraction. Consider taking a break"
 */

'use client';

import React, { useState, useEffect } from 'react';

export function InterventionOverlay({
  active = false,
  level = null, // 'soft' | 'strong' | 'persistent'
  message = '',
  reasons = [],
  onDismiss = () => {},
  onReturn = () => {},
  onTakeBreak = () => {},
  showReasons = true,
}) {
  const [closing, setClosing] = useState(false);
  const [autoClose, setAutoClose] = useState(false);

  // Auto-dismiss soft warnings after 8 seconds
  useEffect(() => {
    if (active && level === 'soft' && !autoClose) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [active, level, autoClose]);

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onDismiss();
    }, 200);
  };

  const handleReturn = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onReturn();
    }, 200);
  };

  if (!active) return null;

  // ─── SOFT WARNING (Toast) ───────────────────────────────────────────────────
  if (level === 'soft') {
    return (
      <div
        className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-200 ${
          closing ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="bg-slate-900 border border-slate-700 border-t-2 border-t-amber-500 rounded-lg shadow-lg px-5 py-4 flex items-center gap-4 min-w-80 max-w-md">
          <div className="text-3xl">💡</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white mb-0.5">
              You're drifting away from focus
            </div>
            <div className="text-xs text-slate-400">
              Take a moment to refocus on your task
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 text-lg"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // ─── STRONG WARNING (Modal) ──────────────────────────────────────────────────
  if (level === 'strong') {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
          closing ? 'opacity-0' : 'opacity-100'
        }`}
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          className={`bg-slate-900 border border-slate-700 border-t-2 border-t-red-500 rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4 transition-all duration-200 ${
            closing ? 'scale-90 opacity-0' : 'scale-100 opacity-100'
          }`}
        >
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-white mb-2">
              You're Getting Distracted
            </h2>
            <p className="text-sm text-slate-400">
              Return to your task to maintain focus
            </p>
          </div>

          {showReasons && reasons.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-4 mb-6 border border-slate-700">
              <div className="text-xs font-semibold text-slate-300 mb-2 uppercase">
                Why:
              </div>
              <ul className="space-y-1">
                {reasons.slice(0, 2).map((reason, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-start">
                    <span className="mr-2">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleReturn}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              Back to Work
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-slate-200 font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── PERSISTENT OVERLAY ────────────────────────────────────────────────────
  if (level === 'persistent') {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
          closing ? 'opacity-0' : 'opacity-100'
        }`}
        style={{
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div
          className={`bg-slate-900 border border-slate-700 border-t-2 border-t-red-600 rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4 transition-all duration-200 ${
            closing ? 'scale-90 opacity-0' : 'scale-100 opacity-100'
          }`}
        >
          <div className="text-center mb-6">
            <div className="text-6xl mb-4 animate-pulse">🚨</div>
            <h2 className="text-2xl font-bold text-red-400 mb-2">
              Extended Distraction
            </h2>
            <p className="text-sm text-slate-400">
              You've been distracted for over 5 minutes. Your focus is at risk.
            </p>
          </div>

          {showReasons && reasons.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-4 mb-6 border border-slate-700">
              <div className="text-xs font-semibold text-slate-300 mb-3 uppercase">
                What's happening:
              </div>
              <ul className="space-y-1.5">
                {reasons.map((reason, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-start">
                    <span className="mr-2 text-red-500">→</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={handleReturn}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Reset & Focus
            </button>
            <button
              onClick={onTakeBreak}
              className="border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-slate-200 font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Take a Break Instead
            </button>
            <button
              onClick={() => {
                // End focus session
                onDismiss();
              }}
              className="text-xs text-slate-500 hover:text-slate-400 py-2 transition-colors"
            >
              End Focus Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default InterventionOverlay;
