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
// All filenames verified to exist on Wikimedia Commons (May 2026).
const HERO_PHOTOS = {
  istanbul:   { file: "Side_view_of_Hagia_Sophia.JPG",                              credit: "Hagia Sophia / Wikimedia Commons" },
  cappadocia: { file: "Hot_air_balloon_over_Cappadocia,_Turkey.JPG",                credit: "Cappadocia balloons / Wikimedia Commons" },
  pamukkale:  { file: "Pamukkale_Hierapolis_Travertine_pools.JPG",                  credit: "Pamukkale travertines / Wikimedia Commons" },
  bodrum:     { file: "Bodrum_castle_3.JPG",                                        credit: "Bodrum Castle / Wikimedia Commons" },
  izmir:      { file: "Celsus_library_in_Ephesus.JPG",                              credit: "Library of Celsus, Ephesus / Wikimedia Commons" },
  antalya:    { file: "Antalya - Kaleiçi.JPG",                                      credit: "Kaleiçi, Antalya / Wikimedia Commons" },
  fethiye:    { file: "Oludeniz-beach.JPG",                                         credit: "Ölüdeniz beach, Fethiye / Wikimedia Commons" },
  marmaris:   { file: "Marmaris old town near castle.JPG",                          credit: "Marmaris old town / Wikimedia Commons" },
  trabzon:    { file: "Sumela From Across Valley.JPG",                              credit: "Sumela Monastery, Trabzon / Wikimedia Commons" },
  alanya:     { file: "Red tower and harbour From Alanya castle-Antalya - panoramio.jpg", credit: "Red Tower & harbour, Alanya / Wikimedia Commons" },
  mersin:     { file: "Kızkalesi and Kızkalesi Beach, Erdemli, Mersin.jpg",         credit: "Kızkalesi (Maiden's Castle), Mersin / Wikimedia Commons" },
  rize:       { file: "Ayder Yaylasi @ Rize-Turkey.JPG",                            credit: "Ayder yayla, Rize / Wikimedia Commons" },
  ankara:     { file: "Anıtkabir in Ankara Turkey by Mardetanha (73).JPG",          credit: "Anıtkabir, Ankara / Wikimedia Commons" },
  gaziantep:  { file: "Gaziantep Zeugma Museum Dionysos Triumf mosaic 1921.jpg",    credit: "Zeugma mosaics, Gaziantep / Wikimedia Commons" },
  bursa:      { file: "Yeşil camii bursa - panoramio (14).jpg",                     credit: "Yeşil Cami, Bursa / Wikimedia Commons" },
  konya:      { file: "Mevlana Museum (Green Mausoleum) in Konya Turkey By Mardetanha (41).JPG", credit: "Mevlana Museum, Konya / Wikimedia Commons" },
  sanliurfa:  { file: "Göbekli Tepe surrounding area.JPG",                          credit: "Göbekli Tepe, Şanlıurfa / Wikimedia Commons" },
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
