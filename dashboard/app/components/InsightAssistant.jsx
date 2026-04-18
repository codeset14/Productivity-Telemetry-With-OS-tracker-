'use client';

/**
 * InsightAssistant — Analysis Report Panel
 *
 * Shows a structured analysis report derived from ProcessedData.
 * Format: report, not chat. No avatar. No typing animation.
 */

const FINDING_ICONS = {
  warning:  '⚠',
  positive: '✓',
  info:     '○',
};

const FINDING_COLORS = {
  warning:  'var(--distracting)',
  positive: 'var(--productive)',
  info:     'var(--text-3)',
};

function Finding({ finding }) {
  const icon  = FINDING_ICONS[finding.type] ?? '○';
  const color = FINDING_COLORS[finding.type] ?? 'var(--text-3)';

  return (
    <div className="finding">
      <span className="finding-icon" style={{ color }}>{icon}</span>
      <div className="finding-body">
        <p className="finding-text">{finding.text}</p>
        {finding.detail && (
          <p className="finding-detail">{finding.detail}</p>
        )}
      </div>
    </div>
  );
}

export default function InsightAssistant({ report, data }) {
  const hasData = (data?.logCount ?? 0) > 0;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="card report-card">
      {/* Report header */}
      <div className="report-header">
        <div>
          <div className="report-title">FOCUS ANALYSIS REPORT</div>
          <div className="report-date">{today}</div>
        </div>
        <div className="report-score-chip" aria-label={`Focus score: ${data?.focusScore ?? 0}`}>
          {data?.focusScore ?? '—'}<span className="chip-denom">/100</span>
        </div>
      </div>

      <div className="report-divider" />

      {/* Summary */}
      <section className="report-section">
        <p className="report-summary">{report?.summary}</p>
      </section>

      {/* Key findings */}
      {hasData && (report?.findings?.length ?? 0) > 0 && (
        <>
          <div className="report-divider" />
          <section className="report-section">
            <div className="section-label">KEY FINDINGS</div>
            <div className="findings-list">
              {report.findings.map((f, i) => (
                <Finding key={i} finding={f} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Recommendation */}
      {hasData && report?.recommendation && (
        <>
          <div className="report-divider" />
          <section className="report-section">
            <div className="section-label">RECOMMENDATION</div>
            <p className="report-rec">{report.recommendation}</p>
          </section>
        </>
      )}
    </div>
  );
}
