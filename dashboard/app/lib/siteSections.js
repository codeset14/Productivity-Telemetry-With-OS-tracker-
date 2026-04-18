/**
 * siteSections.js — Known sub-sections for popular sites
 *
 * When a user pastes a URL like "youtube.com", the SettingsPanel shows
 * a smart dropdown of known distracting/neutral sections.
 *
 * distracting: true  → highlighted in red, suggests blocking
 * distracting: false → highlighted in green, probably fine to allow
 */

export const SITE_SECTIONS = {
  'youtube.com': [
    { path: 'youtube.com',                    label: 'All of YouTube',   distracting: true,  icon: '🎬' },
    { path: 'youtube.com/shorts',             label: 'Shorts',           distracting: true,  icon: '📱' },
    { path: 'youtube.com/feed/trending',      label: 'Trending',         distracting: true,  icon: '🔥' },
    { path: 'youtube.com/feed/explore',       label: 'Explore',          distracting: true,  icon: '🧭' },
    { path: 'youtube.com/feed/subscriptions', label: 'Subscriptions',    distracting: false, icon: '📋' },
    { path: 'youtube.com/results',            label: 'Search Results',   distracting: false, icon: '🔍' },
  ],
  'reddit.com': [
    { path: 'reddit.com',              label: 'All of Reddit',    distracting: true,  icon: '👽' },
    { path: 'reddit.com/r/popular',    label: 'Popular',          distracting: true,  icon: '🔥' },
    { path: 'reddit.com/r/all',        label: 'r/all',            distracting: true,  icon: '📰' },
  ],
  'twitter.com': [
    { path: 'twitter.com',             label: 'All of Twitter',   distracting: true,  icon: '🐦' },
    { path: 'twitter.com/explore',     label: 'Explore / Trending', distracting: true, icon: '🔥' },
    { path: 'twitter.com/home',        label: 'Home Feed',        distracting: true,  icon: '🏠' },
    { path: 'twitter.com/messages',    label: 'Direct Messages',  distracting: false, icon: '💬' },
  ],
  'x.com': [
    { path: 'x.com',                   label: 'All of X',         distracting: true,  icon: '✖' },
    { path: 'x.com/explore',           label: 'Explore',          distracting: true,  icon: '🔥' },
    { path: 'x.com/home',              label: 'Home Feed',        distracting: true,  icon: '🏠' },
    { path: 'x.com/messages',          label: 'Direct Messages',  distracting: false, icon: '💬' },
  ],
  'instagram.com': [
    { path: 'instagram.com',           label: 'All of Instagram', distracting: true,  icon: '📸' },
    { path: 'instagram.com/reels',     label: 'Reels',            distracting: true,  icon: '🎞️' },
    { path: 'instagram.com/explore',   label: 'Explore',          distracting: true,  icon: '🧭' },
    { path: 'instagram.com/direct',    label: 'Direct Messages',  distracting: false, icon: '💬' },
  ],
  'facebook.com': [
    { path: 'facebook.com',            label: 'All of Facebook',  distracting: true,  icon: '👥' },
    { path: 'facebook.com/reels',      label: 'Reels',            distracting: true,  icon: '🎞️' },
    { path: 'facebook.com/watch',      label: 'Watch',            distracting: true,  icon: '📺' },
    { path: 'facebook.com/gaming',     label: 'Gaming',           distracting: true,  icon: '🎮' },
    { path: 'facebook.com/messages',   label: 'Messenger',        distracting: false, icon: '💬' },
    { path: 'facebook.com/marketplace', label: 'Marketplace',     distracting: false, icon: '🛒' },
  ],
  'tiktok.com': [
    { path: 'tiktok.com',              label: 'All of TikTok',    distracting: true,  icon: '🎵' },
    { path: 'tiktok.com/foryou',       label: 'For You (FYP)',    distracting: true,  icon: '🎯' },
    { path: 'tiktok.com/explore',      label: 'Explore',          distracting: true,  icon: '🧭' },
    { path: 'tiktok.com/messages',     label: 'Messages',         distracting: false, icon: '💬' },
  ],
  'netflix.com': [
    { path: 'netflix.com',             label: 'All of Netflix',   distracting: true,  icon: '📺' },
    { path: 'netflix.com/browse',      label: 'Browse',           distracting: true,  icon: '🎬' },
    { path: 'netflix.com/latest',      label: 'New & Hot',        distracting: true,  icon: '🔥' },
  ],
  'twitch.tv': [
    { path: 'twitch.tv',               label: 'All of Twitch',    distracting: true,  icon: '🎮' },
    { path: 'twitch.tv/directory',     label: 'Browse streams',   distracting: true,  icon: '🧭' },
  ],
  'linkedin.com': [
    { path: 'linkedin.com',            label: 'All of LinkedIn',  distracting: false, icon: '💼' },
    { path: 'linkedin.com/feed',       label: 'Feed',             distracting: true,  icon: '📰' },
    { path: 'linkedin.com/jobs',       label: 'Jobs',             distracting: false, icon: '🔎' },
    { path: 'linkedin.com/messaging',  label: 'Messaging',        distracting: false, icon: '💬' },
    { path: 'linkedin.com/learning',   label: 'Learning',         distracting: false, icon: '🎓' },
  ],
  'amazon.com': [
    { path: 'amazon.com',              label: 'All of Amazon',    distracting: true,  icon: '📦' },
    { path: 'amazon.com/s',            label: 'Search / Browse',  distracting: true,  icon: '🔍' },
  ],
  'pinterest.com': [
    { path: 'pinterest.com',           label: 'All of Pinterest', distracting: true,  icon: '📌' },
    { path: 'pinterest.com/today',     label: 'Today',            distracting: true,  icon: '🗓️' },
    { path: 'pinterest.com/explore',   label: 'Explore',          distracting: true,  icon: '🧭' },
  ],
  'discord.com': [
    { path: 'discord.com',              label: 'All of Discord',  distracting: true,  icon: '💬' },
    { path: 'discord.com/channels',     label: 'Server Channels', distracting: true,  icon: '📢' },
    { path: 'discord.com/channels/@me', label: 'Direct Messages', distracting: false, icon: '💌' },
  ],
};

/**
 * Given a raw input string, extract the base domain and return
 * matching site sections (or []).
 */
export function getSectionsForInput(input) {
  if (!input || input.trim().length < 3) return [];
  const raw = input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');

  // Find the best matching domain key
  const matchedKey = Object.keys(SITE_SECTIONS).find(domain =>
    raw === domain || raw.startsWith(domain + '/') || domain.startsWith(raw)
  );

  return matchedKey ? SITE_SECTIONS[matchedKey] : [];
}
