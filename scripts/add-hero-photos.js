// One-shot: populate `heroImage` field on cities with verified Wikimedia
// Commons URLs. Special:FilePath service redirects to the canonical CDN
// URL and supports a `width` thumbnail param — we don't need to know
// the file's MD5 hash path manually.
//
// All filenames below were verified via Wikimedia Commons search to exist
// (May 2026). Photos are CC-BY-SA or PD per Wikimedia's licensing terms;
// attribution lives in /about/#photo-credits.
const fs = require("fs");
const path = require("path");

// Wikimedia filename → photo credit. The cdn URL is built via
// Special:FilePath which is the canonical, redirect-stable embed pattern.
const HERO_PHOTOS = {
  istanbul:   { file: "Side_view_of_Hagia_Sophia.JPG",            credit: "Hagia Sophia / Wikimedia Commons" },
  cappadocia: { file: "Hot_air_balloon_over_Cappadocia,_Turkey.JPG", credit: "Cappadocia balloons / Wikimedia Commons" },
  pamukkale:  { file: "Pamukkale_Hierapolis_Travertine_pools.JPG", credit: "Pamukkale travertines / Wikimedia Commons" },
  bodrum:     { file: "Bodrum_castle_3.JPG",                       credit: "Bodrum Castle / Wikimedia Commons" },
  izmir:      { file: "Celsus_library_in_Ephesus.JPG",             credit: "Library of Celsus, Ephesus / Wikimedia Commons" },
};

function buildUrl(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1600`;
}

const DATA_DIR = path.join(__dirname, "..", "data");
const files = fs.readdirSync(DATA_DIR).filter((f) => /^cities.*\.json$/.test(f));

let total = 0;
for (const f of files) {
  const full = path.join(DATA_DIR, f);
  const doc = JSON.parse(fs.readFileSync(full, "utf8"));
  if (!doc.cities) continue;
  let dirty = false;
  for (const city of doc.cities) {
    const photo = HERO_PHOTOS[city.slug];
    if (!photo) continue;
    if (city.heroImage && city.heroImage === buildUrl(photo.file)) continue;
    city.heroImage = buildUrl(photo.file);
    city.heroImageCredit = photo.credit;
    console.log(`✓ ${city.slug}: ${photo.file}`);
    dirty = true;
    total++;
  }
  if (dirty) {
    fs.writeFileSync(full, JSON.stringify(doc, null, 2) + "\n", "utf8");
    console.log(`  wrote ${f}`);
  }
}
console.log(`\nWired ${total} city hero photos.`);
