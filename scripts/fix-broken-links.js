// One-shot data migration: rewrite broken/legacy internal paths in JSON data files.
const fs = require("fs");

const replacements = [
  ["/safety/",                                          "/is-turkey-safe/"],
  ["/transport-istanbul-cappadocia/",                   "/istanbul-to-cappadocia/"],
  ["/oludeniz/",                                        "/fethiye/"],
  ["/cesme/",                                           "/izmir/"],
  ['href=\\"/cesme\\"',                                 'href=\\"/izmir/\\"'],
  ['href="/cesme"',                                     'href="/izmir/"'],
  ["/cities-extras/black-sea/",                         "/regions/black-sea/"],
  ["/cities-extras/black-sea",                          "/regions/black-sea/"],
  ["/experiences/cay-as-currency/",                     "/culture/cay-as-currency/"],
  ["/experiences/imece-collective-work/",               "/culture/imece-collective-work/"],
  ["/experiences/kolay-gelsin-the-everyday-blessing/",  "/culture/kolay-gelsin-the-everyday-blessing/"],
  ["/experiences/mahalle-the-turkish-neighborhood/",    "/culture/mahalle-the-turkish-neighborhood/"],
  ["/experiences/misafirperverlik-turkish-hospitality/","/culture/misafirperverlik-turkish-hospitality/"],
  ['href="/tours/"',                                    'href="/experiences/"'],
  ['href=\\"/tours/\\"',                                'href=\\"/experiences/\\"'],
];

const targetFiles = [
  "data/journal-posts.json",
  "data/cultural-concepts.json",
  "data/experiences.json",
  "data/journal-additions.json",
  "data/months.json",
  "data/how-to-guides.json",
  "data/journal-round-2.json",
  "data/cities.json",
  "data/cities-extras-1.json",
  "data/cities-extras-2.json",
  "data/cities-extras-3.json",
  "data/collections.json",
  "data/day-trips.json",
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let totalReplaced = 0;
for (const f of targetFiles) {
  if (!fs.existsSync(f)) continue;
  const before = fs.readFileSync(f, "utf8");
  let after = before;
  let fileCount = 0;
  for (const [from, to] of replacements) {
    const re = new RegExp(escapeRegex(from), "g");
    const matches = (after.match(re) || []).length;
    if (matches) {
      after = after.replace(re, to);
      fileCount += matches;
    }
  }
  if (after !== before) {
    try {
      JSON.parse(after);
      fs.writeFileSync(f, after, "utf8");
      console.log(`${f}: ${fileCount} replacements`);
      totalReplaced += fileCount;
    } catch (e) {
      console.error(`${f}: JSON invalid after replace — NOT writing. ${e.message}`);
    }
  }
}
console.log(`\nTotal: ${totalReplaced} replacements across data files`);
