#!/usr/bin/env node
/**
 * A11y survey — heuristic pass that flags common WCAG violations across
 * the built site. Not a substitute for axe-core, but cheap and runs in
 * Node with zero deps. Fails the build (exit 1) when any P0 issue is
 * found.
 *
 * Checks:
 *  - <img> missing alt
 *  - <a> with no accessible name (no text, no aria-label, no title)
 *  - <button> with no accessible name
 *  - <input> without an associated <label> or aria-label
 *  - Anchor text "click here" / "read more" / "learn more" without
 *    additional context
 *  - <html> missing lang attribute
 *  - Headings out of sequence (e.g. h1 then h3)
 *  - icon-only links/buttons (only emoji/svg child) without aria-label
 *  - Empty <a href>
 */
const fs = require("fs");
const path = require("path");
const SITE = path.join(__dirname, "..", "site");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const issues = {
  imgNoAlt: [],
  emptyAnchor: [],
  noNameAnchor: [],
  noNameButton: [],
  inputNoLabel: [],
  weakAnchor: [],
  missingLang: [],
  badHeadingOrder: [],
};

const WEAK_ANCHORS = ["click here", "read more", "learn more", "here", "more"];

function rel(p) { return p.replace(/\\/g, "/").replace(/^.*\/site\//, ""); }

for (const file of walk(SITE)) {
  const html = fs.readFileSync(file, "utf8");
  const r = rel(file);

  if (!/<html[^>]*\blang=/i.test(html)) issues.missingLang.push(r);

  // <img> missing alt
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  for (const img of imgs) {
    if (!/\balt=/i.test(img)) issues.imgNoAlt.push(`${r}: ${img.slice(0, 120)}`);
  }

  // <a> empty href or no accessible name
  const anchors = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) || [];
  for (const a of anchors) {
    const opening = a.match(/<a\b[^>]*>/)[0];
    const inner = a.slice(opening.length, -4); // strip </a>
    const innerText = inner.replace(/<[^>]+>/g, "").replace(/&\w+;/g, " ").trim();
    const hasAriaLabel = /\baria-label=/i.test(opening);
    const hasTitle = /\btitle=/i.test(opening);
    const innerImgAlt = inner.match(/<img\b[^>]*\balt="([^"]+)"/i);
    const accessibleName = innerText || hasAriaLabel || hasTitle || (innerImgAlt && innerImgAlt[1]);
    if (!accessibleName && innerText.length === 0 && !inner.match(/<svg/i)) {
      issues.emptyAnchor.push(`${r}: ${a.slice(0, 100)}`);
    } else if (!innerText && /<svg|<i\s+class|emoji/.test(inner) && !hasAriaLabel && !hasTitle) {
      // icon-only without label
      issues.noNameAnchor.push(`${r}: ${a.slice(0, 100)}`);
    } else if (innerText && WEAK_ANCHORS.includes(innerText.toLowerCase().replace(/[→←–—]/g, "").trim())) {
      issues.weakAnchor.push(`${r}: "${innerText}"`);
    }
  }

  // <button> with no name
  const buttons = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
  for (const b of buttons) {
    const opening = b.match(/<button\b[^>]*>/)[0];
    const inner = b.slice(opening.length, -9);
    const innerText = inner.replace(/<[^>]+>/g, "").trim();
    const hasAriaLabel = /\baria-label=/i.test(opening);
    if (!innerText && !hasAriaLabel) issues.noNameButton.push(`${r}: ${b.slice(0, 100)}`);
  }

  // <input> without label or aria-label
  const inputs = html.match(/<input\b[^>]*\/?>/gi) || [];
  for (const i of inputs) {
    if (/type="(hidden|submit|button|reset|image)"/i.test(i)) continue;
    const idMatch = i.match(/\bid="([^"]+)"/i);
    const ariaLabel = /\baria-label=/i.test(i);
    const ariaLabelledBy = /\baria-labelledby=/i.test(i);
    const placeholder = /\bplaceholder=/i.test(i);
    let hasFor = false;
    if (idMatch) hasFor = html.includes(`for="${idMatch[1]}"`);
    if (!ariaLabel && !ariaLabelledBy && !hasFor && !placeholder) {
      issues.inputNoLabel.push(`${r}: ${i.slice(0, 100)}`);
    }
  }

  // Heading order (h1 → h2 → h3, no skips downward beyond +1)
  const headings = (html.match(/<h([1-6])\b/gi) || []).map((m) => parseInt(m.replace(/<h/i, ""), 10));
  let prev = 0;
  for (const h of headings) {
    if (prev && h > prev + 1) {
      issues.badHeadingOrder.push(`${r}: h${prev} → h${h}`);
      break; // one report per file
    }
    prev = h;
  }
}

let fail = 0;
function report(label, list, severe = false) {
  console.log(`\n=== ${label} (${list.length}) ===`);
  if (list.length === 0) {
    console.log("  ✓ none");
    return;
  }
  list.slice(0, 12).forEach((x) => console.log("  " + x));
  if (list.length > 12) console.log(`  ... and ${list.length - 12} more`);
  if (severe) fail += list.length;
}

report("Images missing alt", issues.imgNoAlt, true);
report("<html> missing lang", issues.missingLang, true);
report("Empty anchors", issues.emptyAnchor, true);
report("Buttons with no accessible name", issues.noNameButton, true);
report("Inputs missing label/aria-label", issues.inputNoLabel, true);
report("Icon-only anchors without aria-label", issues.noNameAnchor);
report("Weak anchor text (click here / read more)", issues.weakAnchor);
report("Heading-order issues (e.g. h1 → h3)", issues.badHeadingOrder);

console.log("\n=== Summary ===");
console.log(`  Severe (fail): ${fail}`);
if (fail > 0) {
  console.error(`\n✗ ${fail} severe a11y violation(s).`);
  process.exit(1);
}
console.log("\n✓ No severe a11y violations.");
