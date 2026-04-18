'use client';

import { useState, useRef, useEffect } from 'react';
import useFocusStore from '../lib/store';
import { getSectionsForInput } from '../lib/siteSections';

const SENSITIVITIES = [
  { id: 'low',    label: 'Low',    desc: 'Warn after 3 visits' },
  { id: 'medium', label: 'Medium', desc: 'Warn on first visit' },
  { id: 'high',   label: 'High',   desc: 'Always warn'         },
];

export default function SettingsPanel() {
  const { focusSettings, updateFocusSettings, addBlocked, removeBlocked } = useFocusStore();
  const { blockedSites, sensitivity, allowContinue } = focusSettings;

  const [newSite,       setNewSite]       = useState('');
  const [addErr,        setAddErr]        = useState('');
  const [suggestions,   setSuggestions]   = useState([]);
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const inputRef  = useRef(null);
  const wrapRef   = useRef(null);

  // Recompute suggestions whenever input changes
  useEffect(() => {
    const s = getSectionsForInput(newSite);
    setSuggestions(s);
    setDropdownOpen(s.length > 0 && newSite.trim().length > 0);
  }, [newSite]);

  // Close dropdown on outside click
  useEffect(() => {
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function handleAddSite(e) {
    e?.preventDefault();
    const raw = newSite.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    if (!raw) { setAddErr('Enter a valid domain or URL path'); return; }
    if (blockedSites.includes(raw)) { setAddErr('Already in list'); return; }
    addBlocked(raw);
    setNewSite('');
    setAddErr('');
    setDropdownOpen(false);
  }

  function handleSuggestionClick(path) {
    // Directly add; no need to populate input first
    if (blockedSites.includes(path)) {
      setAddErr(`${path} is already blocked`);
      setDropdownOpen(false);
      setNewSite('');
      return;
    }
    addBlocked(path);
    setNewSite('');
    setAddErr('');
    setDropdownOpen(false);
  }

  return (
    <div className="settings-panel">

      {/* ── Warning Sensitivity ── */}
      <div className="card">
        <div className="card-label">Warning Sensitivity</div>
        <p className="card-sub">How quickly Focus Mode intervenes when you visit a distracting site</p>
        <div className="sensitivity-grid">
          {SENSITIVITIES.map(s => (
            <button
              key={s.id}
              className={`sensitivity-card${sensitivity === s.id ? ' sensitivity-active' : ''}`}
              onClick={() => updateFocusSettings({ sensitivity: s.id })}
            >
              <span className="sensitivity-label">{s.label}</span>
              <span className="sensitivity-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Blocked Sites ── */}
      <div className="card">
        <div className="card-label">Blocked Sites</div>
        <p className="card-sub">
          Block an entire site or just specific sections. Paste any URL — we'll suggest what to block.
        </p>

        {/* Add site form */}
        <form className="add-site-form" onSubmit={handleAddSite} autoComplete="off">
          <div className="site-input-wrap" ref={wrapRef}>
            <input
              ref={inputRef}
              className="site-input"
              type="text"
              value={newSite}
              onChange={e => { setNewSite(e.target.value); setAddErr(''); }}
              onFocus={() => { if (suggestions.length > 0) setDropdownOpen(true); }}
              placeholder="e.g. reddit.com or paste a YouTube URL"
              aria-label="Domain or URL path to block"
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
            />

            {/* Smart Suggestions Dropdown */}
            {dropdownOpen && suggestions.length > 0 && (
              <div className="site-suggestions" role="listbox">
                <div className="suggestions-header">
                  <span>📋 Select a section to block</span>
                </div>
                {suggestions.map(s => (
                  <button
                    key={s.path}
                    type="button"
                    className={`suggestion-item${blockedSites.includes(s.path) ? ' suggestion-item--blocked' : ''}`}
                    onClick={() => handleSuggestionClick(s.path)}
                    role="option"
                    aria-selected={blockedSites.includes(s.path)}
                  >
                    <span className="suggestion-icon">{s.icon}</span>
                    <span className="suggestion-text">
                      <span className="suggestion-label">{s.label}</span>
                      <span className="suggestion-path">{s.path}</span>
                    </span>
                    <span className={`suggestion-badge ${s.distracting ? 'badge-distracting' : 'badge-productive'}`}>
                      {s.distracting ? '⚡ Distracting' : '✓ Productive'}
                    </span>
                    {blockedSites.includes(s.path)
                      ? <span className="suggestion-blocked-tag">Blocked</span>
                      : <span className="suggestion-add-tag">+ Add</span>
                    }
                  </button>
                ))}
                <div className="suggestions-footer">
                  <button type="submit" className="suggestions-custom-btn">
                    Add "{newSite.trim()}" as custom entry instead →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Only show Add button when no dropdown suggestions OR input is a custom entry */}
          {(!dropdownOpen || suggestions.length === 0) && (
            <button className="btn btn-primary btn-sm" type="submit">Add</button>
          )}
        </form>

        {addErr && <p className="input-err">{addErr}</p>}

        {/* Blocked list */}
        {blockedSites.length > 0 ? (
          <ul className="blocked-list">
            {blockedSites.map(site => {
              // Detect if this is a path-based entry
              const isPath = site.includes('/');
              const domain = isPath ? site.split('/')[0] : site;
              return (
                <li key={site} className="blocked-item">
                  <img
                    className="site-favicon"
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                    alt="" aria-hidden
                    onError={e => { e.target.style.visibility = 'hidden'; }}
                  />
                  <span className="blocked-domain">
                    {site}
                    {isPath && <span className="path-tag">path</span>}
                  </span>
                  <button
                    className="remove-btn"
                    onClick={() => removeBlocked(site)}
                    aria-label={`Remove ${site}`}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state" style={{ paddingTop: '16px', paddingBottom: '8px' }}>
            No blocked sites. Paste a URL above to get started.
          </p>
        )}
      </div>

      {/* ── Override Control ── */}
      <div className="card">
        <div className="card-label">Override Control</div>
        <div className="toggle-row">
          <div>
            <div className="toggle-title">Allow "Continue" button on warnings</div>
            <div className="toggle-desc">
              If off, users cannot bypass warnings — they must end the session or go back.
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={allowContinue}
              onChange={e => updateFocusSettings({ allowContinue: e.target.checked })}
            />
            <span className="switch-track"><span className="switch-thumb" /></span>
          </label>
        </div>
      </div>

    </div>
  );
}
