// Bulk fix: in JSON content data files, journal posts / culture concepts /
// experiences whose `bodyHtml` starts with <h3> get the FIRST heading
// promoted to <h2>. The page already renders an <h1> for the post title,
// so the bodyHtml's first major-section heading should be h2, not h3.
// Subsequent h3s within the body are correct (h2 → h3 nesting).
//
// Idempotent: skips entries whose bodyHtml already contains an <h2>.
//
// Files:
//   data/journal-posts.json
//   data/cultural-concepts.json
//   data/experiences.json
const fs = require("fs");

const FILES = {
  "data/journal-posts.json": "posts",
  "data/cultural-concepts.json": "concepts",
  "data/experiences.json": "experiences",
};

let total = 0;
for (const [file, key] of Object.entries(FILES)) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = doc[key];
  if (!list) continue;
  let changed = 0;
  for (const item of list) {
    if (typeof item.bodyHtml !== "string") continue;
    // Already has an <h2> somewhere — leave it alone.
    if (/<h2[\s>]/i.test(item.bodyHtml)) continue;
    // Check for ANY <h3> (anywhere — not just leading).
    if (!/<h3[\s>]/i.test(item.bodyHtml)) continue;
    // Promote ALL <h3>s in this article to <h2>. They're the post's
    // main section breaks; with the surrounding <h1> page title they're
    // h2 in the document outline.
    item.bodyHtml = item.bodyHtml
      .replace(/<h3(\s[^>]*)?>/gi, "<h2$1>")
      .replace(/<\/h3>/gi, "</h2>");
    changed++;
  }
  if (changed > 0) {
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
    console.log(`${file}: promoted h3 → h2 in ${changed} entr${changed === 1 ? "y" : "ies"}`);
    total += changed;
  }
}
console.log(`\nTotal: ${total} bodyHtml fields updated`);
