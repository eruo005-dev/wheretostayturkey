// One-shot: replace the safe HTML minifier with a more aggressive version
// that collapses inter-element whitespace too. Preserves <pre>/<textarea>/
// <script>/<style> contents verbatim.
const fs = require("fs");
const raw = fs.readFileSync("build.js", "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

const lines = raw.split(eol);
// Find the minifier block: starts with "// Safe HTML minifier:" comment,
// ends with the function's closing brace.
let start = lines.findIndex((l) => l.includes("Safe HTML minifier"));
if (start < 0) { console.error("could not find minifier block"); process.exit(1); }
let end = lines.findIndex((l, i) => i > start && l.trim() === "}");
if (end < 0) { console.error("could not find end of minifier"); process.exit(1); }
// Find the comment-line BEFORE the start so we replace the whole block
while (start > 0 && lines[start - 1].trim().startsWith("//")) start--;

const replacement = [
  "// Safe HTML minifier. Stashes contents of <pre>, <textarea>, <script>, and",
  "// <style> tags verbatim so embedded JS / CSS / pre-formatted text are",
  "// preserved, then collapses whitespace between and inside tags. Drops",
  "// HTML comments (except IE conditional <!--[if ...]-->). ~15-25% reduction",
  "// on this site. Idempotent.",
  "function minifyHtml(html) {",
  "  if (!html || html.length < 200) return html;",
  "  const placeholders = [];",
  "  const stash = (re) => {",
  "    html = html.replace(re, (m) => {",
  "      const i = placeholders.push(m) - 1;",
  "      // Surround with a marker that survives whitespace collapse.",
  "      return `\\u0001${i}\\u0001`;",
  "    });",
  "  };",
  "  stash(/<pre[\\s\\S]*?<\\/pre>/gi);",
  "  stash(/<textarea[\\s\\S]*?<\\/textarea>/gi);",
  "  stash(/<script[\\s\\S]*?<\\/script>/gi);",
  "  stash(/<style[\\s\\S]*?<\\/style>/gi);",
  "",
  "  html = html",
  "    .replace(/\\r\\n?/g, \"\\n\")",
  "    .replace(/<!--(?!\\[if)[\\s\\S]*?-->/g, \"\")  // strip non-conditional comments",
  "    .replace(/[ \\t]+/g, \" \")                    // collapse runs of horizontal ws",
  "    .replace(/ ?\\n ?/g, \"\\n\")                  // trim spaces around newlines",
  "    .replace(/\\n+/g, \"\\n\")                     // collapse blank lines",
  "    .replace(/>\\s+</g, \"><\")                    // drop whitespace between tags",
  "    .replace(/\\s+(?=<\\/(?:html|head|body|main|article|section|header|footer|nav|aside|div|ul|ol|li|h[1-6]|p|table|tr|td|th|thead|tbody|figure|figcaption|form|hr|br)\\b)/gi, \"\")",
  "    .replace(/(<(?:html|head|body|main|article|section|header|footer|nav|aside|div|ul|ol|li|h[1-6]|p|table|tr|td|th|thead|tbody|figure|figcaption|form|hr|br)\\b[^>]*>)\\s+/gi, \"$1\")",
  "    .replace(/  +/g, \" \")",
  "    .trim();",
  "",
  "  // Restore stashed blocks. Marker is \\u0001N\\u0001.",
  "  html = html.replace(/\\u0001(\\d+)\\u0001/g, (_, i) => placeholders[+i]);",
  "  return html;",
  "}",
];

const out = [...lines.slice(0, start), ...replacement, ...lines.slice(end + 1)];
fs.writeFileSync("build.js", out.join(eol), "utf8");
console.log(`Replaced minifier (lines ${start + 1}–${end + 1}, ${end - start + 1} lines → ${replacement.length} lines)`);
