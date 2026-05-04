// SEO survey: list every page with a too-long title or short/long
// meta description, plus pages missing JSON-LD or og:image.
const fs = require("fs"), path = require("path");
function walk(d, files = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.name.endsWith(".html")) files.push(p);
  }
  return files;
}

const longTitles = [];
const shortDesc = [];
const longDesc = [];
const noLd = [];
const noOg = [];

for (const p of walk("site")) {
  const rel = p.replace(/\\/g, "/").replace(/^site\//, "");
  const html = fs.readFileSync(p, "utf8");
  const t = html.match(/<title>([^<]*)<\/title>/);
  const d = html.match(/<meta name="description" content="([^"]*)"/);
  if (t && t[1].length > 70) longTitles.push({ rel, len: t[1].length, title: t[1] });
  if (d) {
    if (d[1].length < 100) shortDesc.push({ rel, len: d[1].length, desc: d[1] });
    if (d[1].length > 170) longDesc.push({ rel, len: d[1].length, desc: d[1] });
  }
  if (!html.includes("application/ld+json")) noLd.push(rel);
  if (!html.includes('property="og:image"')) noOg.push(rel);
}

console.log("\n=== TOO-LONG TITLES (>70 chars), " + longTitles.length + " ===");
longTitles.sort((a, b) => b.len - a.len).forEach((x) => console.log(`  ${x.len} | ${x.rel}\n        | ${x.title}`));

console.log("\n=== SHORT META DESC (<100 chars), " + shortDesc.length + " ===");
shortDesc.sort((a, b) => a.len - b.len).slice(0, 60).forEach((x) => console.log(`  ${x.len} | ${x.rel}\n        | ${x.desc}`));

console.log("\n=== LONG META DESC (>170 chars), " + longDesc.length + " ===");
longDesc.sort((a, b) => b.len - a.len).forEach((x) => console.log(`  ${x.len} | ${x.rel}\n        | ${x.desc.slice(0, 200)}`));

console.log("\n=== PAGES WITHOUT JSON-LD (" + noLd.length + ") ===");
noLd.forEach((x) => console.log("  " + x));

console.log("\n=== PAGES WITHOUT OG:IMAGE (" + noOg.length + ") ===");
noOg.forEach((x) => console.log("  " + x));
