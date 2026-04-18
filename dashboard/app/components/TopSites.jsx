'use client';

import { fmtDuration } from '../lib/engine';

const CATEGORY_COLORS = {
  productive:  'var(--productive)',
  distracting: 'var(--distracting)',
  neutral:     'var(--neutral)',
};

function SiteRow({ site, index }) {
  const color    = CATEGORY_COLORS[site.category] ?? 'var(--neutral)';
  const maxShare = 100;

  return (
    <li className="site-row">
      <span className="site-rank">{index + 1}</span>
      <img
        className="site-favicon"
        src={`https://www.google.com/s2/favicons?domain=${site.site}&sz=32`}
        alt=""
        aria-hidden="true"
        onError={e => { e.target.style.visibility = 'hidden'; }}
      />
      <div className="site-info">
        <div className="site-name">{site.site}</div>
        <div className="site-bar-track">
          <div
            className="site-bar-fill"
            style={{ width: `${site.share}%`, background: color + 'aa' }}
          />
        </div>
      </div>
      <div className="site-right">
        <span className="site-dur">{fmtDuration(site.duration)}</span>
        <span className="site-cat" style={{ color, borderColor: color + '55' }}>
          {site.category}
        </span>
      </div>
    </li>
  );
}

export default function TopSites({ data }) {
  const sites = data?.topSites ?? [];
  const hasSites = sites.length > 0;

  return (
    <div className="card">
      <div className="card-label">Top Websites</div>
      <p className="card-sub">Most visited sites — ranked by time spent</p>

      {hasSites ? (
        <ul className="site-list">
          {sites.map((site, i) => (
            <SiteRow key={site.site} site={site} index={i} />
          ))}
        </ul>
      ) : (
        <div className="empty-state">No website data available</div>
      )}
    </div>
  );
}
