// Round 4: swap ${essentialsBlock()} for ${leadAndEssentials()} on /quiz/
// and /compare/ — these have an essentials block already and need a form
// added above it.
const fs = require("fs");
const raw = fs.readFileSync("build.js", "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(eol);
const targets = [1992, 4350];
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
