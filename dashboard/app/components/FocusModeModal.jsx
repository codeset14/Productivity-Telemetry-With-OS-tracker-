'use client';

/**
 * FocusModeModal — Warning shown when Focus Mode is ON
 * Displayed in the dashboard as a notice, matching the extension behavior.
 */

export default function FocusModeModal({ onDismiss }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Focus Mode Active">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-icon">⚡</span>
          <h2 className="modal-title">Focus Mode is Active</h2>
        </div>

        <div className="modal-body">
          <p className="modal-desc">
            When you visit a distracting site, the browser extension will prompt you with:
          </p>
          <blockquote className="modal-quote">
            "You are entering a distracting site. Stay focused?"
          </blockquote>
          <p className="modal-desc">
            Click <strong>Dismiss</strong> to proceed to the site, or <strong>Go Back</strong>
            to return to your previous page.
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onDismiss}>Got it</button>
        </div>
      </div>
    </div>
  );
}
