// Round 3: add lead form (without affiliate strip) to the remaining 7 pages.
// All of them end with `${footer()}\n${tail()}` and have no ${essentialsBlock()}
// — we insert `${leadMagnet()}` immediately above ${footer()}.
const fs = require("fs");
const raw = fs.readFileSync("build.js", "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(eol);

// Page emit lines (writeFile call sites) — search backwards for ${footer()}
// and replace it with ${leadMagnet()}\n${footer()}.
// Reverse order so splices on later lines don't shift earlier targets.
const writeFileLines = [4463, 4390, 3660, 3626, 3562, 2087, 1434];
let changed = 0;

for (const wfLine of writeFileLines) {
  // Walk backwards from writeFile to find ${footer()}
  for (let i = wfLine - 2; i > wfLine - 30 && i >= 0; i--) {
    if (lines[i].trim() === "${footer()}") {
      lines.splice(i, 0, "${leadMagnet()}");
      changed++;
      break;
    }
  }
}

fs.writeFileSync("build.js", lines.join(eol), "utf8");
console.log(`Inserted ${changed}/${writeFileLines.length} lead-magnet calls`);
