#!/usr/bin/env node
/**
 * IndexNow submission. Reads the live sitemap, submits up to 10,000 URLs
 * per batch to api.indexnow.org. Operator runs this after each deploy so
 * Bing / Yandex / Seznam / Naver pick up changes within seconds instead
 * of days.
 *
 * Usage:
 *   node scripts/indexnow-ping.js
 *   node scripts/indexnow-ping.js --dry-run    # preview without sending
 *
 * Caveats:
 *   - Google does NOT support IndexNow. Use Search Console for Google.
 *   - The key in site.config.js must match a file served at
 *     https://yoursite.com/{key}.txt — the build emits this automatically.
 *   - Hammering IndexNow with the full sitemap on every commit is fine
 *     short-term (the protocol is built for it) but rate limits exist.
 *     For a healthy cadence, run after each prod deploy, not on each push.
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const config = require(path.join(__dirname, "..", "site.config.js"));
const dryRun = process.argv.includes("--dry-run");

if (!config.indexnowKey) {
  console.error("No indexnowKey in site.config.js. Aborting.");
  process.exit(1);
}

const sitemapPath = path.join(__dirname, "..", "site", "sitemap.xml");
if (!fs.existsSync(sitemapPath)) {
  console.error(`Missing ${sitemapPath}. Run \`npm run build\` first.`);
  process.exit(1);
}

const xml = fs.readFileSync(sitemapPath, "utf8");
const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);

console.log(`Found ${urls.length} URLs in sitemap.`);

if (dryRun) {
  console.log("--dry-run set; not sending. First 5 URLs:");
  urls.slice(0, 5).forEach((u) => console.log("  " + u));
  process.exit(0);
}

const host = new URL(config.siteUrl).hostname;
const payload = JSON.stringify({
  host,
  key: config.indexnowKey,
  keyLocation: `${config.siteUrl}/${config.indexnowKey}.txt`,
  urlList: urls,
});

const opts = {
  method: "POST",
  hostname: "api.indexnow.org",
  path: "/indexnow",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "User-Agent": "wheretostayturkey-indexnow/1.0",
  },
};

const req = https.request(opts, (res) => {
  let body = "";
  res.setEncoding("utf8");
  res.on("data", (c) => (body += c));
  res.on("end", () => {
    console.log(`HTTP ${res.statusCode}: ${body || "(empty)"}`);
    if (res.statusCode === 200 || res.statusCode === 202) {
      console.log("✓ Submitted to IndexNow.");
    } else {
      console.error("✗ Submission failed.");
      process.exit(1);
    }
  });
});
req.on("error", (e) => {
  console.error("Network error:", e.message);
  process.exit(1);
});
req.write(payload);
req.end();
