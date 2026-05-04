#!/usr/bin/env node
/**
 * Broken-link check for the built `site/` tree. Walks every HTML file,
 * extracts internal hrefs (starting with /), verifies each one resolves
 * to a file or directory + index.html. Exits 1 if any link is broken.
 *
 * Skips:
 *  - JS template literals like `/${slug}/` (fragments only emitted in
 *    inline <script> blocks)
 *  - external URLs (http/https/mailto/tel/javascript)
 *  - in-page fragments (#anchor only)
 *
 * Used both locally (after `npm run build`) and in CI to fail PRs that
 * introduce broken internal links.
 */
const fs = require("fs");
const path = require("path");

const SITE = path.join(__dirname, "..", "site");
if (!fs.existsSync(SITE)) {
  console.error(`No site/ directory. Run \`npm run build\` first.`);
  process.exit(1);
}

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.name.endsWith(".html")) files.push(p);
  }
  return files;
}

function rel(p) { return p.replace(/\\/g, "/").replace(/^.*\/site\//, "site/"); }

const htmlFiles = walk(SITE);

// Collect every internal href across the build, skipping JS template
// fragments (`/${...}/`, `/${a.slug}/`) which are valid in <script> bodies.
const TEMPLATE_FRAGMENT = /['"]\s*\+|\$\{|`/;
const refs = new Map(); // href → set of source pages

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const matches = html.match(/href="(\/[^"#?]*)"/g) || [];
  for (const m of matches) {
    const href = m.slice(6, -1);
    if (!href.startsWith("/")) continue;
    if (TEMPLATE_FRAGMENT.test(href)) continue;
    if (!refs.has(href)) refs.set(href, new Set());
    refs.get(href).add(rel(file));
  }
}

const broken = [];
for (const [href, sources] of refs) {
  let resolved;
  if (href.endsWith("/")) {
    resolved = path.join(SITE, href, "index.html");
  } else if (path.extname(href)) {
    resolved = path.join(SITE, href);
  } else {
    // /foo (no trailing slash) — try /foo/index.html OR /foo as file
    const asDir = path.join(SITE, href, "index.html");
    const asFile = path.join(SITE, href);
    resolved = fs.existsSync(asDir) ? asDir : asFile;
  }
  if (!fs.existsSync(resolved)) {
    broken.push({ href, sources: Array.from(sources).slice(0, 4) });
  }
}

console.log(`Scanned ${htmlFiles.length} HTML files, ${refs.size} unique internal hrefs.`);

if (broken.length === 0) {
  console.log("✓ No broken internal links.");
  process.exit(0);
}

console.error(`\n✗ ${broken.length} broken internal href(s):`);
for (const b of broken.slice(0, 30)) {
  console.error(`  ${b.href}`);
  for (const s of b.sources) console.error(`      from: ${s}`);
}
if (broken.length > 30) console.error(`  ... and ${broken.length - 30} more`);
process.exit(1);
