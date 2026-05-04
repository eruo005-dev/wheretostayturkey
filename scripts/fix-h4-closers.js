// Fix orphan </h4> tags after the bulk <h4> → <h3 class="card-h"> rename.
// Targets only the lines where the opener was rewritten (those have
// 'class="card-h"' nearby) — leaves all unrelated </h4> alone.
const fs = require("fs");
const file = "build.js";
const raw = fs.readFileSync(file, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(eol);
let changed = 0;
for (let i = 0; i < lines.length; i++) {
  if (/<h3 class="card-h"/.test(lines[i]) && /<\/h4>/.test(lines[i])) {
    const before = lines[i];
    lines[i] = lines[i].replace(/<\/h4>/, "</h3>");
    if (lines[i] !== before) changed++;
  }
}
fs.writeFileSync(file, lines.join(eol), "utf8");
console.log(`Fixed ${changed} orphan </h4> closers`);
