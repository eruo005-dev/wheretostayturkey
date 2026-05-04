// One-shot: extend lead-capture form to high-engagement guide / collection
// pages by swapping ${essentialsBlock()} for ${leadAndEssentials()} at the
// targeted page-render sites in build.js.
const fs = require("fs");
const raw = fs.readFileSync("build.js", "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(eol);
const targets = [1721, 1816, 2138, 2188, 2237, 2301, 2368, 2433, 2530, 2593, 2640, 2673, 2736, 2798, 2937, 2982, 3029, 3065, 3122, 3173, 3203, 3280, 3351, 3399];
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
console.log(`Patched ${changed}/${targets.length} call sites (eol=${JSON.stringify(eol)})`);
