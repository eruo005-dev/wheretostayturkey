// Round 2: extend lead-capture to /guides/, /journal/, /planner/, /about/{author}/
const fs = require("fs");
const raw = fs.readFileSync("build.js", "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(eol);
const targets = [3441, 3904, 4139, 4193];
const FROM = "${essentialsBlock()}";
const TO = "${leadAndEssentials()}";
let changed = 0;
for (const t of targets) {
  const idx = t - 1;
  if (lines[idx].trim() === FROM) {
    lines[idx] = TO;
    changed++;
  } else {
    console.log(`MISS at line ${t}: "${lines[idx]}"`);
  }
}
fs.writeFileSync("build.js", lines.join(eol), "utf8");
console.log(`Patched ${changed}/${targets.length} call sites`);
