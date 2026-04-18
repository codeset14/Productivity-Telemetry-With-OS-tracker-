/**
 * mockData.js — Deterministic Realistic Mock Data
 *
 * Generates 30 days of activity that follows real usage patterns:
 *   Work hours (9–17) → productive
 *   Evening (19–22)   → distracting spike
 *   Weekend           → less productive, more leisure
 *
 * ZERO Math.random() calls.
 * Uses a deterministic hash (Math.sin with fixed seed) so the same
 * date always generates the same data — consistent across reloads.
 */

import { addLog } from './db';

// Deterministic pseudo-value in [min, max] based on an integer seed
function dv(seed, min, max) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  const t = x - Math.floor(x); // 0 to 1, deterministic
  return Math.round(min + t * (max - min));
}

// Hour profiles: each defines what type of browsing happens and which sites
const PROFILES = [
  { hours: [6, 7],           cat: 'neutral',     sites: ['google.com', 'gmail.com'],                                minD: 60,  maxD: 240  },
  { hours: [8, 9, 10, 11],   cat: 'productive',  sites: ['github.com', 'notion.so', 'stackoverflow.com', 'docs.google.com', 'figma.com'], minD: 300, maxD: 1800 },
  { hours: [12],             cat: 'distracting', sites: ['reddit.com', 'youtube.com'],                             minD: 180, maxD: 720  },
  { hours: [13, 14, 15, 16], cat: 'productive',  sites: ['github.com', 'stackoverflow.com', 'notion.so', 'leetcode.com', 'vercel.com'], minD: 240, maxD: 1500 },
  { hours: [17, 18],         cat: 'neutral',     sites: ['google.com', 'gmail.com', 'wikipedia.org'],              minD: 120, maxD: 600  },
  { hours: [19, 20, 21],     cat: 'distracting', sites: ['youtube.com', 'reddit.com', 'instagram.com', 'twitter.com', 'netflix.com'], minD: 600, maxD: 2400 },
  { hours: [22, 23],         cat: 'distracting', sites: ['reddit.com', 'youtube.com'],                             minD: 180, maxD: 900  },
];

// Weekend-only profiles (replace productive hours with leisure)
const WEEKEND_PROFILES = [
  { hours: [10, 11, 12],     cat: 'neutral',     sites: ['google.com', 'wikipedia.org', 'gmail.com'],              minD: 120, maxD: 600  },
  { hours: [13, 14, 15],     cat: 'distracting', sites: ['youtube.com', 'reddit.com', 'netflix.com'],              minD: 600, maxD: 1800 },
  { hours: [16, 17, 18],     cat: 'neutral',     sites: ['google.com', 'maps.google.com'],                         minD: 60,  maxD: 300  },
  { hours: [19, 20, 21, 22], cat: 'distracting', sites: ['netflix.com', 'youtube.com', 'instagram.com'],           minD: 900, maxD: 3600 },
];

export async function seedMockData() {
  const DAYS = 30;
  const entries = [];

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;

    const profiles = isWeekend ? WEEKEND_PROFILES : PROFILES;

    for (const profile of profiles) {
      for (const hour of profile.hours) {
        const seed = dayOffset * 1000 + hour;

        // Deterministic: skip ~30% of hours to avoid uniform coverage
        const skipVal = dv(seed + 7, 0, 9);
        if (skipVal < 3) continue;

        const siteIdx = dv(seed + 1, 0, profile.sites.length - 1);
        const site     = profile.sites[siteIdx];
        const duration = dv(seed + 2, profile.minD, profile.maxD);
        const minute   = dv(seed + 3, 0, 55);

        const ts = new Date(date);
        ts.setHours(hour, minute, 0, 0);

        entries.push({ site, duration, timestamp: ts.toISOString(), category: profile.cat, source: 'demo' });

        // 40% chance of a second short visit in the same hour (different site)
        const secondVisit = dv(seed + 5, 0, 9);
        if (secondVisit >= 6) {
          const site2Idx = dv(seed + 6, 0, profile.sites.length - 1);
          const site2    = profile.sites[site2Idx];
          const dur2     = dv(seed + 8, Math.round(profile.minD * 0.3), Math.round(profile.minD * 0.8));
          const min2     = Math.min(minute + dv(seed + 9, 5, 20), 59);

          const ts2 = new Date(date);
          ts2.setHours(hour, min2, 0, 0);
          entries.push({ site: site2, duration: dur2, timestamp: ts2.toISOString(), category: profile.cat, source: 'demo' });
        }

      }
    }
  }

  for (const entry of entries) {
    await addLog(entry);
  }
}
