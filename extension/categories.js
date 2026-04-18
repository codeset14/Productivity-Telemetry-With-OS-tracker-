/**
 * categories.js
 * Domain → category classification map.
 * Used by both the extension background worker and the dashboard.
 */

const PRODUCTIVE_DOMAINS = [
  "github.com", "gitlab.com", "bitbucket.org",
  "stackoverflow.com", "stackexchange.com",
  "developer.mozilla.org", "docs.google.com",
  "notion.so", "obsidian.md", "roamresearch.com",
  "figma.com", "sketch.com", "adobe.com",
  "coursera.org", "udemy.com", "edx.org", "khanacademy.org",
  "leetcode.com", "hackerrank.com", "codewars.com",
  "medium.com", "dev.to", "hashnode.com",
  "vercel.com", "netlify.com", "heroku.com",
  "npmjs.com", "pypi.org",
  "wikipedia.org", "britannica.com",
  "linear.app", "jira.atlassian.com", "trello.com", "asana.com",
  "google.com", "google.co.in",
  "chat.openai.com", "claude.ai", "gemini.google.com",
  "replit.com", "codesandbox.io", "codepen.io",
  "vscode.dev", "github.dev",
  "digitalocean.com", "aws.amazon.com", "console.cloud.google.com",
];

const DISTRACTING_DOMAINS = [
  "youtube.com", "youtu.be",
  "twitter.com", "x.com",
  "instagram.com",
  "facebook.com", "fb.com",
  "reddit.com",
  "tiktok.com",
  "snapchat.com",
  "pinterest.com",
  "twitch.tv",
  "netflix.com", "primevideo.com", "hotstar.com", "hulu.com",
  "9gag.com", "buzzfeed.com",
  "tumblr.com",
  "discord.com",
  "whatsapp.com", "web.whatsapp.com",
  "telegram.org", "web.telegram.org",
  "gaming.amazon.com", "steampowered.com",
  "espn.com", "sportsbettingdime.com",
  "ebay.com", "amazon.com", "flipkart.com", "myntra.com",
  "quora.com",
  "buzzfeed.com", "dailymail.co.uk",
];

/**
 * Returns the category for a given hostname.
 * @param {string} hostname - e.g. "github.com" or "www.youtube.com"
 * @returns {"productive" | "distracting" | "neutral"}
 */
function categorize(hostname) {
  const clean = hostname.replace(/^www\./, "").toLowerCase();

  for (const domain of PRODUCTIVE_DOMAINS) {
    if (clean === domain || clean.endsWith("." + domain)) {
      return "productive";
    }
  }
  for (const domain of DISTRACTING_DOMAINS) {
    if (clean === domain || clean.endsWith("." + domain)) {
      return "distracting";
    }
  }
  return "neutral";
}

// Export for use in extension modules (background.js, popup.js)
if (typeof module !== "undefined") {
  module.exports = { categorize, PRODUCTIVE_DOMAINS, DISTRACTING_DOMAINS };
}
