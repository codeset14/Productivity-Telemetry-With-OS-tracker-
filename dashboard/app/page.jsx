'use client';

import { useEffect, useState, useCallback } from 'react';
import useFocusStore from './lib/store';

import Header           from './components/Header';
import FocusScoreCard   from './components/FocusScoreCard';
import CategoryBreakdown from './components/CategoryBreakdown';
import UsageGraph       from './components/UsageGraph';
import TopSites         from './components/TopSites';
import InsightAssistant from './components/InsightAssistant';
import FocusModePanel   from './components/FocusModePanel';
import SettingsPanel    from './components/SettingsPanel';
import SessionHistory   from './components/SessionHistory';

function Loader() {
  return (
    <div className="loader-screen">
      <div className="loader-content">
        <div className="loader-bar"><div className="loader-fill" /></div>
        <p className="loader-text">Loading focus data…</p>
      </div>
    </div>
  );
}

// ─── [ADDED] Distraction Popup ────────────────────────────────────────────────
// Rendered at the root of the page shell so it always sits above all content.
// Wires into window.electronBridge.onDistractionPopup (set up by preload.js).
// Dismiss: user clicks "Got it" or "Start Focus Session".
// Does NOT modify any store, component, or dashboard logic.
function DistractionPopup({ data, onDismiss, onFocus }) {
  if (!data) return null;
  return (
    <div className="distraction-overlay" role="dialog" aria-modal="true" aria-label="Distraction alert">
      <div className="distraction-popup">
        <div className="distraction-popup-header">
          <div className="distraction-popup-icon">⚠️</div>
          <div className="distraction-popup-titles">
            <div className="distraction-popup-title">Distraction Detected</div>
            <div className="distraction-popup-subtitle">
              You just opened{' '}
              <span className="distraction-popup-site">{data.label}</span>
            </div>
          </div>
        </div>

        <div className="distraction-popup-body">
          <p>
            <strong>{data.label}</strong> is classified as a distracting site.
            Stay focused — close this tab and get back to what matters.
          </p>
        </div>

        <div className="distraction-popup-footer">
          <button className="distraction-popup-dismiss" onClick={onDismiss}>
            Got it
          </button>
          <button className="distraction-popup-focus" onClick={onFocus}>
            ⚡ Start Focus Session
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── [END ADDED] ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'focus',     label: '⚡ Focus Session' },
  { id: 'history',   label: 'Session History' },
];

export default function DashboardPage() {
  const {
    data, report, range, isLoading,
    demoActive, hasRealData,
    focusSettings, darkMode, activeTab, setActiveTab, init, refresh, clearDemo,
  } = useFocusStore();

  // ─── [ADDED] Popup state ──────────────────────────────────────────────────
  const [popupData, setPopupData] = useState(null);

  const handleDismiss = useCallback(() => setPopupData(null), []);

  const handleFocus = useCallback(() => {
    setPopupData(null);
    setActiveTab('focus');
  }, [setActiveTab]);

  useEffect(() => {
    // Only subscribe if running inside Electron
    if (typeof window === 'undefined') return;
    if (!window.electronBridge?.onDistractionPopup) return;

    window.electronBridge.onDistractionPopup((data) => {
      setPopupData(data);
    });
  }, []);
  // ─── [END ADDED] ──────────────────────────────────────────────────────────

  useEffect(() => { init(); }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', !darkMode);
  }, [darkMode]);

  if (isLoading || !data) return <Loader />;

  const { focusEnabled } = focusSettings;

  return (
    <div className="app">
      {/* [ADDED] Distraction popup — rendered above everything, zero impact on layout */}
      <DistractionPopup data={popupData} onDismiss={handleDismiss} onFocus={handleFocus} />

      <Header />

      {/* Active session banner */}
      {focusEnabled && (
        <div className="session-banner" role="status">
          <span className="session-banner-dot" />
          <span>Focus session is <strong>active</strong> — the extension is monitoring your browsing.</span>
          <button className="text-btn ml-auto" onClick={() => setActiveTab('focus')}>
            View →
          </button>
        </div>
      )}

      {/* Tab navigation */}
      <div className="tab-bar">
        <div className="tab-list">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab-btn${activeTab === t.id ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="main">
        {/* ═══ TAB: Dashboard ═══ */}
        {activeTab === 'dashboard' && (
          <>
            {/* Smart demo notice */}
            {demoActive && hasRealData && (
              <div className="notice notice-warn">
                <span>⚠</span>
                <span>
                  <strong>Demo data is mixed with your real browsing data.</strong>{' '}
                  Clear it to see only your actual activity from the extension.
                </span>
                <button className="notice-btn notice-btn-danger" onClick={clearDemo}>
                  Clear Demo Data
                </button>
              </div>
            )}

            {demoActive && !hasRealData && (
              <div className="notice">
                <span>📊</span>
                <span>
                  Showing <strong>demo data</strong> — install and use the Chrome extension, then click{' '}
                  <strong>Clear Demo Data</strong> to see your real activity.
                </span>
                <button className="notice-btn" onClick={clearDemo}>
                  Clear Demo Data
                </button>
                <button className="notice-icon-btn" onClick={refresh} title="Refresh data">↻</button>
              </div>
            )}


            <FocusScoreCard data={data} />

            <div className="grid-2">
              <CategoryBreakdown data={data} />
              <UsageGraph data={data} range={range} />
            </div>

            <div className="grid-2">
              <TopSites data={data} />
              <InsightAssistant report={report} data={data} />
            </div>

            {/* Setup guide */}
            <section id="setup" className="setup-card card">
              <div className="card-label">CONNECT THE EXTENSION</div>
              <div className="setup-steps">
                <div className="setup-step">
                  <div className="step-n">1</div>
                  <div>
                    <strong>Open Chrome Extensions</strong>
                    <p>Navigate to <code>chrome://extensions</code></p>
                  </div>
                </div>
                <div className="setup-step">
                  <div className="step-n">2</div>
                  <div>
                    <strong>Enable Developer Mode</strong>
                    <p>Toggle the switch in the top-right</p>
                  </div>
                </div>
                <div className="setup-step">
                  <div className="step-n">3</div>
                  <div>
                    <strong>Load Unpacked</strong>
                    <p>Select the <code>miniproject/extension/</code> folder</p>
                  </div>
                </div>
                <div className="setup-step">
                  <div className="step-n">4</div>
                  <div>
                    <strong>Start Browsing</strong>
                    <p>Data appears here after a few minutes</p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ═══ TAB: Focus Session ═══ */}
        {activeTab === 'focus' && (
          <div className="focus-tab-layout">
            <div className="focus-main">
              <FocusModePanel />
            </div>
            <div className="focus-side">
              <SettingsPanel />
            </div>
          </div>
        )}

        {/* ═══ TAB: History ═══ */}
        {activeTab === 'history' && (
          <SessionHistory />
        )}
      </main>

      <footer className="footer">
        <span>⚡ Focus Tracker</span>
        <span>Privacy-first · All data stored locally · No servers</span>
      </footer>
    </div>
  );
}
