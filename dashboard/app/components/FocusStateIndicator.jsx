'use client';

/**
 * FocusStateIndicator.jsx — Live Focus State Pill
 *
 * Shows the current real-time focus state as a colored pill:
 *   🟢 Focused (87%)  |  🟡 Drifting (52%)  |  🔴 Distracted (28%)
 *
 * Includes a tooltip with the reasons array for explainability.
 */

import { useState } from 'react';

const STATE_CONFIG = {
  deep_focus: {
    label: 'Focused',
    emoji: '🟢',
    className: 'fsi-focused',
  },
  drifting: {
    label: 'Drifting',
    emoji: '🟡',
    className: 'fsi-drifting',
  },
  distracted: {
    label: 'Distracted',
    emoji: '🔴',
    className: 'fsi-distracted',
  },
};

export default function FocusStateIndicator({ state }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!state || !state.state) {
    return (
      <div className="fsi-container">
        <div className="fsi-pill fsi-inactive">
          <span className="fsi-emoji">⚪</span>
          <span className="fsi-label">No Data</span>
        </div>
      </div>
    );
  }

  const config = STATE_CONFIG[state.state] || STATE_CONFIG.drifting;
  const confidenceLabel = state.confidence >= 0.8 ? 'High' : state.confidence >= 0.5 ? 'Med' : 'Low';

  return (
    <div
      className="fsi-container"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`fsi-pill ${config.className}`}>
        <span className="fsi-emoji">{config.emoji}</span>
        <span className="fsi-label">{config.label}</span>
        <span className="fsi-score">{state.score}</span>
        <span className="fsi-confidence">{confidenceLabel}</span>
      </div>

      {showTooltip && state.reasons && state.reasons.length > 0 && (
        <div className="fsi-tooltip">
          <div className="fsi-tooltip-title">Why {config.label.toLowerCase()}?</div>
          <ul className="fsi-tooltip-list">
            {state.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
