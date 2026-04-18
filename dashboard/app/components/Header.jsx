'use client';

import useFocusStore from '../lib/store';

const RANGES = [
  { label: 'Today',   value: 'today' },
  { label: '7 Days',  value: '7d'    },
  { label: '30 Days', value: '30d'   },
];

export default function Header() {
  const {
    range, setRange, focusSettings, darkMode, toggleDarkMode,
    activeTab, setActiveTab,
  } = useFocusStore();

  const { focusEnabled } = focusSettings;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <header className="header">
      <div className="header-left">
        <div className="brand">
          <span className="brand-icon">⚡</span>
          <div>
            <span className="brand-name">Focus Tracker</span>
            <span className="brand-date">{dateStr}</span>
          </div>
        </div>
      </div>

      <div className="header-right">
        {/* Only show date range in Dashboard tab */}
        {activeTab === 'dashboard' && (
          <div className="seg-control" role="group" aria-label="Date range">
            {RANGES.map(r => (
              <button
                key={r.value}
                className={`seg-btn${range === r.value ? ' seg-btn--active' : ''}`}
                onClick={() => setRange(r.value)}
                aria-pressed={range === r.value}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Focus Mode badge */}
        {focusEnabled && (
          <button
            className="focus-on-badge"
            onClick={() => setActiveTab('focus')}
            title="Focus session active — click to manage"
          >
            ⚡ ACTIVE
          </button>
        )}

        {/* Theme */}
        <button
          className="icon-btn"
          onClick={toggleDarkMode}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? '☀' : '🌙'}
        </button>
      </div>
    </header>
  );
}
