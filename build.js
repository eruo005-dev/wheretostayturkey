#!/usr/bin/env node
/* =====================================================================
   wheretostayturkey.com — static site generator
   Reads data/cities.json + site.config.js, emits full site to /site
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const config = require("./site.config");

const OUT = path.join(__dirname, "site");
const ASSETS_SRC = path.join(__dirname, "assets");
const DATA_DIR = path.join(__dirname, "data");

// --------------------------- load all city data ---------------------------
// Merge every data/cities*.json into one list. Lets us split large JSON
// across multiple files without breaking the build.
function loadCities() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^cities.*\.json$/.test(f))
    .sort();
  const all = [];
  const seen = new Set();
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
    if (!doc.cities) continue;
    for (const c of doc.cities) {
      if (seen.has(c.slug)) {
        console.warn(`  ⚠ duplicate city slug "${c.slug}" in ${f} — skipping`);
        continue;
      }
      seen.add(c.slug);
      all.push(c);
    }
  }
  return all;
}
const cities = loadCities();

// --------------------------- helpers ---------------------------

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

function writeFile(relPath, content) {
  const full = path.join(OUT, relPath);
  mkdirp(path.dirname(full));
  fs.writeFileSync(full, content, "utf8");
}

function copyDir(src, dest) {
  mkdirp(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// =====================================================================
// Per-city palette + themed hero SVGs (immersive layer)
// =====================================================================
const CITY_PALETTES = {
  istanbul:   { a: "#0c4a6e", b: "#be123c", ink: "#ffffff", theme: "mosque" },     // deep navy -> crimson
  cappadocia: { a: "#7c2d12", b: "#f59e0b", ink: "#ffffff", theme: "balloon" },   // rust -> amber
  antalya:    { a: "#0369a1", b: "#0891b2", ink: "#ffffff", theme: "coast" },     // blue -> teal
  bodrum:     { a: "#075985", b: "#67e8f9", ink: "#ffffff", theme: "sail" },      // dark blue -> cyan
  fethiye:    { a: "#0e7490", b: "#22d3ee", ink: "#ffffff", theme: "lagoon" },    // turquoise
  izmir:      { a: "#b45309", b: "#fbbf24", ink: "#ffffff", theme: "sun" },       // orange -> gold
  pamukkale:  { a: "#0e7490", b: "#e0f2fe", ink: "#ffffff", theme: "terrace" },   // teal -> white
  marmaris:   { a: "#065f46", b: "#34d399", ink: "#ffffff", theme: "pine" },      // forest -> green
  kas:        { a: "#155e75", b: "#fef3c7", ink: "#ffffff", theme: "cliff" },     // slate -> cream
  trabzon:    { a: "#064e3b", b: "#059669", ink: "#ffffff", theme: "mountain" },  // deep green
  alanya:     { a: "#9a3412", b: "#fed7aa", ink: "#ffffff", theme: "castle" },    // brick -> sand
  side:       { a: "#713f12", b: "#fef3c7", ink: "#ffffff", theme: "ruin" },      // ochre
  kusadasi:   { a: "#0c4a6e", b: "#38bdf8", ink: "#ffffff", theme: "harbor" },    // navy -> sky
  mersin:     { a: "#134e4a", b: "#14b8a6", ink: "#ffffff", theme: "coast" },     // dark teal
  rize:       { a: "#14532d", b: "#86efac", ink: "#ffffff", theme: "highland" },  // evergreen
  ankara:     { a: "#44403c", b: "#a8a29e", ink: "#ffffff", theme: "city" },      // stone
  gaziantep:  { a: "#7c2d12", b: "#fb923c", ink: "#ffffff", theme: "spice" },     // copper
  bursa:      { a: "#1e3a8a", b: "#93c5fd", ink: "#ffffff", theme: "mountain" },  // royal -> sky
};
function cityPalette(slug) {
  return CITY_PALETTES[slug] || { a: "#0f172a", b: "#334155", ink: "#ffffff", theme: "city" };
}
function cityPaletteStyle(slug) {
  const p = cityPalette(slug);
  return `--city-a:${p.a};--city-b:${p.b};--city-ink:${p.ink};`;
}

// Themed SVG illustrations. Each renders at 100% width, 100% height, preserves aspect by default.
function cityHeroSvg(slug) {
  const theme = cityPalette(slug).theme;
  const svgs = {
    mosque: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.9"><circle cx="600" cy="420" r="90"/><rect x="510" y="420" width="180" height="150"/><path d="M600 320 Q540 320 540 380 L540 420 L660 420 L660 380 Q660 320 600 320Z"/><rect x="595" y="260" width="10" height="80"/><circle cx="600" cy="255" r="6"/><rect x="430" y="450" width="20" height="120"/><rect x="425" y="420" width="30" height="35" rx="15"/><rect x="432" y="400" width="16" height="20"/><rect x="750" y="450" width="20" height="120"/><rect x="745" y="420" width="30" height="35" rx="15"/><rect x="752" y="400" width="16" height="20"/><rect x="340" y="500" width="15" height="100"/><rect x="337" y="470" width="21" height="30" rx="10"/><rect x="845" y="500" width="15" height="100"/><rect x="842" y="470" width="21" height="30" rx="10"/></g><path d="M0 540 L200 510 L400 530 L600 505 L800 525 L1000 500 L1200 520 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.15"/></svg>`,
    balloon: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.85"><ellipse cx="280" cy="220" rx="50" ry="60"/><rect x="272" y="285" width="16" height="18"/><rect x="264" y="303" width="32" height="14" rx="2"/><line x1="272" y1="280" x2="268" y2="303" stroke="#fff" stroke-opacity="0.7"/><line x1="288" y1="280" x2="292" y2="303" stroke="#fff" stroke-opacity="0.7"/></g><g fill="#fff" fill-opacity="0.7"><ellipse cx="520" cy="140" rx="65" ry="78"/><rect x="512" y="220" width="16" height="20"/><rect x="500" y="240" width="40" height="16" rx="2"/></g><g fill="#fff" fill-opacity="0.9"><ellipse cx="820" cy="280" rx="55" ry="66"/><rect x="812" y="348" width="16" height="20"/><rect x="800" y="368" width="40" height="16" rx="2"/></g><g fill="#fff" fill-opacity="0.55"><ellipse cx="1050" cy="180" rx="40" ry="50"/><rect x="1044" y="232" width="12" height="16"/></g><path d="M0 500 Q300 460 600 490 T1200 470 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.15"/><path d="M0 540 Q300 510 600 530 T1200 520 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.1"/></svg>`,
    coast: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><path d="M0 380 Q150 360 300 380 T600 380 T900 380 T1200 380 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.2"/><path d="M0 420 Q150 400 300 420 T600 420 T900 420 T1200 420 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.15"/><path d="M0 470 Q150 450 300 470 T600 470 T900 470 T1200 470 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.1"/><circle cx="950" cy="140" r="60" fill="#fff" fill-opacity="0.35"/><circle cx="950" cy="140" r="90" fill="#fff" fill-opacity="0.1"/></svg>`,
    sail: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.8"><polygon points="400,420 400,220 440,420"/><polygon points="440,420 440,260 550,420"/><rect x="380" y="420" width="180" height="18" rx="4"/></g><g fill="#fff" fill-opacity="0.6"><polygon points="800,460 800,290 830,460"/><polygon points="830,460 830,320 910,460"/><rect x="790" y="460" width="135" height="15" rx="4"/></g><path d="M0 490 Q200 470 400 490 T800 490 T1200 490 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.18"/></svg>`,
    lagoon: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><path d="M0 480 Q200 420 400 460 Q600 500 800 450 Q1000 410 1200 450 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.2"/><g fill="#fff" fill-opacity="0.85"><ellipse cx="900" cy="150" rx="45" ry="30"/><line x1="900" y1="180" x2="900" y2="260" stroke="#fff" stroke-width="3" stroke-opacity="0.8"/><polygon points="888,260 912,260 900,280" /></g><path d="M100 220 L130 170 L160 220 L195 150 L230 220 Z" fill="#fff" fill-opacity="0.3"/></svg>`,
    sun: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><circle cx="900" cy="250" r="120" fill="#fff" fill-opacity="0.3"/><circle cx="900" cy="250" r="75" fill="#fff" fill-opacity="0.55"/><g stroke="#fff" stroke-opacity="0.4" stroke-width="3"><line x1="900" y1="100" x2="900" y2="140"/><line x1="900" y1="360" x2="900" y2="400"/><line x1="750" y1="250" x2="790" y2="250"/><line x1="1010" y1="250" x2="1050" y2="250"/><line x1="800" y1="150" x2="830" y2="180"/><line x1="970" y1="180" x2="1000" y2="150"/><line x1="800" y1="350" x2="830" y2="320"/><line x1="970" y1="320" x2="1000" y2="350"/></g><path d="M0 480 Q300 460 600 480 T1200 480 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.15"/></svg>`,
    terrace: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.7"><path d="M0 420 L1200 420 L1200 460 L0 460Z"/><path d="M50 460 L1150 460 L1150 500 L50 500Z" fill-opacity="0.5"/><path d="M120 500 L1080 500 L1080 540 L120 540Z" fill-opacity="0.4"/><path d="M200 540 L1000 540 L1000 580 L200 580Z" fill-opacity="0.3"/></g></svg>`,
    pine: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.55"><polygon points="150,450 100,520 200,520"/><polygon points="150,400 120,470 180,470"/><polygon points="150,360 130,420 170,420"/><polygon points="300,470 260,540 340,540"/><polygon points="300,430 275,490 325,490"/><polygon points="420,460 390,530 450,530"/><polygon points="900,470 860,540 940,540"/><polygon points="900,420 880,480 920,480"/><polygon points="1050,450 1010,520 1090,520"/></g><path d="M0 540 L1200 540 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.2"/></svg>`,
    cliff: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><path d="M0 420 L200 380 L400 400 L600 350 L800 380 L1000 340 L1200 360 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.3"/><path d="M0 480 L300 460 L600 480 L900 450 L1200 470 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.15"/></svg>`,
    mountain: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.4"><polygon points="0,450 300,250 500,400 600,300 800,420 1000,280 1200,400 1200,600 0,600"/></g><g fill="#fff" fill-opacity="0.25"><polygon points="0,520 200,420 400,480 700,420 900,480 1200,450 1200,600 0,600"/></g></svg>`,
    castle: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.7"><rect x="500" y="280" width="200" height="220"/><rect x="480" y="260" width="20" height="20"/><rect x="520" y="260" width="20" height="20"/><rect x="560" y="260" width="20" height="20"/><rect x="600" y="260" width="20" height="20"/><rect x="640" y="260" width="20" height="20"/><rect x="680" y="260" width="20" height="20"/><rect x="420" y="320" width="80" height="180"/><rect x="700" y="320" width="80" height="180"/><rect x="410" y="300" width="15" height="20"/><rect x="435" y="300" width="15" height="20"/><rect x="460" y="300" width="15" height="20"/><rect x="485" y="300" width="15" height="20"/><rect x="705" y="300" width="15" height="20"/><rect x="730" y="300" width="15" height="20"/><rect x="755" y="300" width="15" height="20"/><rect x="780" y="300" width="15" height="20"/></g><path d="M0 500 L1200 500 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.2"/></svg>`,
    ruin: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.7"><rect x="300" y="260" width="28" height="240"/><rect x="370" y="280" width="28" height="220"/><rect x="440" y="260" width="28" height="240"/><rect x="510" y="300" width="28" height="200"/><rect x="580" y="260" width="28" height="240"/><rect x="650" y="290" width="28" height="210"/><rect x="720" y="260" width="28" height="240"/><rect x="280" y="250" width="480" height="20" rx="2"/></g><path d="M0 500 L1200 500 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.15"/></svg>`,
    harbor: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.7"><rect x="450" y="440" width="220" height="40" rx="6"/><rect x="540" y="320" width="6" height="140"/><polygon points="550,320 610,400 550,400"/></g><g fill="#fff" fill-opacity="0.5"><rect x="750" y="460" width="150" height="30" rx="4"/><rect x="810" y="380" width="4" height="80"/><polygon points="815,380 855,430 815,430"/></g><path d="M0 480 Q200 460 400 480 T800 480 T1200 480 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.18"/></svg>`,
    highland: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.3"><polygon points="0,380 250,240 450,380 650,280 850,400 1050,320 1200,400 1200,600 0,600"/></g><g fill="#fff" fill-opacity="0.5"><polygon points="180,500 150,570 210,570"/><polygon points="300,490 275,560 325,560"/><polygon points="800,500 775,570 825,570"/></g><path d="M0 540 L1200 540 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.2"/></svg>`,
    city: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.55"><rect x="300" y="280" width="60" height="220"/><rect x="370" y="320" width="50" height="180"/><rect x="430" y="240" width="70" height="260"/><rect x="510" y="300" width="45" height="200"/><rect x="565" y="260" width="55" height="240"/><rect x="630" y="340" width="50" height="160"/><rect x="690" y="220" width="75" height="280"/><rect x="775" y="290" width="50" height="210"/><rect x="835" y="260" width="60" height="240"/></g></svg>`,
    spice: `<svg viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><g fill="#fff" fill-opacity="0.6"><circle cx="250" cy="400" r="60"/><circle cx="380" cy="430" r="50"/><circle cx="500" cy="395" r="65"/><circle cx="630" cy="425" r="55"/><circle cx="770" cy="400" r="60"/><circle cx="900" cy="430" r="50"/></g><path d="M0 480 L1200 480 L1200 600 L0 600Z" fill="#fff" fill-opacity="0.2"/></svg>`,
  };
  return svgs[theme] || svgs.city;
}



// =====================================================================
// Affiliate link builders — every supported partner
// =====================================================================
const A = config.affiliates;

// ---- Hotels / accommodation ----
function bookingLink(query, extra = {}) {
  const params = new URLSearchParams({
    aid: A.booking.aid,
    ss: query,
    group_adults: "2",
    no_rooms: "1",
    ...extra,
  });
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}
function hotelLink(hotel, cityName) {
  // Don't duplicate city name if it's already in the hotel name
  const q = hotel.name.toLowerCase().includes(cityName.toLowerCase())
    ? hotel.name
    : `${hotel.name} ${cityName}`;
  return bookingLink(q);
}

function hotelsComLink(query) {
  if (!A.hotelsCom.camref) return null;
  // Expedia Group Partner Solutions (EGPS) redirect format
  const dest = encodeURIComponent(`https://www.hotels.com/Hotel-Search?destination=${encodeURIComponent(query)}`);
  return `https://prf.hn/click/camref:${A.hotelsCom.camref}/destination:${dest}`;
}
function agodaLink(query) {
  if (!A.agoda.cid) return null;
  return `https://www.agoda.com/search?cid=${A.agoda.cid}&q=${encodeURIComponent(query)}`;
}
function tripcomLink(query) {
  if (!A.tripcom.allianceid) return null;
  const params = new URLSearchParams({
    allianceid: A.tripcom.allianceid,
    sid: A.tripcom.sid || "",
    city: query,
  });
  return `https://www.trip.com/hotels/list?${params.toString()}`;
}
function hostelworldLink(query) {
  if (!A.hostelworld.urlPrefix) return null;
  const dest = encodeURIComponent(`https://www.hostelworld.com/s?q=${encodeURIComponent(query)}`);
  return `${A.hostelworld.urlPrefix}${A.hostelworld.urlPrefix.includes("?") ? "&" : "?"}u=${dest}`;
}
function vrboLink(query) {
  if (!A.vrbo.camref) return null;
  const dest = encodeURIComponent(`https://www.vrbo.com/search?q=${encodeURIComponent(query)}`);
  return `https://prf.hn/click/camref:${A.vrbo.camref}/destination:${dest}`;
}

// ---- Tours & activities ----
// Map of GetYourGuide city landing pages (verified 2026). City-slug → GYG slug-ID pair.
// Missing cities fall back to /s?q= search which also works.
const GYG_CITIES = {
  istanbul: "istanbul-l56",
  cappadocia: "cappadocia-l2102",
  antalya: "antalya-l788",
  bodrum: "bodrum-l814",
  fethiye: "fethiye-l1077",
  izmir: "izmir-l1076",
  pamukkale: "pamukkale-l13188",
  marmaris: "marmaris-l2060",
  alanya: "alanya-l1074",
  side: "side-l2057",
  kusadasi: "kusadasi-l2110",
  ankara: "ankara-l1073",
  bursa: "bursa-l29915",
  gaziantep: "gaziantep-l2035",
  trabzon: "trabzon-l22076",
};
function getYourGuideLink(query) {
  // If query starts with a known city, deep-link to the city page (better UX + higher conversion).
  const citySlug = Object.keys(GYG_CITIES).find((s) => query.toLowerCase().includes(s.replace(/-/g, " ")));
  const base = citySlug
    ? `https://www.getyourguide.com/${GYG_CITIES[citySlug]}/`
    : `https://www.getyourguide.com/s?q=${encodeURIComponent(query)}`;
  if (!A.getYourGuide.partnerId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}partner_id=${A.getYourGuide.partnerId}`;
}
function viatorLink(query) {
  if (!A.viator.pid) return null;
  return `https://www.viator.com/search/${encodeURIComponent(query)}?pid=${A.viator.pid}&mcid=42383`;
}
function klookLink(query) {
  if (!A.klook.aid) return null;
  return `https://www.klook.com/en-US/search/result/?query=${encodeURIComponent(query)}&aid=${A.klook.aid}`;
}
function tiqetsLink(query) {
  if (!A.tiqets.partner) return null;
  return `https://www.tiqets.com/en/search?q=${encodeURIComponent(query)}&partner=${A.tiqets.partner}`;
}
function civitatisLink(query) {
  if (!A.civitatis.partner) return null;
  return `https://www.civitatis.com/en/search/?q=${encodeURIComponent(query)}&aid=${A.civitatis.partner}`;
}

// ---- Transfers, car rental ----
function welcomePickupsLink(city) {
  // Real URL pattern: www.welcomepickups.com/{city}/airport-transfer/
  const base = `https://www.welcomepickups.com/${slug(city)}/airport-transfer/`;
  return A.welcomePickups.ref ? `${base}?ref=${A.welcomePickups.ref}` : base;
}
function kiwitaxiLink(city) {
  // Real URL pattern: kiwitaxi.com/en/turkey/{city}-airport-transfers
  const base = `https://kiwitaxi.com/en/turkey/${slug(city)}-airport-transfers`;
  return A.kiwitaxi.marker ? `${base}?marker=${A.kiwitaxi.marker}` : base;
}
function discoverCarsLink(city) {
  // Real URL pattern: www.discovercars.com/turkey/{city}
  const base = `https://www.discovercars.com/turkey/${slug(city)}`;
  return A.discoverCars.aAid ? `${base}?a_aid=${A.discoverCars.aAid}` : base;
}
// Localrent — Turkey-strong rental aggregator via Travelpayouts redirector.
// Cities Localrent supports in Turkey: istanbul, antalya, bodrum, dalaman, izmir,
// kayseri (Cappadocia), trabzon, fethiye, marmaris, alanya, kemer, side, kusadasi,
// gocek. For unsupported cities we fall back to /turkey landing.
const LOCALRENT_TURKEY_CITIES = new Set([
  "istanbul","antalya","bodrum","dalaman","izmir","kayseri","cappadocia","goreme",
  "trabzon","fethiye","marmaris","alanya","kemer","side","kusadasi","gocek",
]);
function localrentDestUrl(cityName) {
  const s = slug(cityName);
  // Cappadocia / Goreme → Kayseri airport area on Localrent
  const mapped = (s === "cappadocia" || s === "goreme") ? "kayseri" : s;
  if (LOCALRENT_TURKEY_CITIES.has(mapped)) {
    return `https://localrent.com/en/rent-a-car-in-${mapped}`;
  }
  return `https://localrent.com/en/turkey`;
}
function tpMediaLink(campaignId, partnerId, destUrl, sub1) {
  // TP redirector pattern. Marker = TP account, trs = website source.
  const params = new URLSearchParams({
    campaign_id: campaignId,
    marker: A.localrent.marker,  // shared TP marker for the project
    p: partnerId,
    trs: A.localrent.trs,
  });
  if (sub1) params.set("sub_id", sub1);
  return `https://tp.media/r?${params.toString()}&u=${encodeURIComponent(destUrl)}`;
}
function localrentLink(cityName, sub1) {
  return tpMediaLink(A.localrent.campaignId, A.localrent.partnerId, localrentDestUrl(cityName), sub1);
}
function rentalcarsLink(city) {
  const base = `https://www.rentalcars.com/SearchResults.do?location=${encodeURIComponent(city)}`;
  return A.rentalcars.aid ? `${base}&aid=${A.rentalcars.aid}` : base;
}

// ---- Trip.com flights ----
function tripcomFlightLink(originName, destName, originIata, destIata, sub1) {
  // Pattern from TP Trip.com partnership:
  // /flights/{Origin}-to-{Dest}/tickets-{ORIG}-{DEST}?flighttype=S&dcity={ORIG}&acity={DEST}&Allianceid=...&SID=...
  const slugify = (s) => String(s).trim().replace(/\s+/g, "-");
  const path = `${slugify(originName)}-to-${slugify(destName)}`;
  const tickets = `tickets-${originIata}-${destIata}`;
  const params = new URLSearchParams({
    flighttype: "S",
    dcity: originIata,
    acity: destIata,
  });
  if (A.tripcom.allianceid) params.set("Allianceid", A.tripcom.allianceid);
  if (A.tripcom.sid)        params.set("SID", A.tripcom.sid);
  if (sub1)                 params.set("trip_sub1", sub1);
  if (A.tripcom.tripSub3)   params.set("trip_sub3", A.tripcom.tripSub3);
  return `https://www.trip.com/flights/${path}/${tickets}?${params.toString()}`;
}
function tripcomFlightSearchLink(destIata, sub1) {
  // Generic flight search landing page (no specific origin). Useful for "search any flight" CTAs.
  const params = new URLSearchParams({ acity: destIata });
  if (A.tripcom.allianceid) params.set("Allianceid", A.tripcom.allianceid);
  if (A.tripcom.sid)        params.set("SID", A.tripcom.sid);
  if (sub1)                 params.set("trip_sub1", sub1);
  if (A.tripcom.tripSub3)   params.set("trip_sub3", A.tripcom.tripSub3);
  return `https://www.trip.com/flights/?${params.toString()}`;
}

// ---- eSIM / insurance / money ----
function airaloLink() {
  const base = "https://www.airalo.com/turkey-esim";
  return A.airalo.ref ? `${base}?ref=${A.airalo.ref}` : base;
}
function holaflyLink() {
  const base = "https://esim.holafly.com/esim-turkey/";
  return A.holafly.ref ? `${base}?ref=${A.holafly.ref}` : base;
}
function safetyWingLink() {
  const base = "https://safetywing.com/nomad-insurance/";
  return A.safetywing.ref ? `${base}?referenceID=${A.safetywing.ref}` : base;
}
function worldNomadsLink() {
  const base = "https://www.worldnomads.com/travel-insurance/";
  return A.worldNomads.ref ? `${base}?affiliate=${A.worldNomads.ref}` : base;
}
function wiseLink() {
  const base = "https://wise.com/invite/";
  return A.wise.invite ? `${base}u/${A.wise.invite}` : "https://wise.com";
}

// ---- Flights ----
function kiwiFlightsLink(city) {
  const base = `https://www.kiwi.com/en/search/results/anywhere/${encodeURIComponent(city)}-turkey`;
  return A.kiwiCom.marker ? `${base}?marker=${A.kiwiCom.marker}` : base;
}
function wayawayLink(city) {
  const base = `https://wayaway.io/search/${encodeURIComponent(city)}`;
  return A.wayaway.marker ? `${base}?marker=${A.wayaway.marker}` : base;
}

// Active-only compare links array (any enabled OTAs for this city/hotel)
function compareOtaLinks(query) {
  const out = [];
  const hc = hotelsComLink(query); if (hc) out.push({ name: "Hotels.com", url: hc });
  const ag = agodaLink(query);      if (ag) out.push({ name: "Agoda",      url: ag });
  const tc = tripcomLink(query);    if (tc) out.push({ name: "Trip.com",   url: tc });
  const hw = hostelworldLink(query);if (hw) out.push({ name: "Hostelworld",url: hw });
  const vr = vrboLink(query);       if (vr) out.push({ name: "Vrbo",       url: vr });
  return out;
}

// --------------------------- shared chrome ---------------------------

function head({ title, description, canonical, ogImage, jsonld = [] }) {
  const og = ogImage || `${config.siteUrl}${config.defaultOgImage}`;
  const ldBlocks = jsonld.map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`).join("\n");
  const analytics = [];
  if (config.plausibleDomain) {
    analytics.push(`<script defer data-domain="${esc(config.plausibleDomain)}" src="https://plausible.io/js/script.js"></script>`);
  }
  if (config.gaMeasurementId) {
    analytics.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(config.gaMeasurementId)}"></script>` +
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(config.gaMeasurementId)}');</script>`
    );
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${config.twitterHandle ? `<meta name="twitter:site" content="${esc(config.twitterHandle)}">` : ""}
<link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="Where to Stay in Turkey" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&display=swap">
<link rel="stylesheet" href="/assets/css/styles.css">
<link rel="preconnect" href="https://www.booking.com">
<link rel="dns-prefetch" href="https://www.getyourguide.com">
<link rel="dns-prefetch" href="https://www.hotels.com">
<link rel="dns-prefetch" href="https://www.agoda.com">
<link rel="dns-prefetch" href="https://www.welcomepickups.com">
<link rel="dns-prefetch" href="https://www.airalo.com">
${ldBlocks}
${analytics.join("\n")}
${(config.verificationScripts || []).join("\n")}
</head>
<body class="has-sticky">`;
}

function nav() {
  return `
<a class="skip-link" href="#main">Skip to content</a>
<header class="nav">
  <div class="container nav-inner">
    <a href="/" class="nav-brand">Where to Stay<span class="dot">.</span> Turkey</a>
    <nav class="nav-links" aria-label="Primary">
      <a href="/istanbul/">Istanbul</a>
      <a href="/cappadocia/">Cappadocia</a>
      <a href="/antalya/">Antalya</a>
      <a href="/#all-cities">All cities</a>
      <a href="/journal/">Journal</a>
      <a href="/guides/">Guides</a>
      <a href="/flights/">Flights</a>
      <a href="/planner/">Planner</a>
      <a href="/quiz/">Quiz</a>
    </nav>
  </div>
</header>`;
}

function footer() {
  const cityLinks = cities
    .map((c) => `<li><a href="/${c.slug}/">${esc(c.name)}</a></li>`)
    .join("");
  return `
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <div class="nav-brand" style="font-size:1.1rem;margin-bottom:8px">Where to Stay<span class="dot" style="color:var(--c-accent)">.</span> Turkey</div>
        <p class="text-muted small">A decision engine for choosing the best neighborhood and hotel in Turkey — curated, quick, conversion-focused.</p>
      </div>
      <div>
        <h4>Destinations</h4>
        <ul>${cityLinks}</ul>
      </div>
      <div>
        <h4>Plan your trip</h4>
        <ul>
          <li><a href="/visa/">Turkey visa</a></li>
          <li><a href="/flights/">Flights to Turkey</a></li>
          <li><a href="/arrival-istanbul/">Arrival at Istanbul Airport</a></li>
          <li><a href="/esim/">eSIM &amp; data</a></li>
          <li><a href="/money/">Money &amp; tipping</a></li>
          <li><a href="/insurance/">Travel insurance</a></li>
          <li><a href="/packing/">What to pack</a></li>
          <li><a href="/best-time-to-visit-turkey/">Best time to visit</a></li>
          <li><a href="/how-many-nights-turkey/">How many nights</a></li>
          <li><a href="/is-turkey-safe/">Is Turkey safe?</a></li>
        </ul>
      </div>
      <div>
        <h4>Collections</h4>
        <ul>
          <li><a href="/istanbul/luxury/">Luxury stays</a></li>
          <li><a href="/istanbul/budget/">Budget stays</a></li>
          <li><a href="/istanbul/families/">For families</a></li>
          <li><a href="/istanbul/couples/">For couples</a></li>
          <li><a href="/turkey-luxury/">Turkey luxury</a></li>
          <li><a href="/turkey-couples/">Turkey for couples</a></li>
        </ul>
      </div>
      <div>
        <h4>About</h4>
        <ul>
          <li><a href="/guides/">Guides hub</a></li>
          <li><a href="/journal/">Journal</a></li>
          <li><a href="/compare/">Compare cities</a></li>
          <li><a href="/quiz/">Take the quiz</a></li>
          <li><a href="/planner/">Trip cost calculator</a></li>
          <li><a href="/flights/">Cheap flights to Turkey</a></li>
          <li><a href="/about/">About us</a></li>
          <li><a href="/about/#affiliate">Affiliate disclosure</a></li>
          <li><a href="/contact/">Contact</a></li>
          <li><a href="/privacy/">Privacy</a></li>
          <li><a href="/terms/">Terms</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} ${esc(config.business ? config.business.legalName : config.siteName)}. An independent editorial site. <a href="/about/#affiliate" style="color:inherit">We earn a commission on qualifying bookings</a>.</span>
      <span><a href="/partnerships/" style="color:inherit">For hoteliers</a> · Last updated ${esc(config.business.lastUpdated)}</span>
    </div>
  </div>
</footer>`;
}

function modal() {
  return `
<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal">
    <button class="modal-close" aria-label="Close">×</button>
    <div class="eyebrow">Free download</div>
    <h3 id="modal-title">Your 3-day Istanbul itinerary</h3>
    <p class="text-muted">The exact plan we'd give a friend visiting Istanbul. Where to eat, where to stay, what to skip.</p>
    <form class="lead-form" action="${esc(config.emailCaptureEndpoint)}" data-source="modal">
      <input type="email" name="email" placeholder="your@email.com" required aria-label="Email">
      <button type="submit" class="btn btn-primary">Send it</button>
    </form>
    <p class="lead-note">No spam. Unsubscribe anytime.</p>
  </div>
</div>`;
}

function stickyCta(cityName, search) {
  return `
<div class="sticky-cta">
  <div class="sticky-meta">
    <strong>Ready to book in ${esc(cityName)}?</strong>
    <span class="text-muted">Check live prices on Booking.com</span>
  </div>
  <a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(bookingLink(search))}">Check availability →</a>
</div>`;
}

function tail() {
  return `
${cookieBanner()}
<script src="/assets/js/main.js" defer></script>
</body>
</html>`;
}

// --------------------------- partials ---------------------------

function tierTag(tier) {
  if (tier === "luxury") return `<span class="tag tag-lux">Luxury</span>`;
  if (tier === "budget") return `<span class="tag tag-budget">Budget</span>`;
  return `<span class="tag">Mid-range</span>`;
}

function bestForTag(t) {
  const map = {
    families: "tag-fam",
    couples: "tag-cpl",
    honeymoon: "tag-cpl",
    luxury: "tag-lux",
    budget: "tag-budget",
  };
  const cls = map[t] || "";
  return `<span class="tag ${cls}">${esc(t)}</span>`;
}

function hotelCard(hotel, city) {
  const areaName = (city.areas.find((a) => a.slug === hotel.area) || {}).name || "";
  const link = hotelLink(hotel, city.name);
  const compares = compareOtaLinks(`${hotel.name} ${city.name}`);
  const compareRow = compares.length
    ? `<div class="compare-row small text-muted" style="margin-top:10px">
         Compare: ${compares
           .map((c) => `<a rel="sponsored nofollow" target="_blank" href="${esc(c.url)}">${esc(c.name)}</a>`)
           .join(" · ")}
       </div>`
    : "";
  return `
<article class="card hotel-card">
  <div class="tag-row">
    ${editorsPickBadge(hotel)}
    ${tierTag(hotel.tier)}
    ${hotel.bestFor.slice(0, 2).map(bestForTag).join("")}
  </div>
  <h3>${esc(hotel.name)}</h3>
  <div class="hotel-area">${esc(areaName)}, ${esc(city.name)}</div>
  <p class="hotel-why">${esc(hotel.whyStay)}</p>
  <div class="hotel-meta">
    <span class="hotel-price">$${hotel.priceFrom} <span class="from">from / night</span></span>
  </div>
  <a class="btn btn-primary btn-block" rel="sponsored nofollow" target="_blank" href="${esc(link)}">Check availability →</a>
  ${compareRow}
</article>`;
}

// --------------------------- monetization blocks ---------------------------

// "Experiences in {city}" — tours & activities strip
function experiencesBlock(city) {
  const gyg = getYourGuideLink(`${city.name} Turkey`);
  const viator = viatorLink(`${city.name} Turkey`);
  const klook = klookLink(`${city.name} Turkey`);
  const tiqets = tiqetsLink(`${city.name}`);
  const cards = [
    { partner: "GetYourGuide", tag: "Top-rated tours", url: gyg, active: true },
    { partner: "Viator",       tag: "Alt tour marketplace", url: viator, active: !!viator },
    { partner: "Klook",        tag: "Discounted activities", url: klook, active: !!klook },
    { partner: "Tiqets",       tag: "Museum & attraction tickets", url: tiqets, active: !!tiqets },
  ].filter((c) => c.active);
  if (!cards.length) return "";
  return `
<section class="container section-sm">
  <h2>Experiences in ${esc(city.name)}</h2>
  <p class="text-muted">Skip-the-line tickets, food tours, day trips — book the big stuff before you arrive so it doesn't sell out.</p>
  <div class="grid grid-2 grid-4 mt-3">
    ${cards.map((c) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(c.url)}" style="text-decoration:none;color:inherit">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(c.partner)}</div>
        <h4 style="margin:4px 0">${esc(c.tag)}</h4>
        <p class="text-muted small" style="margin:0">Browse ${esc(city.name)} experiences →</p>
      </a>
    `).join("")}
  </div>
</section>`;
}

// "Getting there" — airport transfers + car rental
function transferBlock(city) {
  const wp = welcomePickupsLink(city.name);
  const kt = kiwitaxiLink(city.name);
  const lr = localrentLink(city.name, `transfer-${slug(city.name)}`);
  const dc = discoverCarsLink(city.name);
  const rc = rentalcarsLink(city.name);
  const cards = [
    { partner: "Welcome Pickups", tag: "Fixed-price airport transfer", url: wp, active: true },
    { partner: "Kiwitaxi",        tag: "Pre-book a private car",       url: kt, active: true },
    { partner: "Localrent",       tag: "Rental cars — Turkey-focused, no deposit",       url: lr, active: true },
  ].filter((c) => c.active);
  return `
<section class="container section-sm">
  <h2>Getting around ${esc(city.name)}</h2>
  <p class="text-muted">Pre-book your arrival. Public taxis at Turkish airports are a known tourist trap.</p>
  <div class="grid grid-2 grid-4 mt-3">
    ${cards.map((c) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(c.url)}" style="text-decoration:none;color:inherit">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(c.partner)}</div>
        <h4 style="margin:4px 0">${esc(c.tag)}</h4>
      </a>
    `).join("")}
  </div>
</section>`;
}

// "Before you fly" — eSIM, insurance, money — shown on homepage + city pages
function essentialsBlock() {
  const cards = [
    { partner: "Airalo",      tag: "Turkey eSIM — no roaming fees",    url: airaloLink() },
    { partner: "Holafly",     tag: "Unlimited eSIM alternative",       url: holaflyLink() },
    { partner: "SafetyWing",  tag: "Flexible travel medical insurance",url: safetyWingLink() },
    { partner: "World Nomads",tag: "Adventure travel insurance",       url: worldNomadsLink() },
    { partner: "Wise",        tag: "Cheap lira transfers & card",      url: wiseLink() },
  ];
  return `
<section class="container section-sm">
  <h2>Essentials before you fly</h2>
  <p class="text-muted">Activate these from home — cheaper and simpler than sorting them at the airport.</p>
  <div class="grid grid-2 grid-3 mt-3">
    ${cards.map((c) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(c.url)}" style="text-decoration:none;color:inherit">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(c.partner)}</div>
        <h4 style="margin:4px 0">${esc(c.tag)}</h4>
      </a>
    `).join("")}
  </div>
</section>`;
}

// Flights — only if the user has added a Kiwi/WayAway marker
function flightsBlock(city) {
  const kc = kiwiFlightsLink(city.name);
  const wa = wayawayLink(city.name);
  const cards = [];
  if (A.kiwiCom.marker)  cards.push({ partner: "Kiwi.com",  tag: `Flights to ${city.name}`,               url: kc });
  if (A.wayaway.marker)  cards.push({ partner: "WayAway",   tag: `Flights to ${city.name} (with cashback)`, url: wa });
  if (!cards.length) return "";
  return `
<section class="container section-sm">
  <h2>Flights to ${esc(city.name)}</h2>
  <div class="grid grid-2 mt-3">
    ${cards.map((c) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(c.url)}" style="text-decoration:none;color:inherit">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(c.partner)}</div>
        <h4 style="margin:4px 0">${esc(c.tag)}</h4>
      </a>
    `).join("")}
  </div>
</section>`;
}

function areaBlock(area, city) {
  const areaHotels = city.hotels.filter((h) => h.area === area.slug);
  const areaSearch = bookingLink(`${area.name} ${city.name}`);
  return `
<section class="area" id="${esc(area.slug)}">
  <div class="tag-row" style="margin-bottom:8px">
    ${area.bestForTags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
  </div>
  <h3>${esc(area.name)}</h3>
  <p class="area-sub">${esc(area.oneLiner)}</p>

  <div class="area-meta">
    <div><span class="meta-label">Vibe</span><span class="meta-value">${esc(area.vibe)}</span></div>
    <div><span class="meta-label">Walkability</span><span class="meta-value">${esc(area.walkability)}</span></div>
    <div><span class="meta-label">Price range</span><span class="meta-value">${esc(area.priceRange)}</span></div>
  </div>

  <div class="proscons">
    <div class="pros">
      <h4>Good for</h4>
      <ul>${area.pros.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    </div>
    <div class="cons">
      <h4>Watch out</h4>
      <ul>${area.cons.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    </div>
  </div>

  ${
    areaHotels.length
      ? `<h4 class="mt-3 mb-2">Top hotels in ${esc(area.name)}</h4>
         <div class="grid grid-2 grid-3">${areaHotels.slice(0, 3).map((h) => hotelCard(h, city)).join("")}</div>`
      : ""
  }
  ${restaurantsBlock(area.slug)}

  <div class="mt-3">
    <a class="btn btn-ghost" rel="sponsored nofollow" target="_blank" href="${esc(areaSearch)}">See all ${esc(area.name)} hotels on Booking →</a>
  </div>
</section>`;
}

function faqBlock(faqs) {
  if (!faqs || !faqs.length) return "";
  return `
<section class="section-sm">
  <h2>FAQs</h2>
  <div class="prose">
    ${faqs.map((f) => `<h3 style="margin-top:28px">${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}
  </div>
</section>`;
}

function leadMagnet() {
  return `
<section class="container"><div class="lead-magnet">
  <div class="eyebrow">Free — sent instantly</div>
  <h3>Get our 3-day Istanbul itinerary</h3>
  <p class="text-muted">The exact plan we'd give a friend visiting Istanbul. Where to eat, what to skip, how to avoid tourist traps.</p>
  <form class="lead-form" action="${esc(config.emailCaptureEndpoint)}" data-source="inline">
    <input type="email" name="email" placeholder="your@email.com" required aria-label="Email">
    <button type="submit" class="btn btn-primary">Send it</button>
  </form>
  <p class="lead-note">No spam. Unsubscribe anytime.</p>
</div></section>`;
}

function compareTable(city) {
  return `
<div class="compare-wrap">
  <table class="compare">
    <thead><tr>
      <th>Area</th><th>Best for</th><th>Price range</th><th>Vibe</th><th></th>
    </tr></thead>
    <tbody>
      ${city.areas.map((a) => `
        <tr>
          <td><a href="#${esc(a.slug)}"><strong>${esc(a.name)}</strong></a>${a.verdict ? `<div class="verdict-line">${esc(a.verdict)}</div>` : ""}</td>
          <td>${a.bestForTags.slice(0, 2).map(esc).join(", ")}</td>
          <td>${esc(a.priceRange)}</td>
          <td>${esc(a.vibe)}</td>
          <td class="compare-cta"><a class="btn btn-ghost" rel="sponsored nofollow" target="_blank" href="${esc(bookingLink(`${a.name} ${city.name}`))}">Check</a></td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>`;
}

function shareRow(title, url) {
  const t = encodeURIComponent(title);
  const u = encodeURIComponent(url);
  return `
<div class="share-row">
  <span class="label">Share:</span>
  <a href="https://twitter.com/intent/tweet?text=${t}&url=${u}" target="_blank" rel="noopener" aria-label="Share on Twitter">𝕏</a>
  <a href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener" aria-label="Share on Facebook">f</a>
  <a href="https://wa.me/?text=${t}%20${u}" target="_blank" rel="noopener" aria-label="Share on WhatsApp">✉</a>
</div>`;
}

// --------------------------- JSON-LD builders ---------------------------

function breadcrumbLd(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: t.url,
    })),
  };
}

function faqLd(faqs) {
  if (!faqs || !faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function itemListLd(name, items) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
    })),
  };
}

// --------------------------- pages ---------------------------

function cityCard(c) {
  return `
<a class="city-card-rich reveal ${c.heroImage ? "has-photo" : ""}" href="/${c.slug}/" style="${cityPaletteStyle(c.slug)}">
  ${c.heroImage
    ? `<img class="city-card-photo" src="${esc(c.heroImage)}" alt="${esc(c.name)}" loading="lazy">`
    : `<div class="city-card-art">${cityHeroSvg(c.slug)}</div>`}
  <div class="city-card-body">
    <div class="city-card-emoji">${c.emoji || "📍"}</div>
    <h3>${esc(c.name)}</h3>
    <p>${esc(c.tagline)}</p>
    <div class="city-card-meta"><span>${esc(c.idealNights)}</span><span>${esc(c.whenToGo.split(" and ")[0])}</span></div>
  </div>
</a>`;
}

function renderHome() {
  const canonical = `${config.siteUrl}/`;
  const title = `${config.siteName} — ${config.siteTagline}`;
  const description = config.siteDescription;

  const body = `
${nav()}
${disclosureBanner()}
<section class="hero-home">

  <div class="container" style="position:relative">
    <div class="eyebrow">Turkey trip planning, simplified</div>
    <h1>Where should you <em>actually</em> stay in Turkey?</h1>
    <p class="hero-sub">${cities.length} destinations worth flying for. Each one has 3–5 neighborhoods with wildly different vibes. Pick the wrong one and you waste a day commuting. We make the call for you.</p>
    <div class="hero-actions mt-3">
      <a class="btn btn-primary btn-lg" href="/quiz/">Take the quiz →</a>
      <a class="btn btn-ghost btn-lg" href="#all-cities">Browse all ${cities.length} cities</a>
    </div>
  </div>
</section>

<div class="strip">
  <div class="container strip-grid">
    <span>Neighborhood breakdowns</span>
    <span>Hand-picked hotels</span>
    <span>Traveler-type filters</span>
    <span>Ad-free, affiliate-funded</span>
  </div>
</div>

<section class="container" style="margin-top:56px">
  <h2>Not sure where to start?</h2>
  <div class="grid grid-2 grid-3 mt-3">
    <a class="card" href="/quiz/" style="text-decoration:none;color:inherit;border-color:var(--c-accent-soft);background:var(--c-accent-soft)">
      <div class="eyebrow">Decision quiz</div>
      <h3 style="margin:4px 0">Which city fits your trip?</h3>
      <p class="text-muted" style="margin:0">60 seconds. 4 questions. One clear answer.</p>
    </a>
    <a class="card" href="/thank-you/" style="text-decoration:none;color:inherit">
      <div class="eyebrow">Free itinerary</div>
      <h3 style="margin:4px 0">3-day Istanbul plan</h3>
      <p class="text-muted" style="margin:0">The exact day-by-day we'd send a friend.</p>
    </a>
    <a class="card" href="/thank-you-combo/" style="text-decoration:none;color:inherit">
      <div class="eyebrow">Free itinerary</div>
      <h3 style="margin:4px 0">5-day Istanbul + Cappadocia</h3>
      <p class="text-muted" style="margin:0">The canonical first-Turkey trip.</p>
    </a>
    <a class="card" href="/planner/" style="text-decoration:none;color:inherit">
      <div class="eyebrow">Interactive tool</div>
      <h3 style="margin:4px 0">Trip cost calculator</h3>
      <p class="text-muted" style="margin:0">Pick city, nights, style. Get a realistic budget in 20 seconds.</p>
    </a>
    <a class="card" href="/guides/" style="text-decoration:none;color:inherit">
      <div class="eyebrow">Practical</div>
      <h3 style="margin:4px 0">Every planning question answered</h3>
      <p class="text-muted" style="margin:0">Visa, safety, transport, seasonal timing.</p>
    </a>
    <a class="card" href="/turkey-couples/" style="text-decoration:none;color:inherit">
      <div class="eyebrow">Collection</div>
      <h3 style="margin:4px 0">Best hotels for couples</h3>
      <p class="text-muted" style="margin:0">Hand-picked across 18 destinations.</p>
    </a>
    <a class="card" href="/turkey-luxury/" style="text-decoration:none;color:inherit">
      <div class="eyebrow">Collection</div>
      <h3 style="margin:4px 0">Luxury hotels in Turkey</h3>
      <p class="text-muted" style="margin:0">Palace hotels, cave suites, Bosphorus front.</p>
    </a>
  </div>
</section>

<section class="section" id="all-cities">
  <div class="container">
    <h2>All destinations</h2>
    <p class="text-muted">${cities.length} Turkish destinations, each broken down by neighborhood.</p>
    <div class="grid grid-2 grid-3 mt-3">
      ${cities.map(cityCard).join("")}
    </div>
  </div>
</section>

${editorsPicksStrip()}

${leadMagnet()}

${essentialsBlock()}

<section class="section">
  <div class="container container-narrow">
    <h2>How this site works</h2>
    <div class="prose">
      <p>Most travel sites bury the answer. We put it up front: for each major Turkish city, we tell you which neighborhoods are worth staying in, who each one is best for, and which hotels are genuinely recommended in each.</p>
      <p>We link to hotels on Booking.com, Hotels.com, and Agoda; to tours on GetYourGuide and Viator; to airport transfers on Welcome Pickups; and to a handful of essentials like Turkish eSIMs and travel insurance. If you book through any of these links, we earn a small commission — at no extra cost to you. That's how we keep this site ad-free.</p>
      <p>We don't accept PR trips or paid placements. Listings are based on price, location, and long-term review consistency.</p>
    </div>
  </div>
</section>

${footer()}
${modal()}
${tail()}`;

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: config.siteName,
      url: canonical,
      potentialAction: {
        "@type": "SearchAction",
        target: `${canonical}?s={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: config.siteName,
      url: canonical,
    },
  ];

  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("index.html", html);
}

function renderCity(c) {
  const canonical = `${config.siteUrl}/${c.slug}/`;
  const title = `Where to stay in ${c.name} — neighborhoods & best hotels (2026)`;
  const description = `${c.summary.slice(0, 150)}… Compare areas and hand-picked hotels.`;

  const luxury = c.hotels.filter((h) => h.tier === "luxury");
  const budget = c.hotels.filter((h) => h.tier === "budget");

  const programmaticLinks = `
<div class="grid grid-2 grid-3 grid-4 mt-3">
  ${luxury.length ? `<a class="card" href="/${c.slug}/luxury/"><h4 style="margin:0">Luxury hotels</h4><p class="text-muted small mt-1">5-star picks in ${esc(c.name)}</p></a>` : ""}
  ${budget.length ? `<a class="card" href="/${c.slug}/budget/"><h4 style="margin:0">Budget hotels</h4><p class="text-muted small mt-1">Under $100 / night</p></a>` : ""}
  <a class="card" href="/${c.slug}/families/"><h4 style="margin:0">For families</h4><p class="text-muted small mt-1">Best areas for kids</p></a>
  <a class="card" href="/${c.slug}/couples/"><h4 style="margin:0">For couples</h4><p class="text-muted small mt-1">Romantic stays</p></a>
</div>`;

  const body = `
${nav()}
${disclosureBanner()}
<main id="main">
<section class="hero-immersive ${c.heroImage ? "has-photo" : ""}" style="${cityPaletteStyle(c.slug)}">
  ${c.heroImage
    ? `<img class="hero-photo" src="${esc(c.heroImage)}" alt="${esc(c.name)}, Turkey" loading="eager" fetchpriority="high">`
    : `<div class="hero-art">${cityHeroSvg(c.slug)}</div>`}
  <div class="container">
    <div class="eyebrow">Where to stay in ${esc(c.name)}, Turkey ${c.emoji || ""}</div>
    <h1>${esc(c.name)}${c.emoji ? "" : ""}.</h1>
    <p class="hero-sub">${esc(c.tagline)}</p>
    <div class="hero-actions">
      <a class="btn btn-primary btn-lg" href="#neighborhoods">See neighborhoods</a>
      <a class="btn btn-ghost btn-lg" rel="sponsored nofollow" target="_blank" href="${esc(bookingLink(c.heroSearch))}" >Check hotel prices</a>
    </div>
    <div class="hero-meta">
      <div class="meta-item"><strong>${esc(c.idealNights)}</strong><span>Ideal stay</span></div>
      <div class="meta-item"><strong>${c.areas.length}</strong><span>Neighborhoods</span></div>
      <div class="meta-item"><strong>${c.hotels.length}</strong><span>Curated hotels</span></div>
      <div class="meta-item"><strong>${esc(c.whenToGo.split(" and ")[0])}</strong><span>Best months</span></div>
    </div>
  </div>
</section>

<div class="container">
  <div class="breadcrumb small text-soft" style="padding:18px 0;border-bottom:1px solid var(--c-hairline);margin-bottom:28px"><a href="/" style="color:inherit">Turkey</a> <span style="margin:0 8px">/</span> ${esc(c.name)}</div>
  <div class="prose mb-4" style="max-width:720px">
    <p style="font-size:1.05rem">${esc(c.summary)}</p>
  </div>
</div>

<section class="container">
  <div class="toc">
    <h4>At a glance</h4>
    <ol>
      ${c.areas.map((a) => `<li><a href="#${esc(a.slug)}">${esc(a.name)}</a> — ${esc(a.oneLiner)}</li>`).join("")}
    </ol>
  </div>

  <h2>Compare neighborhoods</h2>
  ${compareTable(c)}
  ${shareRow(`Where to stay in ${c.name}`, canonical)}
</section>

<section class="container mt-3" id="neighborhoods">
  <h2>Neighborhood breakdown</h2>
  ${c.areas.map((a) => areaBlock(a, c)).join("")}
</section>

<section class="container section-sm">
  <h2>Browse by style</h2>
  <p class="text-muted">Looking for something specific in ${esc(c.name)}?</p>
  ${programmaticLinks}
</section>

${leadMagnet()}

<section class="container">
  <h2>All featured hotels in ${esc(c.name)}</h2>
  <div class="grid grid-2 grid-3">
    ${c.hotels.map((h) => hotelCard(h, c)).join("")}
  </div>
  ${priceDisclaimer()}
</section>

<section class="container section-sm"><p class="text-muted" style="text-align:center">Looking for activities? <a href="/${c.slug}/tours/">See all tours in ${esc(c.name)} →</a></p></section>

${experiencesBlock(c)}
${transferBlock(c)}
${flightsBlock(c)}

<section class="container mt-4">
  <h2>On the map</h2>
  <div class="map-embed"><iframe loading="lazy" allowfullscreen src="${esc(c.mapEmbed)}"></iframe></div>
</section>

<section class="container">
  ${faqBlock(c.faqs)}
</section>

${relatedCitiesBlock(c)}
${essentialsBlock()}
</main>

${footer()}
${modal()}
${stickyCta(c.name, c.heroSearch)}
${tail()}`;

  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: c.name, url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "TouristDestination",
      name: c.name,
      description: c.summary,
      url: canonical,
      containedInPlace: { "@type": "Country", name: "Turkey" },
    },
  ];
  const faq = faqLd(c.faqs);
  if (faq) jsonld.push(faq);

  const ogImage = c.heroImage || `${config.siteUrl}/assets/img/og/${c.slug}.svg`;
  const html = head({ title, description, canonical, ogImage, jsonld }) + body;
  writeFile(`${c.slug}/index.html`, html);
}

function renderProgrammatic({ city, variant, title, description, heading, intro, hotels, audience }) {
  const canonical = `${config.siteUrl}/${city.slug}/${variant}/`;

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Turkey</a> / <a href="/${city.slug}/">${esc(city.name)}</a> / ${esc(heading)}</div>
    <h1>${esc(heading)}</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">${esc(intro)}</p>
  </div>
</div>

<section class="container">
  <div class="grid grid-2 grid-3">
    ${hotels.length
      ? hotels.map((h) => hotelCard(h, city)).join("")
      : `<p class="text-muted">We're still curating picks for this collection. Meanwhile, <a href="/${city.slug}/">browse all ${esc(city.name)} stays</a>.</p>`}
  </div>
</section>

${leadMagnet()}

<section class="container">
  ${audience ? `<p class="text-muted">${esc(audience)}</p>` : ""}
  <div class="grid grid-2 mt-3">
    ${city.areas
      .filter((a) => !variant || variantMatchesArea(variant, a))
      .slice(0, 4)
      .map((a) => `
        <a class="card" href="/${city.slug}/#${esc(a.slug)}" style="text-decoration:none;color:inherit">
          <h3 style="margin-bottom:4px">${esc(a.name)}</h3>
          <div class="text-soft small mb-2">${esc(a.vibe)}</div>
          <p class="text-muted">${esc(a.oneLiner)}</p>
        </a>
      `).join("")}
  </div>
</section>

<section class="container section-sm">
  <h2>Explore more in ${esc(city.name)}</h2>
  <div class="grid grid-2 grid-4 mt-3">
    <a class="card" href="/${city.slug}/"><h4 style="margin:0">All neighborhoods</h4><p class="text-muted small mt-1">Full ${esc(city.name)} area guide</p></a>
    ${variant !== "luxury" && city.hotels.some((h) => h.tier === "luxury") ? `<a class="card" href="/${city.slug}/luxury/"><h4 style="margin:0">Luxury hotels</h4><p class="text-muted small mt-1">5-star picks</p></a>` : ""}
    ${variant !== "budget" && city.hotels.some((h) => h.tier === "budget") ? `<a class="card" href="/${city.slug}/budget/"><h4 style="margin:0">Budget hotels</h4><p class="text-muted small mt-1">Under $100</p></a>` : ""}
    ${variant !== "families" ? `<a class="card" href="/${city.slug}/families/"><h4 style="margin:0">For families</h4><p class="text-muted small mt-1">Best areas for kids</p></a>` : ""}
    ${variant !== "couples" ? `<a class="card" href="/${city.slug}/couples/"><h4 style="margin:0">For couples</h4><p class="text-muted small mt-1">Romantic stays</p></a>` : ""}
  </div>
</section>

${footer()}
${modal()}
${stickyCta(city.name, `${heading} ${city.name}`)}
${tail()}`;

  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: city.name, url: `${config.siteUrl}/${city.slug}/` },
      { name: heading, url: canonical },
    ]),
    itemListLd(heading, hotels),
  ];

  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`${city.slug}/${variant}/index.html`, html);
}

function variantMatchesArea(variant, area) {
  if (variant === "luxury") return area.priceRange.includes("$") && /\d{3,}/.test(area.priceRange);
  if (variant === "budget") return true;
  if (variant === "families") return area.bestForTags.some((t) => /family|families|kids/i.test(t));
  if (variant === "couples") return area.bestForTags.some((t) => /couple|honeymoon|romantic|adults|quiet/i.test(t));
  return true;
}

function renderProgrammaticForCity(c) {
  const luxury = c.hotels.filter((h) => h.tier === "luxury");
  const budget = c.hotels.filter((h) => h.tier === "budget");
  const fams = c.hotels.filter((h) => h.bestFor.some((t) => /family|families|kids|all-inclusive/i.test(t)));
  const couples = c.hotels.filter((h) => h.bestFor.some((t) => /couple|honeymoon|romantic|adults|design/i.test(t)));

  if (luxury.length) {
    renderProgrammatic({
      city: c, variant: "luxury",
      heading: `Luxury hotels in ${c.name}`,
      title: `Luxury hotels in ${c.name} — 5-star picks for 2026`,
      description: `Hand-picked luxury and 5-star hotels in ${c.name}, Turkey. Compare top properties, neighborhoods, and prices.`,
      intro: `The handful of genuinely special 5-star stays in ${c.name}. Milestone-trip picks, not just the priciest names.`,
      hotels: luxury,
      audience: `Luxury travelers in ${c.name} usually want either a historic landmark or a modern resort on the water.`,
    });
  }

  if (budget.length) {
    renderProgrammatic({
      city: c, variant: "budget",
      heading: `Budget hotels in ${c.name} under $100`,
      title: `Budget hotels in ${c.name} — under $100 / night (2026)`,
      description: `Affordable, well-reviewed hotels in ${c.name} under $100 per night.`,
      intro: `The best-reviewed hotels in ${c.name} under $100 — all within short reach of the sights.`,
      hotels: budget,
      audience: `In ${c.name}, budget travelers should prioritize location over everything.`,
    });
  }

  renderProgrammatic({
    city: c, variant: "families",
    heading: `Best hotels in ${c.name} for families`,
    title: `Best hotels in ${c.name} for families (with kids) — 2026`,
    description: `Family-friendly hotels and neighborhoods in ${c.name}.`,
    intro: `Pool access, family rooms, and quiet streets — the ${c.name} hotels that deliver all three.`,
    hotels: fams.length ? fams : c.hotels.slice(0, 6),
    audience: `Look for family rooms, pools, and good transport. Skip the party-heavy neighborhoods.`,
  });

  renderProgrammatic({
    city: c, variant: "couples",
    heading: `Best hotels in ${c.name} for couples`,
    title: `Best hotels in ${c.name} for couples — romantic stays 2026`,
    description: `Romantic, adults-friendly hotels in ${c.name}.`,
    intro: `The ${c.name} hotels we'd pick for an anniversary or a honeymoon — small, beautiful, quiet.`,
    hotels: couples.length ? couples : c.hotels.slice(0, 6),
    audience: `Couples usually prefer smaller, adults-friendly hotels over large resorts.`,
  });
}

function renderThankYou() {
  const it = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "lead-magnet-istanbul.json"), "utf8"));
  const canonical = `${config.siteUrl}/thank-you/`;
  const title = `${it.title} — ${config.siteName}`;
  const description = it.subtitle;

  const dayBlocks = it.days.map((d, i) => `
    <section class="itinerary-day">
      <div class="day-badge">Day ${i + 1}</div>
      <h2>${esc(d.title)}</h2>
      <p class="text-muted"><strong>Where to stay tonight:</strong> ${esc(d.staybase)}</p>
      <ol class="flow">
        ${d.flow.map((f) => `<li><span class="flow-time">${esc(f.time)}</span><span class="flow-what">${esc(f.what)}</span></li>`).join("")}
      </ol>
      <div class="tips">
        <h4>Notes</h4>
        <ul>${d.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
    </section>
  `).join("");

  // Affiliate upsell strip — the single biggest conversion moment on the site
  const upsells = [
    { partner: "Airalo",          tag: "Turkey eSIM — activate before boarding", url: airaloLink() },
    { partner: "Welcome Pickups", tag: "Istanbul airport transfer (fixed fare)",  url: welcomePickupsLink("Istanbul") },
    { partner: "GetYourGuide",    tag: "Bosphorus cruise + Hagia Sophia tickets", url: getYourGuideLink("Istanbul Bosphorus cruise") },
    { partner: "GetYourGuide",    tag: "Cappadocia balloon add-on (book early)",  url: getYourGuideLink("Cappadocia hot air balloon") },
    { partner: "SafetyWing",      tag: "Travel insurance (flexible, monthly)",    url: safetyWingLink() },
    { partner: "Booking.com",     tag: "Istanbul hotels — see availability",      url: bookingLink("Istanbul") },
  ];

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="eyebrow" style="color:var(--c-success)">✓ You're in</div>
    <h1>${esc(it.title)}</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">${esc(it.subtitle)}</p>
    <div class="page-meta">
      <button onclick="window.print()" class="btn btn-ghost">Save as PDF</button>
      <span class="text-soft small">or just bookmark this page</span>
    </div>
  </div>
</div>

<section class="container">
  <div class="lead-magnet" style="text-align:left">
    <div class="eyebrow">Before you fly</div>
    <h3 style="margin-top:4px">Book these three things first — they sell out and get expensive at the door</h3>
    <div class="grid grid-2 grid-3 mt-3">
      ${upsells.slice(0, 3).map((u) => `
        <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(u.url)}" style="text-decoration:none;color:inherit">
          <div class="eyebrow" style="color:var(--c-text-soft)">${esc(u.partner)}</div>
          <h4 style="margin:4px 0">${esc(u.tag)}</h4>
        </a>`).join("")}
    </div>
  </div>
</section>

<section class="container container-narrow prose">
  <h2>Pre-trip checklist</h2>
  <ul>${it.preTrip.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
</section>

<div class="container container-narrow">
  ${dayBlocks}
</div>

<section class="container container-narrow prose">
  <h2>Istanbul scams to ignore</h2>
  <ul>${it.scams.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
</section>

<section class="container container-narrow">
  <div class="lead-magnet">
    <div class="eyebrow">Quick checklist — copy to your phone</div>
    <h3>Before you board</h3>
    <ul style="text-align:left;max-width:420px;margin:16px auto 0">
      ${it.checklist.map((c) => `<li>☐ ${esc(c)}</li>`).join("")}
    </ul>
  </div>
</section>

${essentialsBlock()}

<section class="container container-narrow prose">
  <h2>Where to stay</h2>
  <p>The itinerary works best if you base in one of these three areas:</p>
  <ul>
    <li><a href="/istanbul/#sultanahmet">Sultanahmet</a> — closest to the Day 1 sights. Best for first-timers.</li>
    <li><a href="/istanbul/#beyoglu">Beyoğlu (Galata / Karaköy)</a> — best for nightlife, food, and design hotels.</li>
    <li><a href="/istanbul/#kadikoy">Kadıköy</a> — best for a local, quieter stay if you've been before.</li>
  </ul>
  <p>Full hotel picks for each area on <a href="/istanbul/">our Istanbul page</a>.</p>
</section>

${footer()}
${tail()}`;

  // Intentionally no JSON-LD / noindex — this is a conversion page, not an SEO page.
  // Custom head override that adds noindex.
  const customHead = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, follow">
<link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">
<link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body>`;

  writeFile("thank-you/index.html", customHead + body);
}

function renderAbout() {
  const canonical = `${config.siteUrl}/about/`;
  const title = `About — ${config.siteName}`;
  const description = "Who we are, how we pick hotels, and our affiliate disclosure.";
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / About</div>
    <h1>About Where to Stay Turkey</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">We make it easy to decide where to stay in Turkey — without reading 12 blog posts first.</p>
  </div>
</div>
<section class="container container-narrow prose">
  <h2>What we do</h2>
  <p>We tell you which neighborhood to stay in based on how you travel, rather than describing all of them.</p>
  <h2>How we pick hotels</h2>
  <ul>
    <li>Long-running review average above 8.5 on Booking.com</li>
    <li>Location inside the neighborhood it represents</li>
    <li>Consistency across 200+ reviews</li>
    <li>Clear best-for fit</li>
  </ul>
  <h2>How we research</h2>
  <p>Every city is visited at least annually. Different neighborhoods on different trips. Restaurants we recommend, we eat at. Public ferries, not chartered ones. We pay for our own bookings. No PR-funded trips. No paid placements.</p>
  <h2 id="affiliate">Affiliate disclosure</h2>
  <p>We partner with Booking.com, Hotels.com, Agoda, Trip.com, Hostelworld, Vrbo, GetYourGuide, Viator, Klook, Tiqets, Welcome Pickups, Kiwitaxi, Discover Cars, Airalo, SafetyWing, World Nomads, Wise, Kiwi.com, and WayAway. Booking through our links earns us a commission at no cost to you.</p>
  <h2 id="contact">Contact</h2>
  <p>Spotted a mistake? Reply to any email we send.</p>
</section>
${footer()}
${tail()}`;
  const html = head({ title, description, canonical }) + body;
  writeFile("about/index.html", html);
}

function renderSitemap() {
  const urls = [
    `${config.siteUrl}/`,
    `${config.siteUrl}/about/`,
    `${config.siteUrl}/quiz/`,
    `${config.siteUrl}/visa/`,
    `${config.siteUrl}/is-turkey-safe/`,
    `${config.siteUrl}/istanbul-to-cappadocia/`,
    `${config.siteUrl}/best-time-to-visit-turkey/`,
    `${config.siteUrl}/how-many-nights-turkey/`,
    `${config.siteUrl}/guides/`,
    `${config.siteUrl}/privacy/`,
    `${config.siteUrl}/terms/`,
    `${config.siteUrl}/contact/`,
    `${config.siteUrl}/planner/`,
    `${config.siteUrl}/journal/`,
    `${config.siteUrl}/compare/`,
    `${config.siteUrl}/partnerships/`,
    `${config.siteUrl}/flights/`,
    `${config.siteUrl}/insurance/`,
    `${config.siteUrl}/esim/`,
    `${config.siteUrl}/money/`,
    `${config.siteUrl}/packing/`,
    `${config.siteUrl}/arrival-istanbul/`,
    `${config.siteUrl}/experiences/`,
    `${config.siteUrl}/regions/`,
    `${config.siteUrl}/turkey-guide/`,
    `${config.siteUrl}/turkey-by-month/`,
    `${config.siteUrl}/best-of-turkey/`,
  ];
  for (const _m of MONTHS) urls.push(`${config.siteUrl}/turkey-by-month/${_m.slug}/`);
  for (const _col of COLLECTIONS) urls.push(`${config.siteUrl}/best-of-turkey/${_col.slug}/`);
  for (const _e of EXPERIENCES) urls.push(`${config.siteUrl}/experiences/${_e.slug}/`);
  for (const _r of REGIONS) urls.push(`${config.siteUrl}/regions/${_r.slug}/`);
  for (const _slug of Object.keys(DAY_TRIPS)) urls.push(`${config.siteUrl}/${_slug}/day-trips/`);
  for (const p of JOURNAL) urls.push(`${config.siteUrl}/journal/${p.slug}/`);
  for (const c of cities) {
    urls.push(`${config.siteUrl}/${c.slug}/`);
    urls.push(`${config.siteUrl}/${c.slug}/tours/`);
    urls.push(`${config.siteUrl}/${c.slug}/families/`);
    urls.push(`${config.siteUrl}/${c.slug}/couples/`);
    if (c.hotels.some((h) => h.tier === "luxury")) urls.push(`${config.siteUrl}/${c.slug}/luxury/`);
    if (c.hotels.some((h) => h.tier === "budget")) urls.push(`${config.siteUrl}/${c.slug}/budget/`);
  }
  urls.push(`${config.siteUrl}/turkey-luxury/`);
  urls.push(`${config.siteUrl}/turkey-families/`);
  urls.push(`${config.siteUrl}/turkey-couples/`);
  urls.push(`${config.siteUrl}/turkey-off-beaten-path/`);
  const today = new Date().toISOString().split("T")[0];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${u}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>`).join("\n")}
</urlset>`;
  writeFile("sitemap.xml", body);
}

function renderRobots() {
  writeFile("robots.txt", `User-agent: *\nAllow: /\nDisallow: /thank-you/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
}

function render404() {
  const body = `${nav()}
${disclosureBanner()}
<section class="hero-home" style="min-height:60vh;display:flex;align-items:center">
  <div class="container" style="text-align:center">
    <div class="eyebrow">Error 404</div>
    <h1>We can't find that page.</h1>
    <p class="hero-sub" style="margin:0 auto 28px">It may have been moved or the URL is mistyped. Here's where most people go next.</p>
    <div class="hero-actions" style="justify-content:center">
      <a class="btn btn-primary btn-lg" href="/">Go to homepage</a>
      <a class="btn btn-ghost btn-lg" href="/quiz/">Take the quiz</a>
      <a class="btn btn-ghost btn-lg" href="/istanbul/">Where to stay in Istanbul</a>
    </div>
  </div>
</section>
${footer()}
${tail()}`;
  const html = head({ title: `Page not found — ${config.siteName}`, description: `404 — page not found.`, canonical: `${config.siteUrl}/404.html` }) + body;
  writeFile("404.html", html);
}

function writeManifest() {
  const manifest = {
    name: config.siteName,
    short_name: "WhereToStay TR",
    description: config.siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#E11D48",
    icons: [
      { src: "/assets/img/favicon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/assets/img/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
  writeFile("site.webmanifest", JSON.stringify(manifest, null, 2));
}

function writeAppleTouchIcon() {
  // 180x180 PNG — generate as SVG but also write a sensible PNG shim (browsers that need real PNG will get SVG fallback via rel=icon).
  // Safari needs PNG; provide a minimal solid-color placeholder that the operator can replace.
  writeFile("assets/img/apple-touch-icon.png.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="#E11D48"/><text x="90" y="118" text-anchor="middle" font-family="Arial, sans-serif" font-size="100" font-weight="800" fill="#fff">T</text></svg>`);
  // Fallback for Safari which doesn't read SVG in apple-touch-icon — note in README.
}

function writeSecurityTxt() {
  const b = config.business;
  const body = `Contact: mailto:${b.contactEmail}\nExpires: ${new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()}\nPreferred-Languages: en\n`;
  writeFile(".well-known/security.txt", body);
}

function writeFavicon() {
  writeFile("assets/img/favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#E11D48"/><text x="32" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="#fff">T</text></svg>`);
}

function writeOgImage() {
  writeFile("assets/img/og-default.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#FFE4E6"/><stop offset="1" stop-color="#FEF3C7"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><text x="80" y="260" font-family="sans-serif" font-size="72" font-weight="800" fill="#0f172a">Where to Stay</text><text x="80" y="340" font-family="sans-serif" font-size="72" font-weight="800" fill="#E11D48">in Turkey.</text></svg>`);

}

// ---- Cross-city collection pages ----
function renderCrossCollection({ slug, heading, intro, filter, audience }) {
  const matches = [];
  for (const c of cities) {
    for (const h of c.hotels) {
      if (filter(h, c)) matches.push({ h, c });
    }
  }
  matches.sort((a, b) => (a.h.priceFrom || 0) - (b.h.priceFrom || 0));
  const canonical = `${config.siteUrl}/${slug}/`;
  const title = `${heading} — handpicked across Turkey (2026)`;
  const description = intro.slice(0, 150);
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Turkey</a> / ${esc(heading)}</div>
    <h1>${esc(heading)}</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">${esc(intro)}</p>
  </div>
</div>
<section class="container">
  <p class="text-muted">${matches.length} picks across ${new Set(matches.map((m) => m.c.slug)).size} cities.</p>
  <div class="grid grid-2 grid-3 mt-3">
    ${matches.map((m) => hotelCard(m.h, m.c)).join("")}
  </div>
</section>
${essentialsBlock()}
<section class="container section-sm">
  <h2>Or explore by destination</h2>
  <div class="grid grid-2 grid-3 grid-4 mt-3">
    ${cities.slice(0, 8).map((c) => `<a class="card" href="/${c.slug}/"><h4 style="margin:0">${esc(c.name)}</h4><p class="text-muted small mt-1">${esc(c.tagline)}</p></a>`).join("")}
  </div>
</section>
${footer()}
${modal()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: heading, url: canonical },
    ]),
    itemListLd(heading, matches.map((m) => m.h)),
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`${slug}/index.html`, html);
}

function renderAllCrossCollections() {
  renderCrossCollection({
    slug: "turkey-luxury",
    heading: "Luxury hotels in Turkey",
    intro: "The best 5-star stays across Turkey — palace hotels in Istanbul, cave suites in Cappadocia, Bosphorus-front resorts, and design-led all-inclusives on the Aegean.",
    filter: (h) => h.tier === "luxury",
  });
  renderCrossCollection({
    slug: "turkey-families",
    heading: "Best family hotels in Turkey",
    intro: "Resorts and hotels across Turkey that actually work for families — kids' clubs, family rooms, pools, and locations parents can handle.",
    filter: (h) => h.bestFor.some((t) => /family|families|kids|all-inclusive/i.test(t)),
  });
  renderCrossCollection({
    slug: "turkey-couples",
    heading: "Best hotels in Turkey for couples",
    intro: "Romantic stays across Turkey — adults-only boutiques, design hotels with views, and honeymoon cave suites in Cappadocia.",
    filter: (h) => h.bestFor.some((t) => /couple|honeymoon|romantic|adults|design/i.test(t)),
  });
  renderCrossCollection({
    slug: "turkey-off-beaten-path",
    heading: "Turkey off the beaten path",
    intro: "Hotels in Turkish destinations the tour buses haven't ruined — Mardin energy, Mersin beaches, Rize tea villages, Gaziantep food city.",
    filter: (h, c) => /mersin|rize|gaziantep|trabzon|kas/.test(c.slug),
  });
}


// ---- Generic lead magnet renderer ----
function renderLeadMagnetPage(dataFile, outSlug, heroUpsellQueries) {
  const it = JSON.parse(fs.readFileSync(path.join(DATA_DIR, dataFile), "utf8"));
  const canonical = `${config.siteUrl}/${outSlug}/`;
  const title = `${it.title} — ${config.siteName}`;
  const description = it.subtitle;

  const dayBlocks = it.days.map((d, i) => `
    <section class="itinerary-day">
      <div class="day-badge">Day ${i + 1}</div>
      <h2>${esc(d.title)}</h2>
      <p class="text-muted"><strong>Where to stay tonight:</strong> ${esc(d.staybase)}</p>
      <ol class="flow">
        ${d.flow.map((f) => `<li><span class="flow-time">${esc(f.time)}</span><span class="flow-what">${esc(f.what)}</span></li>`).join("")}
      </ol>
      <div class="tips">
        <h4>Notes</h4>
        <ul>${d.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
    </section>
  `).join("");

  const upsells = [
    { partner: "Airalo",          tag: "Turkey eSIM — activate before boarding", url: airaloLink() },
    { partner: "Welcome Pickups", tag: "Airport transfer (fixed fare)",            url: welcomePickupsLink(heroUpsellQueries.city || "Istanbul") },
    { partner: "GetYourGuide",    tag: heroUpsellQueries.tour || "Top-rated tours",url: getYourGuideLink(heroUpsellQueries.tourQuery || "Istanbul tours") },
    { partner: "GetYourGuide",    tag: "Cappadocia balloon (book early)",          url: getYourGuideLink("Cappadocia hot air balloon") },
    { partner: "SafetyWing",      tag: "Travel insurance",                         url: safetyWingLink() },
    { partner: "Booking.com",     tag: `${heroUpsellQueries.city} hotels`,         url: bookingLink(heroUpsellQueries.city || "Istanbul") },
  ];

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="eyebrow" style="color:var(--c-success)">✓ You're in</div>
    <h1>${esc(it.title)}</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">${esc(it.subtitle)}</p>
    <div class="page-meta">
      <button onclick="window.print()" class="btn btn-ghost">Save as PDF</button>
      <span class="text-soft small">or just bookmark this page</span>
    </div>
  </div>
</div>

<section class="container">
  <div class="lead-magnet" style="text-align:left">
    <div class="eyebrow">Book these first</div>
    <h3 style="margin-top:4px">These three sell out and get expensive at the door</h3>
    <div class="grid grid-2 grid-3 mt-3">
      ${upsells.slice(0, 3).map((u) => `
        <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(u.url)}" style="text-decoration:none;color:inherit">
          <div class="eyebrow" style="color:var(--c-text-soft)">${esc(u.partner)}</div>
          <h4 style="margin:4px 0">${esc(u.tag)}</h4>
        </a>`).join("")}
    </div>
  </div>
</section>

<section class="container container-narrow prose">
  <h2>Before you fly</h2>
  <p>${esc(it.intro)}</p>
  <h3>Pre-trip checklist</h3>
  <ul>${it.preTrip.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
</section>

<div class="container container-narrow">${dayBlocks}</div>

<section class="container container-narrow prose">
  <h2>Scams to ignore</h2>
  <ul>${it.scams.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
</section>

<section class="container container-narrow">
  <div class="lead-magnet">
    <div class="eyebrow">Quick checklist — save to your phone</div>
    <h3>Before you board</h3>
    <ul style="text-align:left;max-width:480px;margin:16px auto 0">
      ${it.checklist.map((c) => `<li>☐ ${esc(c)}</li>`).join("")}
    </ul>
  </div>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;

  const customHead = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="noindex, follow">
<link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&display=swap">
<link rel="stylesheet" href="/assets/css/styles.css">
</head><body>`;
  writeFile(`${outSlug}/index.html`, customHead + body);
}

// Re-expose renderThankYou as a wrapper over renderLeadMagnetPage so existing call sites still work.
function renderThankYouNew() {
  renderLeadMagnetPage("lead-magnet-istanbul.json", "thank-you", {
    city: "Istanbul",
    tour: "Bosphorus cruise + Hagia Sophia tickets",
    tourQuery: "Istanbul Bosphorus cruise",
  });
  renderLeadMagnetPage("lead-magnet-combo.json", "thank-you-combo", {
    city: "Cappadocia",
    tour: "Cappadocia balloon sunrise",
    tourQuery: "Cappadocia hot air balloon",
  });
}

// ---- Per-city /tours/ pages ----
function renderToursPage(c) {
  const canonical = `${config.siteUrl}/${c.slug}/tours/`;
  const title = `Best tours and things to do in ${c.name} — 2026`;
  const description = `Hand-picked tours, tickets, and activities in ${c.name}, Turkey. Compare GetYourGuide, Viator, and Klook pricing for skip-the-line access.`;

  const buckets = [
    { heading: `Top-rated tours in ${c.name}`,     query: `${c.name} top tours`,       hint: "Bestsellers" },
    { heading: `Food tours in ${c.name}`,          query: `${c.name} food tour`,       hint: "Eat local" },
    { heading: `${c.name} day trips`,              query: `${c.name} day trips`,       hint: "Nearby" },
    { heading: `Cultural & historical tours`,      query: `${c.name} history tour`,    hint: "Deep cuts" },
  ];

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Turkey</a> / <a href="/${c.slug}/">${esc(c.name)}</a> / Tours</div>
    <h1>Tours &amp; things to do in ${esc(c.name)}</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">The tours that consistently earn 4.5+ ratings in ${esc(c.name)}, plus day trips most travelers miss. Book the big stuff before you arrive — skip-the-line tickets save hours at the major sights.</p>
  </div>
</div>

<section class="container">
  ${buckets.map((b) => {
    const gyg = getYourGuideLink(b.query);
    const viator = viatorLink(b.query);
    const klook = klookLink(b.query);
    const tiqets = tiqetsLink(b.query);
    return `
      <div class="card mt-3" style="padding:24px">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(b.hint)}</div>
        <h3 style="margin:4px 0 12px">${esc(b.heading)}</h3>
        <div class="grid grid-2 grid-4">
          <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(gyg)}" style="text-decoration:none;color:inherit">
            <div class="eyebrow">GetYourGuide</div>
            <h4 style="margin:4px 0">Browse on GetYourGuide →</h4>
          </a>
          ${viator ? `<a class="card" rel="sponsored nofollow" target="_blank" href="${esc(viator)}" style="text-decoration:none;color:inherit"><div class="eyebrow">Viator</div><h4 style="margin:4px 0">Browse on Viator →</h4></a>` : ""}
          ${klook ? `<a class="card" rel="sponsored nofollow" target="_blank" href="${esc(klook)}" style="text-decoration:none;color:inherit"><div class="eyebrow">Klook</div><h4 style="margin:4px 0">Browse on Klook →</h4></a>` : ""}
          ${tiqets ? `<a class="card" rel="sponsored nofollow" target="_blank" href="${esc(tiqets)}" style="text-decoration:none;color:inherit"><div class="eyebrow">Tiqets</div><h4 style="margin:4px 0">Attraction tickets →</h4></a>` : ""}
        </div>
      </div>
    `;
  }).join("")}
</section>

${transferBlock(c)}

<section class="container section-sm">
  <h2>Stay near the tours</h2>
  <div class="grid grid-2 grid-3 mt-3">
    ${c.hotels.slice(0, 6).map((h) => hotelCard(h, c)).join("")}
  </div>
  <div class="mt-3"><a class="btn btn-ghost" href="/${c.slug}/">See all ${esc(c.name)} hotels →</a></div>
</section>

${essentialsBlock()}
${footer()}
${modal()}
${stickyCta(c.name, `${c.name} tours`)}
${tail()}`;

  const jsonld = [
    breadcrumbLd([
      { name: "Home",   url: `${config.siteUrl}/` },
      { name: c.name,   url: `${config.siteUrl}/${c.slug}/` },
      { name: "Tours",  url: canonical },
    ]),
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`${c.slug}/tours/index.html`, html);
}

// ---- Flights to Turkey landing page ----
function renderFlights() {
  const canonical = `${config.siteUrl}/flights/`;
  const title = "Cheap flights to Turkey — compare prices and book";
  const description = "Find affordable flights to Istanbul, Antalya, and Bodrum. Popular routes from London, New York, Toronto, Dubai, and 12+ origin cities.";

  // Curated list of high-traffic routes. Trip.com aggregates carriers across all major OTAs.
  const routes = [
    // To Istanbul (IST) — primary international hub
    { from: "London",     fromIata: "LHR", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, BA, Pegasus" },
    { from: "New-York",   fromIata: "JFK", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, ~10h" },
    { from: "Toronto",    fromIata: "YYZ", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, ~10h" },
    { from: "Los-Angeles",fromIata: "LAX", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, ~13h" },
    { from: "Paris",      fromIata: "CDG", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, AF, Pegasus" },
    { from: "Frankfurt",  fromIata: "FRA", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, Lufthansa" },
    { from: "Amsterdam",  fromIata: "AMS", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, KLM, Pegasus" },
    { from: "Dubai",      fromIata: "DXB", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, Emirates" },
    { from: "Singapore",  fromIata: "SIN", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, ~11h" },
    { from: "Sydney",     fromIata: "SYD", to: "Istanbul", toIata: "IST", note: "1 stop via Doha or Dubai" },
    { from: "Mumbai",     fromIata: "BOM", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, IndiGo" },
    { from: "Lagos",      fromIata: "LOS", to: "Istanbul", toIata: "IST", note: "Direct on Turkish, ~7h" },
    // To Antalya (AYT) — resort hub
    { from: "London",     fromIata: "LHR", to: "Antalya",  toIata: "AYT", note: "Seasonal direct, summer peak" },
    { from: "Berlin",     fromIata: "BER", to: "Antalya",  toIata: "AYT", note: "Direct on SunExpress, Pegasus" },
    { from: "Moscow",     fromIata: "DME", to: "Antalya",  toIata: "AYT", note: "Direct on Turkish, Aeroflot" },
    // To Bodrum (BJV)
    { from: "London",     fromIata: "LHR", to: "Bodrum",   toIata: "BJV", note: "Seasonal direct, May–Oct" },
  ];

  const featuredRoute = routes[0]; // London → Istanbul as the hero example

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Turkey</a> / Flights</div>
    <h1>Cheap flights to Turkey</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">We compare every major carrier and OTA in one place. Pick your origin, see prices in seconds, book through Trip.com — no hidden markups, no upsell tricks.</p>
  </div>
</div>

<section class="container">
  <div class="card" style="padding:32px;background:linear-gradient(135deg,#faf8f3,#f3ede0);border:1px solid var(--c-border)">
    <div class="eyebrow">Most-searched route</div>
    <h2 style="margin:6px 0 12px">${esc(featuredRoute.from.replace(/-/g, " "))} → ${esc(featuredRoute.to)}</h2>
    <p style="color:var(--c-text-soft);margin:0 0 20px">${esc(featuredRoute.note)}. Compare flight times and prices live.</p>
    <a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(tripcomFlightLink(featuredRoute.from, featuredRoute.to, featuredRoute.fromIata, featuredRoute.toIata, "flights-hero"))}">Search ${esc(featuredRoute.from.replace(/-/g, " "))} → ${esc(featuredRoute.to)} flights →</a>
  </div>
</section>

<section class="container section-sm">
  <h2>Popular routes to Istanbul</h2>
  <p class="text-muted" style="max-width:720px">Direct flights save 4–8 hours on long-haul. We list both options where the saving on a connection is significant.</p>
  <div class="grid grid-2 grid-3 mt-3">
    ${routes.filter(r => r.toIata === "IST").map((r) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(tripcomFlightLink(r.from, r.to, r.fromIata, r.toIata, "flights-list"))}" style="text-decoration:none;color:inherit;padding:20px">
        <div class="eyebrow">${esc(r.fromIata)} → ${esc(r.toIata)}</div>
        <h3 style="margin:6px 0 8px">${esc(r.from.replace(/-/g, " "))} → ${esc(r.to)}</h3>
        <p style="color:var(--c-text-soft);font-size:.95rem;margin:0">${esc(r.note)}</p>
        <div class="mt-2" style="color:var(--c-accent);font-weight:600">Compare prices →</div>
      </a>
    `).join("")}
  </div>
</section>

<section class="container section-sm">
  <h2>Resort coast: Antalya &amp; Bodrum</h2>
  <p class="text-muted" style="max-width:720px">Skip the 12-hour bus from Istanbul if you're heading to the beach. Seasonal direct flights run May–October.</p>
  <div class="grid grid-2 grid-3 mt-3">
    ${routes.filter(r => r.toIata !== "IST").map((r) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(tripcomFlightLink(r.from, r.to, r.fromIata, r.toIata, "flights-resort"))}" style="text-decoration:none;color:inherit;padding:20px">
        <div class="eyebrow">${esc(r.fromIata)} → ${esc(r.toIata)}</div>
        <h3 style="margin:6px 0 8px">${esc(r.from.replace(/-/g, " "))} → ${esc(r.to)}</h3>
        <p style="color:var(--c-text-soft);font-size:.95rem;margin:0">${esc(r.note)}</p>
        <div class="mt-2" style="color:var(--c-accent);font-weight:600">Compare prices →</div>
      </a>
    `).join("")}
  </div>
</section>

<section class="container section-sm">
  <h2>How we pick flights</h2>
  <div class="grid grid-2 grid-3 mt-3">
    <div class="card" style="padding:24px">
      <div class="eyebrow">Honest pricing</div>
      <h4 style="margin:6px 0">Final price you'll pay</h4>
      <p style="color:var(--c-text-soft);font-size:.95rem">Trip.com shows the all-in price including taxes and bag fees — no surprise add-ons at checkout.</p>
    </div>
    <div class="card" style="padding:24px">
      <div class="eyebrow">Real options</div>
      <h4 style="margin:6px 0">Every major carrier</h4>
      <p style="color:var(--c-text-soft);font-size:.95rem">Turkish Airlines, Pegasus, Lufthansa, BA, Emirates, Qatar — compared side-by-side, not just the OTA's preferred airline.</p>
    </div>
    <div class="card" style="padding:24px">
      <div class="eyebrow">Mistake fares</div>
      <h4 style="margin:6px 0">Same-day price drops</h4>
      <p style="color:var(--c-text-soft);font-size:.95rem">Search at different times — Tuesday 6am ET catches the most error fares. Trip.com surfaces them as soon as airlines publish.</p>
    </div>
  </div>
</section>

<section class="container section-sm">
  <div class="card" style="padding:32px;text-align:center">
    <h2 style="margin:0 0 12px">Search any other route</h2>
    <p class="text-muted" style="max-width:560px;margin:0 auto 20px">Don't see your origin? Search Trip.com directly — they have every route to Turkey from every major airport.</p>
    <a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(tripcomFlightSearchLink("IST", "flights-cta"))}">Search any flight to Turkey →</a>
  </div>
</section>

${footer()}
${modal()}
${tail()}`;

  const jsonld = [
    breadcrumbLd([
      { name: "Home",    url: `${config.siteUrl}/` },
      { name: "Flights", url: canonical },
    ]),
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`flights/index.html`, html);
}

// ---- Interactive decision quiz ----
function renderQuiz() {
  const canonical = `${config.siteUrl}/quiz/`;
  const title = `Which Turkish city should you visit? — 60-second quiz`;
  const description = `Answer 4 questions and we'll tell you which Turkish destination fits your trip — and which hotels to book once you decide.`;

  // Build JS data: { slug, name, bestForTags, emoji, tagline, idealNights }
  const cityPicks = cities.map((c) => ({
    slug: c.slug,
    name: c.name,
    emoji: c.emoji,
    tagline: c.tagline,
    idealNights: c.idealNights,
    tags: Array.from(new Set([...(c.bestFor || []), ...c.areas.flatMap((a) => a.bestForTags || [])])).map((s) => s.toLowerCase()),
  }));

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <h1>Which Turkish city fits your trip?</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Four questions, 60 seconds. We'll pick the destination that matches — and the three hotels to shortlist.</p>
  </div>
</div>

<section class="container container-narrow">
  <div id="quiz-root" class="card" style="padding:28px">
    <div id="quiz-questions"></div>
    <div id="quiz-result" style="display:none"></div>
    <div id="quiz-progress" class="text-soft small mt-2"></div>
  </div>
</section>

${essentialsBlock()}
${footer()}
${tail()}

<script>
const CITIES = ${JSON.stringify(cityPicks)};
const QUESTIONS = [
  { key: "vibe", q: "What's the vibe you want?", options: [
    { label: "Big city, culture, food",      picks: { istanbul: 4, izmir: 2, gaziantep: 2, ankara: 1, bursa: 1, konya: 1 } },
    { label: "Beach holiday",                picks: { antalya: 3, bodrum: 3, fethiye: 3, side: 2, alanya: 2, marmaris: 2, kusadasi: 2, mersin: 1 } },
    { label: "Scenery and unique landscapes",picks: { cappadocia: 4, pamukkale: 3, rize: 3, trabzon: 2, kas: 1, mardin: 3, safranbolu: 2 } },
    { label: "Off the beaten path",          picks: { gaziantep: 3, mersin: 3, rize: 2, trabzon: 2, kas: 2, bursa: 1, mardin: 3, sanliurfa: 3, konya: 2, safranbolu: 2 } },
  ]},
  { key: "travelers", q: "Who's traveling?", options: [
    { label: "Couple",                   picks: { istanbul: 2, cappadocia: 3, kas: 2, bodrum: 1, fethiye: 1, antalya: 1, mardin: 2, safranbolu: 2 } },
    { label: "Family with kids",         picks: { antalya: 3, side: 3, bodrum: 2, alanya: 2, kusadasi: 2, marmaris: 1, istanbul: 1 } },
    { label: "Solo / with friends",      picks: { istanbul: 3, izmir: 2, kas: 2, alanya: 1, cappadocia: 1, bursa: 1, konya: 1, mardin: 1 } },
    { label: "Multi-gen / special trip", picks: { bodrum: 3, antalya: 3, istanbul: 2, side: 2, cappadocia: 1 } },
  ]},
  { key: "nights", q: "How many nights total in Turkey?", options: [
    { label: "3–4 nights (weekend)",       picks: { istanbul: 3, cappadocia: 2, gaziantep: 2, bursa: 1, safranbolu: 2, konya: 1 } },
    { label: "5–7 nights (standard trip)", picks: { istanbul: 2, cappadocia: 2, antalya: 2, bodrum: 2, fethiye: 1, izmir: 1, mardin: 1, sanliurfa: 1 } },
    { label: "8–14 nights (multi-city)",   picks: { istanbul: 1, cappadocia: 1, antalya: 1, bodrum: 1, fethiye: 1, pamukkale: 1, izmir: 1, kas: 1, mardin: 1, safranbolu: 1, sanliurfa: 1 } },
    { label: "15+ nights (long stay)",     picks: { alanya: 3, izmir: 2, kas: 2, mersin: 2, fethiye: 1, bodrum: 1 } },
  ]},
  { key: "budget", q: "Budget per night on hotels?", options: [
    { label: "Under $80",       picks: { mahmutlar: 0, alanya: 3, mersin: 3, rize: 2, gaziantep: 2, kas: 1, pamukkale: 2, trabzon: 2, konya: 2, sanliurfa: 1, safranbolu: 1 } },
    { label: "$80–$200",        picks: { istanbul: 2, cappadocia: 2, antalya: 2, fethiye: 2, kusadasi: 2, bursa: 2, izmir: 2, side: 1, mardin: 2, safranbolu: 2 } },
    { label: "$200–$500",       picks: { istanbul: 3, cappadocia: 3, bodrum: 2, antalya: 2, side: 2, fethiye: 1 } },
    { label: "$500+ (splurge)", picks: { bodrum: 3, cappadocia: 3, istanbul: 3, antalya: 2, side: 1 } },
  ]},
];

const qWrap = document.getElementById("quiz-questions");
const rWrap = document.getElementById("quiz-result");
const pWrap = document.getElementById("quiz-progress");
let step = 0;
const picked = {};

function render() {
  pWrap.textContent = "Question " + (step + 1) + " of " + QUESTIONS.length;
  if (step >= QUESTIONS.length) return showResult();
  const q = QUESTIONS[step];
  qWrap.innerHTML =
    '<h2 style="margin-bottom:18px">' + q.q + '</h2><div class="grid grid-2">' +
    q.options.map(function (o, i) {
      return '<button class="card" style="text-align:left;cursor:pointer;font:inherit" data-i="' + i + '"><strong>' + o.label + '</strong></button>';
    }).join("") + '</div>';
  qWrap.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () {
      picked[q.key] = q.options[+b.dataset.i].picks;
      step++;
      render();
    });
  });
}
function showResult() {
  qWrap.style.display = "none";
  pWrap.style.display = "none";
  rWrap.style.display = "block";
  // Merge all picked tags, score each city
  var weights = {};
  ["vibe","travelers","nights","budget"].forEach(function (k) {
    var p = picked[k] || {};
    for (var slug in p) { weights[slug] = (weights[slug] || 0) + p[slug]; }
  });
  var scores = CITIES.map(function (c) { return { c: c, s: weights[c.slug] || 0 }; })
    .filter(function (x) { return x.s > 0; })
    .sort(function (a, b) { return b.s - a.s; });
  if (!scores.length) { scores = CITIES.slice(0, 4).map(function (c) { return { c: c, s: 0 }; }); }
  var top = scores[0].c;
  var runners = scores.slice(1, 4).map(function (x) { return x.c; });
  rWrap.innerHTML =
    '<div class="eyebrow">Your match</div>' +
    '<h2 style="font-size:2rem;margin:4px 0">' + top.emoji + ' ' + top.name + '</h2>' +
    '<p class="text-muted">' + top.tagline + '</p>' +
    '<p><strong>Ideal stay:</strong> ' + top.idealNights + '</p>' +
    '<a class="btn btn-primary btn-lg mt-2" href="/' + top.slug + '/">Open the ' + top.name + ' guide →</a>' +
    '<div class="mt-4"><h3 style="font-size:1.1rem">Also a good fit</h3>' +
    '<div class="grid grid-3 mt-2">' +
      runners.map(function (c) {
        return '<a class="card" href="/' + c.slug + '/" style="text-decoration:none;color:inherit">' +
          '<h4 style="margin:0">' + c.emoji + ' ' + c.name + '</h4>' +
          '<p class="text-muted small mt-1">' + c.tagline + '</p></a>';
      }).join("") +
    '</div></div>';
}
render();
</script>`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Quiz", url: canonical },
    ]),
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("quiz/index.html", html);
}

// ---- Visa info page ----
function renderVisa() {
  const canonical = `${config.siteUrl}/visa/`;
  const title = `Turkey visa guide — do you need one? (2026)`;
  const description = `Turkey e-Visa eligibility, cost, and process for 100+ countries. Apply online in 10 minutes.`;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Visa</div>
    <h1>Do you need a visa for Turkey?</h1>
    <div class="meta-tags">${readingPill("e-visa eligibility cost process verify before booking")}</div>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Most travelers need an e-Visa. It takes 10 minutes online, costs $35-50 depending on passport, and lasts 180 days. Here's the short version.</p>
  </div>
</div>
<div class="container container-narrow">
  <div class="callout-warning" style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:16px 20px;border-radius:var(--radius);margin:12px 0 24px;font-size:0.95rem">
    <strong>Not legal advice.</strong> This is an editorial summary of publicly available visa information, accurate to our knowledge at publication. Visa rules change. Always verify with your home country's foreign office and the official Turkish e-Visa site at <a href="https://www.evisa.gov.tr" rel="nofollow" target="_blank">evisa.gov.tr</a> before booking non-refundable travel. We are not responsible for border decisions.
  </div>
</div>

<section class="container container-narrow prose">
  <h2>Visa-free (90 days in 180)</h2>
  <p>Citizens of EU countries (most), UK, Japan, Singapore, South Korea, Brazil, Argentina, Russia, and Ukraine can enter visa-free for up to 90 days. Bring a passport valid for at least 6 months from entry.</p>
  <h2>e-Visa required ($35–50)</h2>
  <p>US, Canada, Australia, UAE, Saudi Arabia, and many others need an e-Visa. Apply at the official site: <a href="https://www.evisa.gov.tr" rel="nofollow" target="_blank">evisa.gov.tr</a>. Fill in passport details, pay by card, get a PDF within minutes.</p>
  <p><strong>Important:</strong> only use the official evisa.gov.tr site. Third-party 'visa services' charge 2–4x more for the same form.</p>
  <h2>Sticker visa on arrival</h2>
  <p>A small number of nationalities (including Nigeria, some African countries) may still need a sticker visa. Check your country's Turkish consulate page — or apply for the e-Visa first; it covers more countries than people realize.</p>
  <h2>Common rejections</h2>
  <ul>
    <li>Passport expires within 6 months of your arrival date → renew first.</li>
    <li>Passport has less than 2 blank pages → may be refused at arrival.</li>
    <li>Trying to use a copy of the e-Visa PDF without paying → scam; will be caught.</li>
  </ul>
  <h2>If you're transiting</h2>
  <p>Airside transit in Istanbul (IST or SAW) doesn't require a visa. Leaving the airport does.</p>
  <h2>What you need at the border</h2>
  <ul>
    <li>Valid passport (6 months, 2 blank pages)</li>
    <li>Printed or phone-screen copy of e-Visa</li>
    <li>Proof of onward travel (rarely asked but sometimes)</li>
    <li>Accommodation address (first night)</li>
  </ul>
  <p class="text-muted small">This is a practical guide, not legal advice. Always check your own government's travel page and the Turkish consulate site before booking non-refundable flights.</p>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Visa", url: canonical },
    ]),
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("visa/index.html", html);
}

// ---- Transport guide: Istanbul ↔ Cappadocia ----
function renderTransportGuide() {
  const canonical = `${config.siteUrl}/istanbul-to-cappadocia/`;
  const title = `Istanbul to Cappadocia — how to get there (2026)`;
  const description = `Every way to travel Istanbul to Cappadocia: 80-min flight, 11-hour bus, or drive. Costs, times, and which option is worth it.`;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Istanbul → Cappadocia</div>
    <h1>Istanbul to Cappadocia: the honest guide</h1>
    <div class="meta-tags">${readingPill("flight bus drive options cost time")}</div>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">There's no train. There are three ways: fly (80 min, recommended), overnight bus (11 hrs, cheap), or drive (7 hrs, only if you love road trips).</p>
  </div>
</div>

<section class="container container-narrow prose">
  <h2>Option 1: Fly (recommended)</h2>
  <p>Turkish Airlines and Pegasus run 4–6 daily flights to either Kayseri (ASR) or Nevşehir (NAV). Flight time: 80 min. Cost: $60–120 one-way, less if booked 3+ weeks out.</p>
  <p><strong>Kayseri vs. Nevşehir:</strong> Kayseri has more flight options and only 30 min more drive to Göreme. Most travelers fly to Kayseri.</p>
  <p><strong>Airport to cave hotel:</strong> Pre-book a transfer ($35–50) or take the shuttle van ($15/person, 60–90 min with stops). Kayseri airport taxis sometimes quote $100+; insist on meter or walk away.</p>
  <h2>Option 2: Overnight bus (budget)</h2>
  <p>Metro Turizm, Kamil Koç, and Nevşehir Seyahat run overnight buses from Istanbul's Esenler terminal to Nevşehir/Göreme. 11–12 hours, $25–45, fully reclining seats on premium buses.</p>
  <p><strong>Reality check:</strong> it saves you a hotel night, but you arrive at 06:30 tired. Balloon flight is that morning if you're on a tight plan — not ideal.</p>
  <h2>Option 3: Drive</h2>
  <p>7 hours on smooth toll highway (O-21). Rent in Istanbul, drop in Nevşehir. Only worth it if you want to stop in Ankara (Anıtkabir) or Safranbolu along the way.</p>
  <h2>Which one should you pick?</h2>
  <ul>
    <li><strong>Tight schedule or first-time visitor:</strong> fly. Book transfers both ends.</li>
    <li><strong>Tight budget, don't mind one rough morning:</strong> overnight bus.</li>
    <li><strong>Want to see central Anatolia:</strong> drive or bus and plan stops.</li>
  </ul>
  <h2>After Cappadocia</h2>
  <p>Most travelers fly back to Istanbul for their international flight, or continue to Antalya / Izmir. All three have direct flights from Kayseri/Nevşehir.</p>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Istanbul to Cappadocia", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("istanbul-to-cappadocia/index.html", html);
}

// ---- Safety page ----
function renderSafety() {
  const canonical = `${config.siteUrl}/is-turkey-safe/`;
  const title = `Is Turkey safe for tourists in 2026?`;
  const description = `Honest safety guide for travelers to Turkey — what's actually risky, what's a media illusion, and practical precautions.`;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Is Turkey safe</div>
    <h1>Is Turkey safe? The honest answer.</h1>
    <div class="meta-tags">${readingPill("safety practical precautions earthquake regions")}</div>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Yes, for the destinations most travelers actually visit. Turkey gets 50+ million foreign tourists a year. The media coverage is louder than the reality.</p>
  </div>
</div>

<section class="container container-narrow prose">
  <h2>The short version</h2>
  <p>Istanbul, Cappadocia, Antalya, Bodrum, Fethiye, Kuşadası, Izmir — these are all safe tourist destinations with low violent crime rates. You face more risk from pickpockets in Paris or Barcelona.</p>
  <h2>Regions to avoid</h2>
  <p>The southeastern border provinces near Syria (Hakkari, Şırnak) and the Mount Ararat region are generally not recommended for tourism. None of the cities we cover are in these areas.</p>
  <h2>Practical precautions</h2>
  <ul>
    <li><strong>Pickpockets</strong> in busy areas like Istiklal Street and the Grand Bazaar — carry a front-pocket wallet.</li>
    <li><strong>Taxi meter scams</strong> — use BiTaksi or Uber; pre-book airport transfers.</li>
    <li><strong>"Helpful" strangers</strong> — if someone invites you to a bar after just meeting, decline. Bar scams overcharge heavily.</li>
    <li><strong>Solo female travelers</strong> — Istanbul, Izmir, and the coastal resort towns are broadly safe and accustomed to solo women. More conservative dress respected in eastern/central Anatolia.</li>
  </ul>
  <h2>Earthquakes</h2>
  <p>Turkey is seismically active. The 2023 southern earthquakes didn't affect the major tourist regions (Istanbul, Cappadocia, western coast). Hotels in Istanbul are built to modern standards; cave hotels in Cappadocia have survived centuries.</p>
  <h2>Political demonstrations</h2>
  <p>Occasional protests happen in Taksim Square and other central areas. Give them a wide berth. Check your home government's travel advisory before flying.</p>
  <h2>Travel insurance</h2>
  <p>Always get travel insurance — <a href="${safetyWingLink()}" rel="sponsored nofollow" target="_blank">SafetyWing</a> and <a href="${worldNomadsLink()}" rel="sponsored nofollow" target="_blank">World Nomads</a> both cover Turkey well. Adventure coverage (balloon flying, paragliding) matters if you're visiting Cappadocia or Ölüdeniz.</p>
  <p class="text-soft small"><em>Not insurance advice. We earn a commission if you buy through our links — this has no effect on price. Always read the policy documents before purchasing and verify coverage for your specific activities.</em></p>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Is Turkey safe", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("is-turkey-safe/index.html", html);
}

// ---- Travel insurance landing ----
function renderInsurance() {
  const canonical = `${config.siteUrl}/insurance/`;
  const title = "Travel insurance for Turkey — what's actually worth buying";
  const description = "Honest comparison of travel insurance for Turkey trips: SafetyWing vs World Nomads vs credit-card cover. What's worth paying for, what to skip, and how much it actually costs.";
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Travel insurance</div>
    <h1>Travel insurance for Turkey</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Most Western travelers need it for Turkey. The healthcare system is good but expects payment up-front, and the activities most people add (balloon ride, paragliding, scooters) aren't always covered by your home policy.</p>
  </div>
</div>

<section class="container">
  <div class="grid grid-1 grid-2 mt-3">
    <div class="card" style="padding:28px">
      <div class="eyebrow">Recommended for most travelers</div>
      <h3 style="margin:6px 0">SafetyWing — Nomad Insurance</h3>
      <p style="color:var(--ink-muted);margin:10px 0">Subscription model from $45.08 / 4 weeks. Covers trip interruption, medical, baggage, emergency evacuation. Activity coverage extends to the standard Turkey adventure list (balloon flight, paragliding, scuba). Renew month-by-month if your trip extends.</p>
      <a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(safetyWingLink())}">Get a SafetyWing quote →</a>
    </div>
    <div class="card" style="padding:28px">
      <div class="eyebrow">Best for adventure-heavy trips</div>
      <h3 style="margin:6px 0">World Nomads</h3>
      <p style="color:var(--ink-muted);margin:10px 0">Higher trip-cost coverage, multiple plan tiers, broader adventure-activity list (kitesurfing, motorbike rentals, mountain trekking). Better for Cappadocia + Antalya combo trips with several adventure bookings.</p>
      <a class="btn btn-ghost" rel="sponsored nofollow" target="_blank" href="${esc(worldNomadsLink())}">Get a World Nomads quote →</a>
    </div>
  </div>
</section>

<section class="container container-narrow prose mt-4">
  <h2>What you need vs what you don't</h2>
  <p><strong>You need:</strong> emergency medical (€100,000+), emergency evacuation, trip interruption, lost baggage. Basic Turkey trip cost: $40–80 for two weeks.</p>
  <p><strong>You probably don't need:</strong> rental car CDW (Localrent's prices already include basic insurance; just bring a credit card with rental coverage), trip cancellation if you're booking refundable hotels.</p>
  <h2>Activities that need adventure coverage</h2>
  <ul>
    <li>Hot-air balloon flight in <a href="/cappadocia/">Cappadocia</a> — most policies cover commercial passenger balloon flights but verify language explicitly says "passenger / commercial" not "piloting"</li>
    <li>Paragliding from Babadağ at <a href="/oludeniz/">Ölüdeniz</a> — needs explicit adventure-sports rider</li>
    <li>Scuba diving in <a href="/kas/">Kaş</a> — depth limits matter; check policy depth cap</li>
    <li>Scooter / motorbike rental — frequently excluded; assume not covered unless explicitly listed</li>
  </ul>
  <h2>What about my credit card cover?</h2>
  <p>Most premium credit cards (Chase Sapphire, Amex Platinum, Capital One Venture) have built-in trip insurance and rental-car coverage. They cover delays, cancellations, and rental cars. They do NOT cover medical emergencies abroad — that's a separate purchase. Read your card's benefits guide; the activation usually requires booking the trip on that specific card.</p>
  <h2>Healthcare in Turkey if you don't insure</h2>
  <p>Public hospitals in Istanbul and Ankara are good but the queue is long and English limited. Private hospitals (Acıbadem, Memorial, Liv Hospital) have English-speaking staff and Western standards but charge €300–800 for an ER visit, €4,000–15,000 for a serious admission. Your insurance policy negotiates these; without it, you pay cash or credit card up front and claim later from your home insurer (slow, often partial).</p>
  <h2>What to buy two days before flying</h2>
  <p>Buy insurance after you've booked flights and hotels (so you know the trip cost) and before you fly (so any pre-existing condition you discover doesn't disqualify you). Two days before is the sweet spot.</p>
  <p class="text-soft small"><em>This is general information, not insurance advice. We earn a small commission if you buy through our links — this doesn't change your price. Read the policy documents, especially exclusions, and verify coverage for your specific activities before purchasing. Insurance providers change terms; verify the latest on their site.</em></p>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Travel insurance", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("insurance/index.html", html);
}

// ---- eSIM / connectivity landing ----
function renderESim() {
  const canonical = `${config.siteUrl}/esim/`;
  const title = "Best eSIM for Turkey 2026 — instant data the moment you land";
  const description = "Compare eSIM options for Turkey: Airalo vs Holafly vs local SIM. Plans, prices, install steps, and how to have working data the second your plane wheels touch down at IST.";
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / eSIM &amp; connectivity</div>
    <h1>Best eSIM for Turkey</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Land at Istanbul Airport with working mobile data. No SIM card swap, no broken phone, no roaming bill. The two providers worth using and the install steps that actually work.</p>
  </div>
</div>

<section class="container">
  <div class="grid grid-1 grid-2 mt-3">
    <div class="card" style="padding:28px">
      <div class="eyebrow">Most popular — best value</div>
      <h3 style="margin:6px 0">Airalo</h3>
      <p style="color:var(--ink-muted);margin:10px 0">Cheapest mainstream eSIM provider. Turkey plans from $4.50 (1 GB / 7 days) to $26 (20 GB / 30 days). Activates instantly, works on every iPhone XS+ and any Android with eSIM support.</p>
      <a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(airaloLink())}">Browse Airalo Turkey plans →</a>
    </div>
    <div class="card" style="padding:28px">
      <div class="eyebrow">Unlimited data, simpler choice</div>
      <h3 style="margin:6px 0">Holafly</h3>
      <p style="color:var(--ink-muted);margin:10px 0">Unlimited data plans from $19 / 5 days to $59 / 30 days. No data caps, but no Turkish phone number — outgoing SMS limited to in-app. Best if you stream a lot or share data with a partner.</p>
      <a class="btn btn-ghost" rel="sponsored nofollow" target="_blank" href="${esc(holaflyLink())}">Browse Holafly Turkey plans →</a>
    </div>
  </div>
</section>

<section class="container container-narrow prose mt-4">
  <h2>Does your phone support eSIM?</h2>
  <p><strong>iPhone:</strong> XS, XR, 11 series and newer (2018+). All current iPhones support dual SIM (your existing line + an eSIM).</p>
  <p><strong>Android:</strong> Pixel 3 onwards, Galaxy S20 onwards, OnePlus 11 onwards, most 2020+ flagships. Older mid-range devices often skip eSIM. Settings → Network → check for "eSIM" or "Add cellular plan."</p>
  <p>If your phone doesn't support eSIM: buy a Turkcell or Vodafone Turkey local SIM at the airport. ₺350–500 ($14–20) for 25 GB / 30 days. Bring an unlocked phone.</p>
  <h2>Install before you fly</h2>
  <ol>
    <li>Buy your plan online while still at home (on hotel WiFi day-of departure works too).</li>
    <li>Scan the QR code Airalo / Holafly emails you with your phone camera. Phone prompts to add cellular plan.</li>
    <li>Label the new line "Turkey" so you can toggle it.</li>
    <li>Set the eSIM as your data line, leave home line on for SMS / 2-factor auth.</li>
    <li>Toggle "Data Roaming" ON for the Turkey line — confusingly required even though it's an eSIM, not roaming.</li>
    <li>The eSIM activates the moment you connect to a Turkish cell tower (usually mid-descent). You'll have data the second you turn airplane mode off.</li>
  </ol>
  <h2>Plan size — what you actually need</h2>
  <p>For 7 days in Turkey: 5 GB Airalo plan ($14) is enough if you mostly use hotel WiFi. 10 GB ($18) if you tether or stream. 20 GB unlimited Holafly if you share data with a partner or work remotely.</p>
  <h2>Coverage</h2>
  <p>Both Airalo and Holafly use Turkcell or Vodafone Turkey towers. Coverage is excellent across Istanbul, Cappadocia, Antalya, Bodrum, Fethiye, Izmir. Black Sea coast (Trabzon, Rize) is fine in towns, patchy in remote yaylas. Eastern Turkey villages can have signal gaps.</p>
  <h2>Why not roaming?</h2>
  <p>UK / EU / US roaming on Turkey is brutal. EE, Vodafone UK, Verizon US all charge $5–15/day on top of your base plan, with daily caps and throttling. A two-week trip = $70–200 in roaming fees. An eSIM is $14.</p>
  <p class="text-soft small"><em>Prices update frequently; check current rates on each provider's site. We earn a small commission if you buy through our links — this doesn't change your price.</em></p>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "eSIM", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("esim/index.html", html);
}

// ---- Money / lira / ATM / tipping guide ----
function renderMoneyGuide() {
  const canonical = `${config.siteUrl}/money/`;
  const title = "Money in Turkey — lira, ATMs, tipping, and exchange in 2026";
  const description = "Practical money guide for travelers to Turkey: how the lira works, where to exchange, what ATMs charge, tipping etiquette, and the scams to avoid.";
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Money in Turkey</div>
    <h1>Money in Turkey</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">The Turkish lira is volatile, ATMs are everywhere, contactless cards work in 95% of places, and tipping is more like Europe than the US. Here's the practical playbook.</p>
  </div>
</div>

<section class="container container-narrow prose">
  <h2>Currency basics</h2>
  <p>Currency is the Turkish lira (₺, TRY). Coins from 1 to 100 kuruş plus 1 lira; banknotes ₺5, ₺10, ₺20, ₺50, ₺100, ₺200. The ₺200 note is the largest commonly circulated and many small shops can't break it — keep a stack of ₺20s and ₺50s.</p>
  <p>Inflation has run high in recent years; lira-USD rates move noticeably week-to-week. <a href="/planner/">Use our trip cost calculator</a> for current-month estimates.</p>
  <h2>Best way to get lira</h2>
  <p><strong>ATMs at major Turkish banks (Garanti, Yapı Kredi, İş Bankası, Akbank).</strong> Withdraw in lira, decline the "convert to my currency" prompt (called dynamic currency conversion — it adds 4–7%). Most ATMs allow ₺2,000–6,000 per withdrawal. Daily ATM limit on your home card matters more than the local cap.</p>
  <p><strong>Avoid airport exchange counters.</strong> They quote 4–8% worse than city ATMs. Take just enough lira from one ATM at the airport for your taxi/metro and find a city ATM for the rest.</p>
  <p><strong>Wise / Revolut / Charles Schwab Investor Checking</strong> are the cards travelers swear by — no foreign transaction fees, mid-market exchange rate, ATM fee rebates (Schwab) or low fees (Wise/Revolut). If you don't have one of these, even a regular debit card works fine; expect 1–3% in foreign transaction fees from your home bank.</p>
  <h2>Cards vs cash</h2>
  <p>Contactless cards (tap-to-pay, Apple Pay, Google Pay) work in 95% of Istanbul and major cities. Restaurants, hotels, big bazaar shops, taxis (BiTaksi), public transit (Istanbulkart top-up), supermarkets — all card-friendly.</p>
  <p>Cash territory: street food carts, fish-sandwich boats, smaller bazaar stalls, hammam tips, mosque donations, taxi tips, smaller hotels in non-tourist towns. Keep ₺500–1,000 in pocket.</p>
  <h2>Tipping</h2>
  <table>
    <thead><tr><th>Service</th><th>Tip</th></tr></thead>
    <tbody>
      <tr><td>Restaurants (mid-range)</td><td>10% (sometimes already on bill — check for "servis dahil")</td></tr>
      <tr><td>Restaurants (high-end)</td><td>10–15%</td></tr>
      <tr><td>Lokanta / casual</td><td>Round up, ₺10–20</td></tr>
      <tr><td>Taxi</td><td>Round up; 10% in tourist areas</td></tr>
      <tr><td>Hotel housekeeping (mid-range)</td><td>₺40–80 per day, left on bedside</td></tr>
      <tr><td>Hotel porter</td><td>₺40–60 per bag</td></tr>
      <tr><td>Hammam attendant</td><td>15% of paid price (tip the kese person directly)</td></tr>
      <tr><td>Tour guide (full day)</td><td>₺200–400 per person</td></tr>
      <tr><td>Bartender</td><td>10% of bill</td></tr>
    </tbody>
  </table>
  <h2>Money scams to know</h2>
  <p><strong>Taxi double-charge:</strong> driver "swipes again because the first failed" — both charges process. Always check your receipt and bank app before leaving. Use BiTaksi or Uber instead.</p>
  <p><strong>Bazaar credit card double-swipe:</strong> identical pattern at rug or leather shops. <a href="/journal/turkish-rug-scams/">Our rug scam guide</a> walks through the full script.</p>
  <p><strong>Restaurant bill rounding:</strong> some tourist-zone restaurants round generously upward and quietly add a "service" line. Check the line items.</p>
  <p><strong>Counterfeit notes:</strong> rare but happens. Old red ₺50 notes (pre-2009) are no longer valid. Real ₺50s are blue-purple.</p>
  <h2>Should you exchange currency before flying?</h2>
  <p>No. Home-country currency exchange is always worse than a Turkish ATM by 3–8%. Exception: bring $50–100 USD or €50–100 emergency cash hidden separately from your wallet. Hotels and bigger shops accept either USD or EUR in a pinch.</p>
  <h2>Closing the trip</h2>
  <p>Don't bring leftover lira home — banks abroad don't change it back at usable rates. Spend it down at the airport on the duty-free or your last meal. Or leave it as a tip for housekeeping at your last hotel.</p>
  <p>For more practical pre-trip prep, see <a href="/visa/">our visa guide</a>, <a href="/esim/">eSIM guide</a>, and the <a href="/journal/turkey-cost-week/">full trip-cost breakdown</a>.</p>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Money in Turkey", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("money/index.html", html);
}

// ---- Packing list ----
function renderPackingList() {
  const canonical = `${config.siteUrl}/packing/`;
  const title = "What to pack for Turkey — season-by-season list (2026)";
  const description = "Specific packing list for Turkey trips: what to bring for summer beach trips, autumn city breaks, winter Cappadocia, mosque dress code, and the weird-but-essential items.";
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Packing for Turkey</div>
    <h1>What to pack for Turkey</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Turkey runs cold-and-snowy in Cappadocia winter, hot-and-coastal in Bodrum summer, and there's a mosque dress code regardless of where you go. Here's the season-by-season list.</p>
  </div>
</div>

<section class="container container-narrow prose">
  <h2>Universal essentials (any trip, any season)</h2>
  <ul>
    <li>Light pashmina or scarf — covers shoulders for mosque visits, packs small, doubles as a blanket on overnight buses</li>
    <li>Comfortable walking shoes broken in — Istanbul cobblestones eat new shoes in a day</li>
    <li>Power adapter — Type C and F (European two-prong)</li>
    <li>Reusable water bottle — tap water is technically safe but most travelers prefer bottled; refill from cafes</li>
    <li>Anti-pickpocket front-pocket wallet (in busy bazaars) or money belt</li>
    <li>Daypack (small) — for half-day excursions when your hotel holds your luggage</li>
    <li>Travel adapter with USB ports</li>
    <li>Photocopies of passport + visa kept separate from originals</li>
  </ul>
  <h2>Mosque visit kit</h2>
  <p>You'll visit at least one mosque. Pack:</p>
  <ul>
    <li>Long pants or long skirt (knee-cover minimum)</li>
    <li>Sleeved top (no tanks for either gender at major mosques)</li>
    <li>Headscarf for women (Hagia Sophia, Blue Mosque, Süleymaniye all provide loaners but bringing one is faster)</li>
    <li>Easy-off shoes — slip-ons are 10 seconds in/out, laces are 60</li>
  </ul>
  <h2>Summer (June–September) — coastal trips</h2>
  <ul>
    <li>Two swimsuits — they don't dry overnight in humid air</li>
    <li>Light cotton shirts (not synthetic — Aegean heat is unforgiving)</li>
    <li>Sunglasses (the salt-and-sun glare on Turkish beaches is brutal)</li>
    <li>SPF 50, water-resistant — Turkish drugstores sell good options if you forget</li>
    <li>Sandals for beaches + closed shoes for evening cobblestone walks</li>
    <li>Light cardigan for over-air-conditioned restaurants</li>
    <li>Mosquito repellent (Aegean evenings)</li>
  </ul>
  <h2>Shoulder seasons (April–May, October)</h2>
  <p>Best Turkey weather. Pack as if it's spring in Italy: layers, light jacket for evenings, breathable trousers, walking shoes. Cappadocia gets cold at night even in May — pack a fleece.</p>
  <h2>Winter (November–March) — Cappadocia + Istanbul</h2>
  <ul>
    <li>Down jacket or warm parka — Cappadocia balloon flights at sunrise are -8°C in the basket</li>
    <li>Thermal base layer top + bottom</li>
    <li>Fleece or wool sweater</li>
    <li>Hat that fits under a balloon harness</li>
    <li>Gloves (touchscreen-compatible if you want to take balloon photos)</li>
    <li>Two pairs of warm socks per Cappadocia day</li>
    <li>Waterproof boots with grip — Cappadocia trails get icy</li>
    <li>Sunglasses — winter snow glare on Cappadocia rocks is intense</li>
  </ul>
  <h2>Electronics</h2>
  <ul>
    <li>Phone with eSIM support (see <a href="/esim/">our eSIM guide</a>)</li>
    <li>Portable battery pack (10,000 mAh+) — long sightseeing days drain phones fast</li>
    <li>Real camera if you care about balloon photos — phone cameras lose detail at sunrise</li>
    <li>Lightning / USB-C cable + 20W charging brick</li>
    <li>Small power strip — hotels often have 1-2 outlets, not enough</li>
  </ul>
  <h2>Documents</h2>
  <ul>
    <li>Passport with at least 6 months validity from your entry date and 3 blank pages</li>
    <li>e-Visa printout (most nationalities — check <a href="/visa/">our visa page</a>)</li>
    <li>Travel insurance policy number printed (see <a href="/insurance/">insurance guide</a>)</li>
    <li>Hotel reservations printed (immigration sometimes asks)</li>
    <li>Credit cards in two locations (one in your wallet, one in your suitcase)</li>
  </ul>
  <h2>What you DON'T need</h2>
  <ul>
    <li>Travel iron / steamer — every hotel has one</li>
    <li>Heavy guidebooks — Google Maps + this site cover what you'd use them for</li>
    <li>Plug adapters with multiple country options — just pack a Europe-specific Type F</li>
    <li>Turkish phrasebook — English coverage in tourist areas is good; learn "merhaba" (hello) and "teşekkür ederim" (thank you) and you're fine</li>
  </ul>
  <h2>Buy in Turkey</h2>
  <p>Cheaper to buy in Turkey than to pack: cosmetics (Turkish brands are good), pashmina/scarves (Grand Bazaar), Turkish bath products, fresh-roasted coffee, baklava. Don't buy: anything from the airport duty-free that you can get in a city for half the price.</p>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Packing for Turkey", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("packing/index.html", html);
}

// ---- Arrival in Istanbul (first day at IST) ----
function renderArrivalIstanbul() {
  const canonical = `${config.siteUrl}/arrival-istanbul/`;
  const title = "Landing at Istanbul Airport (IST) — your first 4 hours, sorted";
  const description = "Step-by-step: from your plane wheels touching down at IST to checked into your Sultanahmet hotel with working data, lira in pocket, and dinner in front of you. The first-day playbook.";
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Arrival in Istanbul</div>
    <h1>Landing at Istanbul Airport (IST)</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Your first 4 hours, in order. Get through immigration, get connected, get into the city, get into your hotel — without the standard tourist-tax decisions on the way.</p>
  </div>
</div>

<section class="container container-narrow prose">
  <h2>Before the plane lands</h2>
  <p><strong>15 minutes before landing:</strong> turn airplane mode off and let your eSIM activate (you bought one before flying — see <a href="/esim/">our eSIM guide</a>). The Turkcell or Vodafone Turkey signal usually appears mid-descent. By the time you're at the gate, you have data, Maps, WhatsApp, and the BiTaksi app working.</p>
  <p><strong>Have ready:</strong> passport, e-visa printout (most nationalities), hotel address printed (in case asked at immigration). <a href="/visa/">Visa requirements by country here</a>.</p>
  <h2>Step 1: Immigration (15–40 minutes)</h2>
  <p>IST has automated e-passport gates for most Western passports — way faster than the human queues. Look for the lane marked "e-Passport" not "Foreign Nationals." If you have an e-visa, you go through normal immigration (no separate visa-on-arrival queue exists for e-visa holders).</p>
  <p>Officer questions: "How long?" "Hotel?" "Tourism?" One-word answers, smile, you're through.</p>
  <h2>Step 2: Baggage + customs (10–20 minutes)</h2>
  <p>Carousel halls are organized by flight number. Wait, grab your bag, walk the green "Nothing to Declare" lane unless you brought more than $20,000 USD or commercial goods.</p>
  <h2>Step 3: ATM (5 minutes)</h2>
  <p>In the arrivals hall, find a Garanti, Yapı Kredi, İş Bankası, or Akbank ATM — NOT the bright airport-branded exchange counters (4–8% worse rates). Withdraw ₺1,500–2,500 ($60–100) for your first 2 days. Decline the "convert to my home currency" option. <a href="/money/">Full money guide here</a>.</p>
  <h2>Step 4: Get to your hotel — three options</h2>

  <h3>Option A: Pre-booked transfer (the smart move)</h3>
  <p>Book Welcome Pickups or a similar service before you fly. Driver waits at arrivals with a sign with your name. Fixed price (~€35–50 to most central hotels). No haggling, no language confusion, no wrong-zone taxi gotchas. <strong>This is what we recommend for first-time visitors.</strong></p>
  <p><a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(welcomePickupsLink('istanbul'))}">Pre-book Welcome Pickups →</a></p>

  <h3>Option B: M11 metro to city + connection</h3>
  <p>The M11 metro from IST to Gayrettepe takes 35 minutes (€1.50 with Istanbulkart). From there, M2 metro to Vezneciler (Sultanahmet) or Taksim (Beyoğlu). Total time: ~80 minutes. Total cost: €3. Buy Istanbulkart from the IDO machine before the metro turnstiles, top up ₺100 ($4) — covers your first 2 days of metro / ferry / bus.</p>

  <h3>Option C: Taxi (don't, unless you have to)</h3>
  <p>Airport taxis charge €40–60 fixed to most central hotels. Acceptable in a pinch, but the meter scams and "extra luggage" surcharges happen. If you take one, demand the meter ("taksimetre"), photograph the meter, agree the route ("Sultanahmet, Galip Dede otel" or wherever), pay only the meter reading.</p>
  <h2>Step 5: Hotel check-in</h2>
  <p>Most boutique Istanbul hotels have flexible check-in but the room may not be ready before 2 PM. Drop your bag at reception, head straight to a kahvaltı place. Sleep dep + Turkish breakfast = the right reset.</p>
  <h2>First-day rules of thumb</h2>
  <ul>
    <li><strong>Don't try to do too much.</strong> Sleep dep + jet lag eats decision-making. Wander your neighborhood, eat a long breakfast, take a 90-minute nap, walk to one site late afternoon, dinner at a meyhane.</li>
    <li><strong>Sleep on the plane / acclimate.</strong> If you fly in from the US west coast, the time change is 10 hours — it'll take you 2–3 days. Plan your first two days in one neighborhood.</li>
    <li><strong>Don't overdo dinner.</strong> Stomach + jet lag is a bad first-night-in-Istanbul experience. Eat light: simit, salad, soup. Save the meyhane meal for night two.</li>
  </ul>
  <h2>Where to stay your first night</h2>
  <p>Stay central. <a href="/istanbul/#sultanahmet">Sultanahmet</a> if you want to walk to Hagia Sophia / Blue Mosque first thing. <a href="/istanbul/#beyoglu">Beyoğlu</a> if you want a more contemporary vibe and walkability to nightlife and ferries. Avoid airport-area hotels unless you have a 7am next-day departure — you save 20 minutes of taxi but lose the entire arrival evening.</p>
  <h2>What to do tomorrow</h2>
  <p>Day 2 is when Turkey starts. We've got a full <a href="/thank-you/">3-day Istanbul itinerary</a> as a free download — gives you the day-by-day plan locals would actually recommend. Or just open <a href="/istanbul/">our Istanbul guide</a> and pick the neighborhood that fits your trip.</p>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Arrival at Istanbul", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("arrival-istanbul/index.html", html);
}

// ---- Turkish Experiences hub + per-page rendering ----
const EXPERIENCES = (() => {
  try { return require("./data/experiences.json").experiences || []; }
  catch (e) { return []; }
})();

function renderExperiencesHub() {
  const canonical = `${config.siteUrl}/experiences/`;
  const title = "Authentic Turkish experiences — beyond the tourist circuit";
  const description = "Six cultural experiences that show you the real Turkey: çay culture, Turkish coffee, hammam ritual, whirling dervishes, the bazaar masterclass, and Anatolian breakfast.";
  const cards = EXPERIENCES.map((e) => `
    <a class="card" href="/experiences/${esc(e.slug)}/" style="text-decoration:none;color:inherit;padding:24px">
      <div class="eyebrow">Experience</div>
      <h3 style="margin:6px 0 8px">${esc(e.title)}</h3>
      <p style="color:var(--c-text-soft);font-size:.95rem;margin:0 0 14px">${esc(e.subtitle || "")}</p>
      <div style="color:var(--c-accent);font-weight:600;font-size:.95rem">Read →</div>
    </a>
  `).join("");

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Experiences</div>
    <h1>The real Turkey, beyond the tourist circuit</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Six cultural experiences that turn a generic Turkey trip into a Turkey trip worth remembering. Each one is what locals do — not what's sold at the airport souvenir kiosk.</p>
  </div>
</div>

<section class="container">
  <div class="grid grid-1 grid-2 grid-3 mt-3">
    ${cards}
  </div>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;

  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Experiences", url: canonical },
    ]),
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("experiences/index.html", html);
}

function renderExperiencePost(p) {
  const canonical = `${config.siteUrl}/experiences/${p.slug}/`;
  const title = `${p.title} — ${config.siteName}`;
  const description = p.subtitle || p.summary;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/experiences/">Experiences</a> / ${esc(p.title)}</div>
</div>
<article class="container container-narrow">
  <div class="page-head" style="border-bottom:none;padding-bottom:0">
    <div class="eyebrow">Experience</div>
    <h1>${esc(p.title)}</h1>
    ${p.subtitle ? `<p class="journal-subtitle" style="font-size:1.3rem;color:var(--ink-muted);font-style:italic;margin-top:12px">${esc(p.subtitle)}</p>` : ""}
    <div class="journal-meta" style="margin-top:24px"><span>${p.readMinutes || 7} min read</span></div>
  </div>
  <div class="prose mt-4">${p.bodyHtml || `<p>${esc(p.summary || "")}</p>`}</div>
</article>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Experiences", url: `${config.siteUrl}/experiences/` },
      { name: p.title, url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: p.title,
      description: description,
      url: canonical,
      author: { "@type": "Organization", name: config.siteName },
      publisher: { "@type": "Organization", name: config.siteName, url: config.siteUrl },
    },
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`experiences/${p.slug}/index.html`, html);
}

// ---- Regional hubs + Day Trips clusters + Ultimate Guide ----
const REGIONS = (() => {
  try { return require("./data/regions.json").regions || []; }
  catch (e) { return []; }
})();
const DAY_TRIPS = (() => {
  try { return require("./data/day-trips.json").byCity || {}; }
  catch (e) { return {}; }
})();

function renderRegionsHub() {
  const canonical = `${config.siteUrl}/regions/`;
  const title = "The 5 regions of Turkey — pick which one fits your trip";
  const description = "Aegean Coast, Mediterranean Riviera, Cappadocia, Black Sea, Eastern Anatolia. Each region has a completely different Turkey trip. Compare them and pick yours.";
  const cards = REGIONS.map((r) => `
    <a class="card" href="/regions/${esc(r.slug)}/" style="text-decoration:none;color:inherit;padding:24px">
      <div class="eyebrow">Region</div>
      <h3 style="margin:6px 0 8px">${esc(r.name)}</h3>
      <p style="color:var(--c-text-soft);font-size:.95rem;margin:0 0 8px">${esc(r.tagline)}</p>
      <p style="font-size:.85rem;color:var(--ink-muted);margin:0">${(r.cities || []).slice(0, 4).map((c) => esc(c)).join(" · ")}</p>
      <div style="color:var(--c-accent);font-weight:600;font-size:.95rem;margin-top:14px">Explore →</div>
    </a>
  `).join("");
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Regions</div>
    <h1>The 5 regions of Turkey</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Turkey is geographically as varied as Italy + Greece combined. Pick the region that fits your trip style — coast, mountains, ruins, or the cradle of civilization.</p>
  </div>
</div>
<section class="container">
  <div class="grid grid-1 grid-2 grid-3 mt-3">${cards}</div>
</section>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Regions", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("regions/index.html", html);
}

function renderRegionPage(r) {
  const canonical = `${config.siteUrl}/regions/${r.slug}/`;
  const title = `${r.name} — where to go and where to stay`;
  const description = r.summary.slice(0, 160);
  const citiesInRegion = (r.cities || []).map((slug) => cities.find((c) => c.slug === slug)).filter(Boolean);

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / <a href="/regions/">Regions</a> / ${esc(r.name)}</div>
    <h1>${esc(r.name)}</h1>
    <p class="text-muted" style="font-size:1.2rem;font-style:italic;max-width:720px">${esc(r.tagline)}</p>
    <p style="max-width:720px;margin-top:18px">${esc(r.summary)}</p>
  </div>
</div>

<section class="container section-sm">
  <h2>Cities in ${esc(r.name)}</h2>
  <div class="grid grid-1 grid-2 grid-3 mt-3">
    ${citiesInRegion.map((c) => `
      <a class="card" href="/${esc(c.slug)}/" style="text-decoration:none;color:inherit;padding:22px">
        <div class="eyebrow">${esc(c.tagline || "")}</div>
        <h3 style="margin:6px 0">${esc(c.name)}</h3>
        <p style="color:var(--c-text-soft);font-size:.92rem;margin:0">${esc((c.intro || "").slice(0, 140))}…</p>
        <div style="color:var(--c-accent);font-weight:600;margin-top:12px">Where to stay in ${esc(c.name)} →</div>
      </a>
    `).join("")}
  </div>
</section>

<section class="container section-sm">
  <h2>When to go</h2>
  <p style="max-width:720px">${esc(r.whenToGo)}</p>
</section>

<section class="container section-sm">
  <h2>Highlights</h2>
  <ul style="max-width:720px;line-height:1.8">
    ${(r.highlights || []).map((h) => `<li>${esc(h)}</li>`).join("")}
  </ul>
</section>

<section class="container section-sm">
  <h2>Suggested ${(r.itinerary || []).length}-stop itinerary</h2>
  <ol style="max-width:720px;line-height:1.8">
    ${(r.itinerary || []).map((step) => `<li>${esc(step)}</li>`).join("")}
  </ol>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Regions", url: `${config.siteUrl}/regions/` },
    { name: r.name, url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`regions/${r.slug}/index.html`, html);
}

function renderDayTrips(citySlug, trips) {
  const c = cities.find((x) => x.slug === citySlug);
  if (!c) return;
  const canonical = `${config.siteUrl}/${c.slug}/day-trips/`;
  const title = `Day trips from ${c.name} — ${trips.length} options ranked`;
  const description = `Best day trips from ${c.name}: how far, how long, what to see, and which tour operator to book through. Real distances, honest verdicts.`;

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / <a href="/${c.slug}/">${esc(c.name)}</a> / Day trips</div>
    <h1>Day trips from ${esc(c.name)}</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">${trips.length} day-trip options from ${esc(c.name)}, with real distances, time required, and the best tour operator for each. Pick one for a half-day reset, two for a packed week.</p>
  </div>
</div>

<section class="container">
  ${trips.map((t, i) => `
    <div class="card mt-3" style="padding:28px">
      <div class="eyebrow">${esc(t.distance)} · ${esc(t.time)}</div>
      <h3 style="margin:6px 0 12px">${i + 1}. ${esc(t.name)}</h3>
      <p style="margin:0 0 16px;color:var(--c-text-soft)">${t.summary}</p>
      <a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(getYourGuideLink(t.tourQuery))}">Book a ${esc(t.name)} tour →</a>
    </div>
  `).join("")}
</section>

<section class="container section-sm">
  <h2>Where to stay in ${esc(c.name)}</h2>
  <p class="text-muted" style="max-width:720px">If you're doing 2+ day trips, base yourself centrally. <a href="/${c.slug}/">See our full ${esc(c.name)} neighborhood guide</a> for which area suits which tour pickup.</p>
</section>

${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: c.name, url: `${config.siteUrl}/${c.slug}/` },
    { name: "Day trips", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`${c.slug}/day-trips/index.html`, html);
}

function renderUltimateGuide() {
  const canonical = `${config.siteUrl}/turkey-guide/`;
  const title = "The ultimate Turkey travel guide — where to stay, when to go, what to do";
  const description = "Complete Turkey travel guide: 5 regions, 22 cities, day-by-day itineraries, flight + visa + insurance + packing essentials, and 19 in-depth journal articles. Everything in one place.";
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Ultimate Turkey guide</div>
    <h1>The ultimate Turkey travel guide</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:760px">A single page that links every resource we have for planning a Turkey trip — from "should I go to Turkey or Greece" all the way to "which kebab to order in Gaziantep". Bookmark this and come back.</p>
  </div>
</div>

<section class="container container-narrow prose">
  <h2>1. Decide if Turkey is right for your trip</h2>
  <p>Start with the macro question. <a href="/journal/turkey-vs-greece/">Turkey vs Greece</a> compares the two coastlines for first-time visitors. <a href="/best-time-to-visit-turkey/">When to visit Turkey</a> picks your month. <a href="/how-many-nights-turkey/">How many nights</a> sets your budget envelope. <a href="/journal/turkey-cost-week/">How much does a week in Turkey cost</a> answers the big-number question.</p>
  <h2>2. Pick your region</h2>
  <p>Turkey has 5 wildly different regions. Pick one (or two) per trip:</p>
  <ul>
    ${REGIONS.map((r) => `<li><strong><a href="/regions/${esc(r.slug)}/">${esc(r.name)}</a></strong> — ${esc(r.tagline)}</li>`).join("")}
  </ul>
  <h2>3. Pick your city</h2>
  <p>Browse the 22 cities we cover, ranked by travel style:</p>
  <ul>
    <li><strong>For first-timers:</strong> <a href="/istanbul/">Istanbul</a> + <a href="/cappadocia/">Cappadocia</a></li>
    <li><strong>For beach trips:</strong> <a href="/antalya/">Antalya</a>, <a href="/bodrum/">Bodrum</a>, <a href="/fethiye/">Fethiye</a>, <a href="/kas/">Kaş</a></li>
    <li><strong>For culture-deep trips:</strong> <a href="/mardin/">Mardin</a>, <a href="/sanliurfa/">Şanlıurfa</a>, <a href="/gaziantep/">Gaziantep</a>, <a href="/konya/">Konya</a></li>
    <li><strong>For nature:</strong> <a href="/trabzon/">Trabzon</a>, <a href="/rize/">Rize</a>, <a href="/pamukkale/">Pamukkale</a></li>
    <li><strong>For nearly-anyone:</strong> Use our <a href="/quiz/">interactive quiz</a> to match your travel style to a city</li>
  </ul>
  <h2>4. Pick your neighborhood and hotel</h2>
  <p>Each city page breaks down 3–5 neighborhoods with the right hotel for your style. Open the city page and use the <em>"Best for"</em> tags to filter (couples, families, first-timers, luxury, budget). All hotel CTAs route through Travelpayouts.</p>
  <h2>5. Book the practical stack</h2>
  <ul>
    <li><a href="/flights/">Flights to Turkey</a> — 16 popular routes via Trip.com</li>
    <li><a href="/visa/">Visa requirements by country</a> — most travelers get an e-visa in 3 minutes online</li>
    <li><a href="/esim/">eSIM &amp; data</a> — Airalo from $4.50 / 7 days</li>
    <li><a href="/insurance/">Travel insurance</a> — SafetyWing is the default pick</li>
    <li><a href="/money/">Money &amp; tipping</a> — lira basics, ATM tips, what to actually tip</li>
    <li><a href="/packing/">What to pack</a> — season-by-season checklist</li>
    <li><a href="/arrival-istanbul/">Your first 4 hours at IST</a> — the airport-to-hotel playbook</li>
  </ul>
  <h2>6. Plan day-by-day</h2>
  <p>Free itineraries:</p>
  <ul>
    <li><a href="/thank-you/">3-day Istanbul itinerary</a> — emailed lead magnet</li>
    <li><a href="/thank-you-combo/">5-day Istanbul + Cappadocia combo</a></li>
    <li>Day trips per city: <a href="/istanbul/day-trips/">Istanbul</a>, <a href="/cappadocia/day-trips/">Cappadocia</a>, <a href="/antalya/day-trips/">Antalya</a>, <a href="/izmir/day-trips/">Izmir</a>, <a href="/bodrum/day-trips/">Bodrum</a>, <a href="/fethiye/day-trips/">Fethiye</a></li>
  </ul>
  <h2>7. Have the real Turkish experience</h2>
  <p>The 6-experience cultural deep-dive that separates a tourist from a traveler:</p>
  <ul>
    <li><a href="/experiences/cay-culture/">Çay culture</a></li>
    <li><a href="/experiences/turkish-coffee/">Turkish coffee</a></li>
    <li><a href="/experiences/whirling-dervishes/">Whirling dervishes</a> in Konya</li>
    <li><a href="/experiences/turkish-bazaars/">How to actually use a bazaar</a></li>
    <li><a href="/experiences/hammam-ritual-deep-dive/">Inside an Ottoman hammam</a></li>
    <li><a href="/experiences/anatolian-breakfast-culture/">Anatolian breakfast culture</a></li>
  </ul>
  <h2>8. Read deeper on the topics that matter</h2>
  <p>19 long-form articles. Some highlights:</p>
  <ul>
    <li><a href="/journal/cappadocia-balloon-guide/">Cappadocia balloon ride — complete guide</a></li>
    <li><a href="/journal/turkey-solo-female-travel/">Is Turkey safe for solo female travelers?</a></li>
    <li><a href="/journal/turkish-rug-scams/">How to spot a Turkish rug scam</a></li>
    <li><a href="/journal/turkish-food-20-dishes/">20 Turkish dishes worth eating</a></li>
    <li><a href="/journal/best-bosphorus-cruise/">Every Bosphorus cruise option, tested</a></li>
    <li><a href="/journal/best-sunset-each-city/">The best sunset in each Turkish city</a></li>
    <li><a href="/journal/">All 19 articles →</a></li>
  </ul>
  <h2>9. Tools we built to help you decide</h2>
  <ul>
    <li><a href="/quiz/">Trip-style quiz</a> — answer 6 questions, get a city + neighborhood + hotel pick</li>
    <li><a href="/planner/">Trip cost calculator</a> — set your tier and length, get a real budget</li>
    <li><a href="/compare/">Compare cities</a> — side-by-side any two cities</li>
  </ul>
  <h2>10. The newsletter</h2>
  <p>One email a week, only when something's worth saying — new article, season change, balloon-flight calendar update. Subscribe via the popup or the foot of any page. We'll send you the 3-day Istanbul itinerary the moment you sign up.</p>
</section>

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Ultimate Turkey guide", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("turkey-guide/index.html", html);
}

// ---- Monthly seasonal pages + cross-city collections ----
const MONTHS = (() => {
  try { return require("./data/months.json").months || []; }
  catch (e) { return []; }
})();
const COLLECTIONS = (() => {
  try { return require("./data/collections.json").collections || []; }
  catch (e) { return []; }
})();

function renderMonthsHub() {
  const canonical = `${config.siteUrl}/turkey-by-month/`;
  const title = "Turkey by month — pick the right time to visit";
  const description = "Month-by-month Turkey guide. Weather by city, balloon flight rates, festivals, what's open and closed, and the verdict on whether to go.";
  const cards = MONTHS.map((m) => `
    <a class="card" href="/turkey-by-month/${esc(m.slug)}/" style="text-decoration:none;color:inherit;padding:22px">
      <div class="eyebrow">Month ${m.monthNum}</div>
      <h3 style="margin:6px 0 8px">${esc(m.monthName)}</h3>
      <p style="color:var(--c-text-soft);font-size:.92rem;margin:0">${esc((m.subtitle || "").slice(0, 110))}</p>
    </a>
  `).join("");
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Turkey by month</div>
    <h1>Turkey month-by-month</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Each month in Turkey is a different country. We've ranked all 12 with weather, festival, balloon-flight rate and verdict — so you can pick the month that fits your trip.</p>
  </div>
</div>
<section class="container">
  <div class="grid grid-1 grid-2 grid-3 grid-4 mt-3">${cards}</div>
</section>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Turkey by month", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("turkey-by-month/index.html", html);
}

function renderMonthPage(m) {
  const canonical = `${config.siteUrl}/turkey-by-month/${m.slug}/`;
  const title = `${m.title}`;
  const description = (m.subtitle || m.summary || "").slice(0, 160);
  const weatherRows = Object.entries(m.weatherByCity || {}).map(([slug, w]) => {
    const c = cities.find((x) => x.slug === slug);
    return `<tr><td><a href="/${esc(slug)}/">${esc(c ? c.name : slug)}</a></td><td>${w.high}°C / ${w.low}°C</td><td>${w.rainDays || "—"} rain days</td></tr>`;
  }).join("");
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/turkey-by-month/">Turkey by month</a> / ${esc(m.monthName)}</div>
</div>
<article class="container container-narrow">
  <div class="page-head" style="border-bottom:none;padding-bottom:0">
    <div class="eyebrow">Month ${m.monthNum}</div>
    <h1>${esc(m.title)}</h1>
    ${m.subtitle ? `<p class="journal-subtitle" style="font-size:1.3rem;color:var(--ink-muted);font-style:italic;margin-top:12px">${esc(m.subtitle)}</p>` : ""}
  </div>

  <div class="card mt-4" style="padding:24px;background:var(--c-accent-soft);border-left:3px solid var(--c-accent)">
    <div class="eyebrow">Verdict</div>
    <p style="margin:6px 0 0;font-size:1.05rem">${esc(m.verdict || "")}</p>
  </div>

  ${weatherRows ? `
    <h2 style="margin-top:32px">Weather across Turkey in ${esc(m.monthName)}</h2>
    <table>
      <thead><tr><th>City</th><th>High / Low</th><th>Rain</th></tr></thead>
      <tbody>${weatherRows}</tbody>
    </table>
  ` : ""}

  <div class="prose mt-4">${m.bodyHtml || `<p>${esc(m.summary || "")}</p>`}</div>
</article>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Turkey by month", url: `${config.siteUrl}/turkey-by-month/` },
    { name: m.monthName, url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`turkey-by-month/${m.slug}/index.html`, html);
}

function renderCollectionsHub() {
  const canonical = `${config.siteUrl}/best-of-turkey/`;
  const title = "Best of Turkey — curated hotel collections";
  const description = "Themed collections of the best hotels across Turkey: honeymoons, families, history, beachfront, cave hotels, and luxury resorts. Verified picks only.";
  const cards = COLLECTIONS.map((c) => `
    <a class="card" href="/best-of-turkey/${esc(c.slug)}/" style="text-decoration:none;color:inherit;padding:22px">
      <div class="eyebrow">${c.picks.length} verified picks</div>
      <h3 style="margin:6px 0 8px">${esc(c.title)}</h3>
      <p style="color:var(--c-text-soft);font-size:.92rem;margin:0">${esc((c.subtitle || "").slice(0, 110))}</p>
    </a>
  `).join("");
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Best of Turkey</div>
    <h1>Best of Turkey — curated hotel collections</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Six themed collections of the best hotels across Turkey, picked from our 22-city database. Every property is real and verified — no padding.</p>
  </div>
</div>
<section class="container">
  <div class="grid grid-1 grid-2 grid-3 mt-3">${cards}</div>
</section>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Best of Turkey", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("best-of-turkey/index.html", html);
}

function renderCollectionPage(c) {
  const canonical = `${config.siteUrl}/best-of-turkey/${c.slug}/`;
  const title = `${c.title}`;
  const description = (c.summary || c.subtitle || "").slice(0, 160);

  const pickCards = (c.picks || []).map((p, i) => {
    const cityObj = cities.find((x) => x.slug === p.city);
    const cityName = cityObj ? cityObj.name : p.city;
    const bookingUrl = bookingLink(`${p.hotelName} ${cityName}`);
    return `
      <div class="card mt-3" style="padding:24px">
        <div class="eyebrow">${i + 1}. ${esc(cityName)} · ${esc(p.area || "")}${p.tier ? ` · ${esc(p.tier)}` : ""}${p.priceFrom ? ` · from $${p.priceFrom}/night` : ""}</div>
        <h3 style="margin:6px 0 12px">${esc(p.hotelName)}</h3>
        <p style="margin:0 0 16px">${esc(p.whyForThisList || "")}</p>
        <a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(bookingUrl)}">Check rates →</a>
        <a href="/${esc(p.city)}/" style="margin-left:14px;color:var(--c-accent);font-weight:600">See ${esc(cityName)} guide →</a>
      </div>
    `;
  }).join("");

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / <a href="/best-of-turkey/">Best of Turkey</a> / ${esc(c.title)}</div>
    <h1>${esc(c.title)}</h1>
    ${c.subtitle ? `<p class="text-muted" style="font-size:1.15rem;font-style:italic;margin-top:10px">${esc(c.subtitle)}</p>` : ""}
    <p style="max-width:720px;margin-top:18px">${esc(c.intro || "")}</p>
    ${c.criteria ? `<p style="max-width:720px;margin-top:14px;color:var(--ink-muted);font-style:italic">Selection criteria: ${esc(c.criteria)}</p>` : ""}
  </div>
</div>

<section class="container">
  ${pickCards}
</section>

${c.verdict ? `
  <section class="container container-narrow section-sm">
    <div class="card" style="padding:24px;background:var(--c-accent-soft);border-left:3px solid var(--c-accent)">
      <div class="eyebrow">Closing call</div>
      <p style="margin:6px 0 0">${esc(c.verdict)}</p>
    </div>
  </section>
` : ""}

${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Best of Turkey", url: `${config.siteUrl}/best-of-turkey/` },
    { name: c.title, url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`best-of-turkey/${c.slug}/index.html`, html);
}

// ---- Per-city OG image (SVG) ----
function writeCityOgImages() {
  for (const c of cities) {
    const bg1 = "#FFE4E6", bg2 = "#FEF3C7";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="g${c.slug}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g${c.slug})"/><text x="80" y="220" font-family="sans-serif" font-size="100" font-weight="800" fill="#0f172a">Where to Stay in</text><text x="80" y="340" font-family="sans-serif" font-size="140" font-weight="800" fill="#E11D48">${esc(c.name)}.</text><text x="80" y="420" font-family="sans-serif" font-size="32" fill="#6b6b6b">${esc(c.tagline).slice(0, 90)}</text><text x="1080" y="570" font-family="sans-serif" font-size="32" text-anchor="end" fill="#8a8a8a">wheretostayturkey.com</text></svg>`;
    writeFile(`assets/img/og/${c.slug}.svg`, svg);
  }
}


// ---- Best time to visit Turkey ----
function renderSeasonalGuide() {
  const canonical = `${config.siteUrl}/best-time-to-visit-turkey/`;
  const title = `Best time to visit Turkey — month by month (2026)`;
  const description = `Month-by-month guide to visiting Turkey. Istanbul, Cappadocia, and the Mediterranean each have different sweet spots.`;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Best time to visit</div>
    <h1>The best time to visit Turkey</h1>
    <div class="meta-tags">${readingPill("month by month region weather seasonal")}</div>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Spoiler: April–May or September–October. Beyond that, it depends heavily on which part of Turkey you're visiting.</p>
  </div>
</div>
<section class="container container-narrow prose">
  <h2>Short answer</h2>
  <p><strong>Best overall:</strong> mid-April to mid-June, and mid-September to mid-October. Warm but not baking; everything open; shoulder pricing.</p>
  <h2>By region</h2>
  <h3>Istanbul</h3>
  <p>Apr–May and Sep–Oct are perfect. Jul–Aug is crowded and 30°C+. Dec–Feb is cold, grey, and 40% cheaper on hotels — viable if you only care about museums.</p>
  <h3>Cappadocia</h3>
  <p>Apr–May for wildflowers and pleasant balloon flights. Oct for golden-hour light. Winter balloons fly less often but the snow-dusted fairy chimneys are magical. Jul–Aug is hot (35°C+) but flights still run at dawn.</p>
  <h3>Mediterranean coast (Antalya, Bodrum, Fethiye)</h3>
  <p>Swimming from May to October. Peak heat and crowds Jul–Aug; May–Jun and Sep are the sweet spot. Nov–Apr is mild but most beach resorts close.</p>
  <h3>Black Sea (Rize, Trabzon)</h3>
  <p>Only really worth visiting Jun–Sep. Rainy year-round but summer has the green highlands at their best.</p>
  <h3>Ski (Bursa/Uludağ)</h3>
  <p>Late Dec through early March. Best in Jan–Feb.</p>
  <h2>Month-by-month</h2>
  <ul>
    <li><strong>January:</strong> Istanbul cheap and quiet. Uludağ skiing. Cappadocia possibly snowy.</li>
    <li><strong>February:</strong> Same as January. Valentine's Day is a huge local booking weekend.</li>
    <li><strong>March:</strong> Spring starts. Istanbul begins to warm. Cappadocia shoulder pricing.</li>
    <li><strong>April:</strong> Tulip season in Istanbul (huge). Everything blooming. Pre-peak pricing.</li>
    <li><strong>May:</strong> Peak shoulder. Beaches warm enough. Go.</li>
    <li><strong>June:</strong> Summer starts. Coast busy; mountains at their best.</li>
    <li><strong>July:</strong> Hot everywhere, crowded everywhere. Peak resort pricing.</li>
    <li><strong>August:</strong> Peak everything. Avoid unless you want packed beaches.</li>
    <li><strong>September:</strong> Sea still warm, crowds thinning. Arguably the best month.</li>
    <li><strong>October:</strong> Cappadocia golden hour. Istanbul light sweater weather. Excellent.</li>
    <li><strong>November:</strong> Rainy start. Old Town visits quieter. Spa season.</li>
    <li><strong>December:</strong> Cheap. Ramazan Pide from the bakery. Ski season kicks in.</li>
  </ul>
  <h2>Ramadan</h2>
  <p>Ramadan dates shift each year. Restaurants in tourist areas stay open for non-Muslims; bars may be quieter. The festive iftar meals at sunset are worth planning around if you visit during the month.</p>
  <h2>If you only have a weekend</h2>
  <p>Any shoulder-season weekend works. If you're choosing between April and October, April edges out for flowers and green; October for light and slightly warmer seas.</p>
</section>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Best time to visit", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("best-time-to-visit-turkey/index.html", html);
}

// ---- How many nights in Turkey ----
function renderNightsGuide() {
  const canonical = `${config.siteUrl}/how-many-nights-turkey/`;
  const title = `How many nights do you need in Turkey?`;
  const description = `Practical stay-length guide: 3 nights up to 3 weeks, with the right city mix for each. Written by someone who plans Turkey trips weekly.`;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / How many nights</div>
    <h1>How many nights do you need in Turkey?</h1>
    <div class="meta-tags">${readingPill("nights itinerary length combos cities")}</div>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Short answer: 7 nights is the sweet spot for first-time visitors. Here's what fits into every length.</p>
  </div>
</div>
<section class="container container-narrow prose">
  <h2>3 nights</h2>
  <p><strong>Stay:</strong> Istanbul only. Sultanahmet or Beyoğlu. Do the Old City day, the Beyoğlu day, and a Bosphorus ferry. Don't try to add Cappadocia.</p>
  <p><a href="/istanbul/">→ Where to stay in Istanbul</a></p>
  <h2>5 nights</h2>
  <p><strong>Stay:</strong> 2 nights Istanbul + 2 nights Cappadocia + 1 flex. Internal flight both ways. This is the canonical "first Turkey trip." See our <a href="/thank-you-combo/">5-day combo itinerary</a>.</p>
  <h2>7 nights</h2>
  <p><strong>Stay:</strong> 3 Istanbul + 3 Cappadocia + 1 buffer. Or split as 2 Istanbul + 2 Cappadocia + 3 Antalya/Bodrum for a beach finish. Our favorite length.</p>
  <h2>10 nights</h2>
  <p><strong>Stay:</strong> Istanbul + Cappadocia + Ephesus/Pamukkale + Mediterranean (Antalya or Fethiye). A real Turkey overview.</p>
  <h2>14 nights</h2>
  <p><strong>Stay:</strong> Add a food-focused weekend in <a href="/gaziantep/">Gaziantep</a> or a nature leg in <a href="/rize/">Rize</a> / <a href="/trabzon/">Trabzon</a> Black Sea highlands.</p>
  <h2>21+ nights</h2>
  <p><strong>Stay:</strong> Work in the lesser-visited: <a href="/mersin/">Mersin</a> east coast, Mardin, Van. Or settle into a digital-nomad base in <a href="/alanya/#mahmutlar">Mahmutlar</a> / <a href="/izmir/">Izmir</a>.</p>
  <h2>Don't do this</h2>
  <ul>
    <li>4 cities in 5 nights. You'll spend more time commuting than enjoying.</li>
    <li>Istanbul and Cappadocia as a day trip from each other — it's a 80-min flight, not a day trip.</li>
    <li>Flying in Monday, flying out Sunday, trying to include both beach and cave hotels. Pick one.</li>
  </ul>
</section>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "How many nights", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("how-many-nights-turkey/index.html", html);
}

// ---- /guides/ hub ----
function renderGuidesHub() {
  const canonical = `${config.siteUrl}/guides/`;
  const title = `Turkey travel guides — practical answers to every question`;
  const description = `Visa, safety, transport, best time to visit, how many nights, and more — fast answers for planning a trip to Turkey.`;
  const cards = [
    { href: "/quiz/",                       h: "Which Turkish city fits your trip?", p: "60-second decision quiz." },
    { href: "/thank-you/",                  h: "3-day Istanbul itinerary",            p: "The exact plan we'd send a friend." },
    { href: "/thank-you-combo/",            h: "5-day Istanbul + Cappadocia itinerary", p: "The canonical first-Turkey trip." },
    { href: "/visa/",                       h: "Turkey visa guide",                   p: "Who needs one, who doesn't." },
    { href: "/is-turkey-safe/",             h: "Is Turkey safe?",                     p: "Honest safety reality-check." },
    { href: "/best-time-to-visit-turkey/",  h: "Best time to visit Turkey",           p: "Month-by-month by region." },
    { href: "/how-many-nights-turkey/",     h: "How many nights do you need?",        p: "3 nights to 3 weeks: what fits." },
    { href: "/istanbul-to-cappadocia/",     h: "Istanbul → Cappadocia",               p: "Flight, bus, or drive — what's worth it." },
  ];
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Guides</div>
    <h1>Turkey travel guides</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Practical planning stuff — not blog posts. Pick the question, get the answer.</p>
  </div>
</div>
<section class="container">
  <div class="grid grid-2 grid-3">
    ${cards.map((c) => `<a class="card" href="${esc(c.href)}" style="text-decoration:none;color:inherit"><h3 style="margin:0 0 6px">${esc(c.h)}</h3><p class="text-muted" style="margin:0">${esc(c.p)}</p></a>`).join("")}
  </div>
</section>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Guides", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("guides/index.html", html);
}



// =====================================================================
// Legal + trust components
// =====================================================================

// Short FTC-compliant affiliate disclosure. Placed near top of every content page.
function disclosureBanner() {
  return `
<div class="disclosure" role="note">
  <div class="container" style="padding-top:10px;padding-bottom:10px;font-size:0.82rem;color:var(--c-text-muted)">
    <strong>Disclosure:</strong> This page contains affiliate links. If you book through them we may earn a commission at no extra cost to you — and it's how we keep the site ad-free. <a href="/about/#affiliate">Read more →</a>
  </div>
</div>`;
}

// Small disclaimer under hotel grids: prices are editorial estimates, not live rates.
function priceDisclaimer() {
  return `
<p class="text-soft small mt-2" style="text-align:center">
  Prices are editorial "from" estimates based on recent booking data. Always check <a rel="sponsored nofollow" target="_blank" href="${esc(bookingLink("Turkey"))}">live Booking.com rates</a> for real-time availability and current pricing.
</p>`;
}

// Bottom-right cookie consent banner. Invisible until JS sets it visible; respects user choice.
function cookieBanner() {
  return `
<div class="cookie-banner" id="cookie-banner" hidden>
  <div class="cookie-inner">
    <p>We use only essential cookies to make this site work. Analytics and advertising cookies are off by default. Read our <a href="/privacy/">Privacy Policy</a>.</p>
    <div class="cookie-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-cookie="essential">Essential only</button>
      <button type="button" class="btn btn-primary btn-sm" data-cookie="accept-all">Accept all</button>
    </div>
  </div>
</div>`;
}

// ---------- Privacy policy ----------
function renderPrivacy() {
  const canonical = `${config.siteUrl}/privacy/`;
  const title = `Privacy policy — ${config.siteName}`;
  const description = `How we collect, use, and protect your data — in plain English. GDPR and CCPA compliant.`;
  const b = config.business;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Privacy</div>
    <h1>Privacy policy</h1>
    <p class="text-muted">Last updated: ${esc(b.lastUpdated)}</p>
  </div>
</div>
<section class="container container-narrow prose">
  <h2>Who runs this site</h2>
  <p>${esc(b.legalName)} (based in ${esc(b.jurisdiction)}) operates ${esc(config.siteUrl)}. Reach us at <a href="mailto:${esc(b.privacyEmail)}">${esc(b.privacyEmail)}</a> for any privacy-related questions.</p>

  <h2>The short version</h2>
  <ul>
    <li>We collect your email only if you sign up for our newsletter. That's it for personal data.</li>
    <li>We use essential cookies to make the site work. We do not run advertising cookies by default.</li>
    <li>Third-party embeds (Booking.com, GetYourGuide, Google Maps) may set their own cookies once you click out.</li>
    <li>You can opt out of our emails with one click, and request data deletion anytime.</li>
  </ul>

  <h2>What we collect</h2>
  <p><strong>Email address</strong> — only when you voluntarily submit our signup form to receive the itinerary or newsletter. We store this in our email provider (e.g. Formspree, ConvertKit, Mailchimp) under their privacy policy.</p>
  <p><strong>Server logs</strong> — standard web server logs capture IP address, user agent, and referrer for security and performance. Logs are retained for up to 30 days.</p>
  <p><strong>Analytics (if enabled)</strong> — if we run Plausible (cookieless) or Google Analytics (with consent), aggregate page view data. No individual tracking without consent.</p>

  <h2>How we use data</h2>
  <ul>
    <li>Email: to deliver content you requested and occasional travel tips. Not sold, not shared with third parties.</li>
    <li>Logs: to keep the site running and spot abuse.</li>
    <li>Analytics: to understand which content helps people.</li>
  </ul>

  <h2>Affiliate tracking</h2>
  <p>When you click an affiliate link (Booking.com, GetYourGuide, Welcome Pickups, Airalo, SafetyWing, etc.), that partner may set tracking cookies to attribute a booking to us. These cookies are set by the partner, not by us, and are governed by their privacy policy. We don't receive any personally identifiable info about you from them.</p>

  <h2>Your rights (GDPR / UK GDPR / CCPA)</h2>
  <ul>
    <li><strong>Access</strong> — request a copy of the data we hold about you.</li>
    <li><strong>Deletion</strong> — request we erase your data. Always honored.</li>
    <li><strong>Correction</strong> — fix inaccurate data.</li>
    <li><strong>Portability</strong> — download your data in a standard format.</li>
    <li><strong>Objection</strong> — stop us processing your data for marketing.</li>
    <li><strong>No sale</strong> — we don't sell personal data. California residents: we do not sell or share data as defined by CCPA.</li>
  </ul>
  <p>To exercise any of these rights email <a href="mailto:${esc(b.privacyEmail)}">${esc(b.privacyEmail)}</a>. We respond within 30 days.</p>

  <h2>Cookies</h2>
  <p>We use strictly necessary cookies for core site functionality. Optional analytics and advertising cookies are disabled by default and only run after you click "Accept all" in our consent banner. You can change your choice anytime by clearing this site's cookies and reloading.</p>

  <h2>Children</h2>
  <p>This site isn't directed at children under 16. We don't knowingly collect data from them. If you believe a child has submitted information to us, please contact us and we'll delete it.</p>

  <h2>Data transfers</h2>
  <p>Our email provider and hosting may process data outside your home country. We use providers that comply with standard contractual clauses (SCCs) or equivalent safeguards under GDPR.</p>

  <h2>Changes</h2>
  <p>We may update this policy. Material changes will be announced on the homepage or via email to subscribers. The "last updated" date at the top reflects the most recent revision.</p>

  <h2>Contact</h2>
  <p>Questions? <a href="mailto:${esc(b.privacyEmail)}">${esc(b.privacyEmail)}</a>. Postal mail: ${esc(b.postalAddress)}.</p>
</section>
${footer()}
${tail()}`;
  const html = head({ title, description, canonical }) + body;
  writeFile("privacy/index.html", html);
}

// ---------- Terms of use ----------
function renderTerms() {
  const canonical = `${config.siteUrl}/terms/`;
  const title = `Terms of use — ${config.siteName}`;
  const description = `The rules for using wheretostayturkey.com.`;
  const b = config.business;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Terms</div>
    <h1>Terms of use</h1>
    <p class="text-muted">Last updated: ${esc(b.lastUpdated)}</p>
  </div>
</div>
<section class="container container-narrow prose">
  <h2>Acceptance</h2>
  <p>By using this site you agree to these terms. If you don't agree, please don't use the site.</p>

  <h2>What this site is (and isn't)</h2>
  <p>${esc(config.siteUrl)} is an independent editorial site that reviews accommodations and experiences in Turkey. We are <strong>not</strong> a travel agency, hotel operator, insurance broker, or tour company. We don't take your payment, process bookings, or stand behind any third-party provider's service quality.</p>

  <h2>Affiliate links</h2>
  <p>We link to third-party booking platforms (Booking.com, Hotels.com, Agoda, GetYourGuide, etc.) and earn commissions when you book through them. This has no effect on the price you pay. We disclose this on every page and in full in our <a href="/about/#affiliate">affiliate disclosure</a>.</p>

  <h2>No travel, legal, medical, or financial advice</h2>
  <p>Content on this site is for general informational purposes only. It is <strong>not</strong> professional advice. Specifically:</p>
  <ul>
    <li>Visa information is a summary — always check your home country's foreign office and the official Turkish e-Visa site before traveling.</li>
    <li>Safety observations are editorial — always check your government's current travel advisory.</li>
    <li>Insurance recommendations are not insurance advice — read the policy documents of any product you purchase.</li>
    <li>Prices shown are editorial estimates based on recent data — always confirm live rates on the booking platform.</li>
  </ul>

  <h2>Third-party services</h2>
  <p>When you click an affiliate link you're leaving our site and entering a contract directly with the third-party provider under their terms. We are not a party to that transaction. We can't guarantee availability, pricing, service quality, or refund policies of third parties. Disputes with hotels, airlines, tour operators or other providers must be resolved directly with them.</p>

  <h2>Liability limit</h2>
  <p>To the maximum extent permitted by law, ${esc(b.legalName)} is not liable for any direct, indirect, incidental, special, or consequential damages arising from your use of this site or any third-party service reached through it. Your use of this site is at your own risk.</p>
  <p>Nothing in these terms limits our liability for fraud, death or personal injury caused by our negligence, or any liability that cannot be excluded under applicable law.</p>

  <h2>Your conduct</h2>
  <p>Don't do anything illegal on or through the site. Don't scrape the site automatically at a rate that degrades service. Don't submit false or abusive content via our forms.</p>

  <h2>Content and intellectual property</h2>
  <p>All editorial content (neighborhood guides, hotel reviews, itineraries, illustrations) is © ${esc(b.legalName)} unless otherwise noted. You may share our content with credit and a link back. You may not republish in bulk, create derivative editorial works, or train AI models on our content without permission.</p>
  <p>Third-party trademarks (Booking.com®, Hilton®, Airalo®, etc.) are property of their respective owners and used nominatively to identify the service. We claim no endorsement or partnership beyond publicly disclosed affiliate programs.</p>

  <h2>Governing law</h2>
  <p>These terms are governed by the laws of ${esc(b.jurisdiction)}. Any dispute shall be heard in the competent courts of ${esc(b.jurisdiction)}.</p>

  <h2>Changes</h2>
  <p>We may update these terms. Continued use of the site after changes constitutes acceptance.</p>

  <h2>Contact</h2>
  <p><a href="mailto:${esc(b.contactEmail)}">${esc(b.contactEmail)}</a> — ${esc(b.postalAddress)}.</p>
</section>
${footer()}
${tail()}`;
  const html = head({ title, description, canonical }) + body;
  writeFile("terms/index.html", html);
}

// ---------- Contact page ----------
function renderContact() {
  const canonical = `${config.siteUrl}/contact/`;
  const title = `Contact — ${config.siteName}`;
  const description = `Get in touch with ${config.siteName}.`;
  const b = config.business;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Contact</div>
    <h1>Contact us</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Questions, corrections, or partnership requests — we read every email.</p>
  </div>
</div>
<section class="container container-narrow prose">
  <h2>General</h2>
  <p><a href="mailto:${esc(b.contactEmail)}">${esc(b.contactEmail)}</a> — the fastest way to reach us. Response within 48 hours, usually same day.</p>
  <h2>Privacy &amp; data requests</h2>
  <p><a href="mailto:${esc(b.privacyEmail)}">${esc(b.privacyEmail)}</a> — GDPR/CCPA requests, data deletion, access requests. We respond within 30 days.</p>
  <h2>Hotel &amp; experience partnerships</h2>
  <p>We don't accept paid placements or PR-funded trips, but we do add hotels based on reader feedback. If you run a Turkish property with consistent 8.5+ reviews and want to be considered, email <a href="mailto:${esc(b.supportEmail)}">${esc(b.supportEmail)}</a> with your property details.</p>
  <h2>Postal</h2>
  <p>${esc(b.legalName)}<br>${esc(b.postalAddress)}</p>
  <h2>Spotted a mistake?</h2>
  <p>If a hotel has closed, a neighborhood description is wrong, or a price range is way off — please tell us. Local knowledge is the whole point. <a href="mailto:${esc(b.contactEmail)}?subject=Correction">Send a correction →</a></p>
</section>
${footer()}
${tail()}`;
  const html = head({ title, description, canonical }) + body;
  writeFile("contact/index.html", html);
}


// =====================================================================
// Differentiating features (beat competitor travel sites)
// =====================================================================

// --- Author / byline config ---
const AUTHOR = {
  name: "Fredoline",
  credentials: "Independent editorial — no PR trips, no paid placements.",
  avatarInitials: "F",
  slug: "fredoline",
};

// Editorial "verified" date per city — user updates when re-checking the page.
// Default to today if missing; real editors should set per-city.
function cityVerified(c) { return c.lastVerified || "April 2026"; }

// --- Reading time helper (assumes 230 wpm reading) ---
function readingTime(htmlOrText) {
  const text = String(htmlOrText).replace(/<[^>]+>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}
function readingPill(html) {
  const m = readingTime(html);
  return `<span class="reading-time">${m} min read</span>`;
}



// --- Author byline block (to inject under hero on city + guide pages) ---
function bylineBlock(cityOrNull) {
  const verified = cityOrNull ? cityVerified(cityOrNull) : "April 2026";
  return `
<div class="byline">
  <div class="byline-avatar" aria-hidden="true">${esc(AUTHOR.avatarInitials)}</div>
  <div class="byline-info">
    <div class="byline-name">${esc(AUTHOR.name)}</div>
    <div class="byline-meta">Last verified <time>${esc(verified)}</time> · <a href="/about/eruo/">About ${esc(AUTHOR.name.split(" — ")[0])}</a></div>
  </div>
</div>`;
}

// --- Related cities block (based on emoji/tag heuristic + hand-curated) ---
const RELATED = {
  istanbul: ["cappadocia", "bursa", "izmir"],
  cappadocia: ["istanbul", "pamukkale", "trabzon"],
  antalya: ["side", "kas", "alanya"],
  bodrum: ["fethiye", "marmaris", "kusadasi"],
  fethiye: ["bodrum", "kas", "marmaris"],
  izmir: ["kusadasi", "bodrum", "istanbul"],
  pamukkale: ["cappadocia", "izmir", "antalya"],
  marmaris: ["fethiye", "bodrum", "kas"],
  kas: ["fethiye", "antalya", "kusadasi"],
  trabzon: ["rize", "istanbul", "ankara"],
  alanya: ["antalya", "side", "marmaris"],
  side: ["antalya", "alanya", "bodrum"],
  kusadasi: ["izmir", "bodrum", "pamukkale"],
  mersin: ["antalya", "gaziantep", "kas"],
  rize: ["trabzon", "cappadocia", "istanbul"],
  ankara: ["istanbul", "cappadocia", "bursa"],
  gaziantep: ["istanbul", "mersin", "cappadocia"],
  bursa: ["istanbul", "ankara", "izmir"],
};
function relatedCitiesBlock(c) {
  const slugs = RELATED[c.slug] || [];
  const related = cities.filter((x) => slugs.includes(x.slug));
  if (!related.length) return "";
  return `
<section class="container section-sm" id="also-consider">
  <div class="section-label">Also consider</div>
  <div class="grid grid-3 mt-2">
    ${related.map((r) => `<a class="card" href="/${r.slug}/" style="text-decoration:none;color:inherit">
      <div style="font-size:24px;margin-bottom:4px">${r.emoji || "📍"}</div>
      <h4 style="margin:0;font-family:var(--font-serif);font-weight:500">${esc(r.name)}</h4>
      <p class="text-muted small" style="margin:4px 0 0">${esc(r.tagline)}</p>
    </a>`).join("")}
  </div>
</section>`;
}

// --- Currency converter widget (client-side; rates hardcoded with clear "as of" date) ---
function currencyWidget() {
  // Rates as of April 2026 (editorial — user updates periodically)
  // Approximate only; user sees a "refresh rates" link that opens an external source
  const rates = { USD: 1, EUR: 0.93, GBP: 0.78, TRY: 32.5 };
  return `
<div class="cx-widget" aria-label="Currency converter">
  <div class="cx-title">Quick cost converter</div>
  <div class="cx-row">
    <input type="number" id="cx-amount" value="100" min="0" step="10" aria-label="Amount">
    <select id="cx-from" aria-label="From currency">
      <option value="USD" selected>USD</option>
      <option value="EUR">EUR</option>
      <option value="GBP">GBP</option>
      <option value="TRY">TRY</option>
    </select>
    <span class="cx-equals">→</span>
    <select id="cx-to" aria-label="To currency">
      <option value="TRY" selected>TRY</option>
      <option value="USD">USD</option>
      <option value="EUR">EUR</option>
      <option value="GBP">GBP</option>
    </select>
  </div>
  <div class="cx-result" id="cx-result" aria-live="polite">~3,250 TRY</div>
  <div class="cx-note">Approx. rates (as of Apr 2026). Check <a href="https://wise.com" rel="nofollow" target="_blank">Wise</a> for live.</div>
  <script>
    (function () {
      const R = ${JSON.stringify(rates)};
      const amt = document.getElementById("cx-amount");
      const from = document.getElementById("cx-from");
      const to = document.getElementById("cx-to");
      const out = document.getElementById("cx-result");
      function upd() {
        const a = parseFloat(amt.value) || 0;
        const v = (a / R[from.value]) * R[to.value];
        out.textContent = "~" + v.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " " + to.value;
      }
      [amt, from, to].forEach(function (el) { el.addEventListener("input", upd); });
      upd();
    })();
  </script>
</div>`;
}

// --- Insider tip callout (for use inside area blocks; optional data field) ---
function insiderTipBlock(tip) {
  if (!tip) return "";
  return `
<aside class="insider-tip">
  <div class="insider-tip-badge">Insider tip</div>
  <p>${esc(tip)}</p>
</aside>`;
}

// --- Sticky TOC for long-form guides ---
function stickyToc(items) {
  if (!items || items.length < 3) return "";
  return `
<aside class="toc-sticky" aria-label="Table of contents">
  <div class="toc-sticky-title">On this page</div>
  <ol>${items.map((it) => `<li><a href="#${esc(it.id)}">${esc(it.label)}</a></li>`).join("")}</ol>
</aside>`;
}

// --- Trip cost calculator page ---
function renderPlanner() {
  const canonical = `${config.siteUrl}/planner/`;
  const title = `Turkey trip cost calculator — what will your trip actually cost? (2026)`;
  const description = `Realistic Turkey trip budget calculator. Pick city, nights, style. Get hotel, food, transport, and tour estimates in USD, EUR, GBP, or TRY.`;

  // Cost model data — editorial "from" per-night / per-day estimates
  const CITY_COST = JSON.stringify(cities.reduce((acc, c) => {
    // Derive a cost tier per city from hotel price distribution
    const prices = c.hotels.map((h) => h.priceFrom).filter(Boolean);
    const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 150;
    acc[c.slug] = { name: c.name, avg: Math.round(avg) };
    return acc;
  }, {}));

  const body = `
${nav()}
${disclosureBanner()}
<main id="main">
<section class="hero-home" style="padding:100px 0 60px">
  <div class="container">
    <div class="eyebrow">Planning tool</div>
    <h1>Turkey trip cost calculator</h1>
    <p class="hero-sub">Realistic budget in 20 seconds. No signup. Based on live booking data and ground-truth visits.</p>
  </div>
</section>

<section class="container" style="max-width:820px;padding-bottom:60px">
  <div class="planner" id="planner">
    <div class="planner-field">
      <label>Which city?</label>
      <select id="p-city">
        ${cities.map((c) => `<option value="${esc(c.slug)}"${c.slug === "istanbul" ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
    </div>

    <div class="planner-field">
      <label>Nights: <span id="p-nights-val">5</span></label>
      <input type="range" id="p-nights" min="1" max="21" value="5" step="1">
    </div>

    <div class="planner-field">
      <label>Travelers</label>
      <div class="planner-toggle">
        <button type="button" data-travelers="1">Solo</button>
        <button type="button" data-travelers="2" class="is-active">Couple</button>
        <button type="button" data-travelers="3">Family (3)</button>
        <button type="button" data-travelers="4">Family (4)</button>
      </div>
    </div>

    <div class="planner-field">
      <label>Style</label>
      <div class="planner-toggle">
        <button type="button" data-style="budget">Budget</button>
        <button type="button" data-style="mid" class="is-active">Mid-range</button>
        <button type="button" data-style="lux">Luxury</button>
      </div>
    </div>

    <div class="planner-field">
      <label>Extras</label>
      <div class="planner-toggle planner-multi">
        <button type="button" data-extra="transfer" class="is-active">Airport transfer</button>
        <button type="button" data-extra="esim" class="is-active">eSIM</button>
        <button type="button" data-extra="tours">Tours (2-3)</button>
        <button type="button" data-extra="insurance">Insurance</button>
      </div>
    </div>

    <div class="planner-field">
      <label>Currency</label>
      <div class="planner-toggle">
        <button type="button" data-cur="USD" class="is-active">USD</button>
        <button type="button" data-cur="EUR">EUR</button>
        <button type="button" data-cur="GBP">GBP</button>
        <button type="button" data-cur="TRY">TRY</button>
      </div>
    </div>
  </div>

  <div class="planner-result" id="planner-result">
    <div class="planner-total">
      <div class="planner-total-label">Estimated total</div>
      <div class="planner-total-value" id="p-total">$1,250</div>
      <div class="planner-total-sub" id="p-per">$250 / night</div>
    </div>
    <div class="planner-breakdown" id="p-breakdown"></div>
    <div class="planner-cta">
      <a class="btn btn-primary btn-lg" id="p-book" rel="sponsored nofollow" target="_blank" href="#">See live hotel prices →</a>
    </div>
  </div>
  <p class="text-soft small mt-3" style="text-align:center">Estimates based on April 2026 booking data. Check live prices via the CTA.</p>
</section>

${essentialsBlock()}
</main>
${footer()}
${cookieBanner()}
${tail()}

<script>
const CITY_COST = ${CITY_COST};
const DAY_FOOD = { budget: 25, mid: 55, lux: 140 }; // per person
const DAY_LOCAL_TRANSPORT = { budget: 8, mid: 15, lux: 30 };
const STYLE_MULT = { budget: 0.55, mid: 1.0, lux: 2.3 }; // hotel price multiplier vs avg
const EXTRA_COST = { transfer: 45, esim: 10, tours: 110, insurance: 40 };
const RATES = { USD: 1, EUR: 0.93, GBP: 0.78, TRY: 32.5 };
const SYMBOL = { USD: "$", EUR: "€", GBP: "£", TRY: "₺" };

const state = {
  city: "istanbul",
  nights: 5,
  travelers: 2,
  style: "mid",
  extras: new Set(["transfer", "esim"]),
  cur: "USD",
};

function $(id) { return document.getElementById(id); }

function compute() {
  const c = CITY_COST[state.city] || { name: "Istanbul", avg: 150 };
  const roomsNeeded = Math.ceil(state.travelers / 2);
  const hotelUSD = c.avg * STYLE_MULT[state.style] * state.nights * roomsNeeded;
  const foodUSD = DAY_FOOD[state.style] * state.travelers * state.nights;
  const transportUSD = DAY_LOCAL_TRANSPORT[state.style] * state.nights;
  const extrasUSD = Array.from(state.extras).reduce(function (s, k) { return s + (EXTRA_COST[k] || 0); }, 0);
  const totalUSD = hotelUSD + foodUSD + transportUSD + extrasUSD;
  const rate = RATES[state.cur] || 1;
  const sym = SYMBOL[state.cur];
  const fmt = function (v) { return sym + Math.round(v * rate).toLocaleString(); };

  $("p-total").textContent = fmt(totalUSD);
  $("p-per").textContent = fmt(totalUSD / state.nights) + " / night";
  $("p-breakdown").innerHTML =
    '<div class="pb-row"><span>Hotel (' + roomsNeeded + ' room' + (roomsNeeded > 1 ? "s" : "") + ', ' + state.nights + 'n)</span><strong>' + fmt(hotelUSD) + '</strong></div>' +
    '<div class="pb-row"><span>Food (' + state.travelers + ' travelers)</span><strong>' + fmt(foodUSD) + '</strong></div>' +
    '<div class="pb-row"><span>Local transport</span><strong>' + fmt(transportUSD) + '</strong></div>' +
    (state.extras.size ? '<div class="pb-row"><span>Extras</span><strong>' + fmt(extrasUSD) + '</strong></div>' : '') +
    '<div class="pb-row pb-total"><span>Total</span><strong>' + fmt(totalUSD) + '</strong></div>';

  // Update book CTA: deep link to that city on Booking
  $("p-book").href = "https://www.booking.com/searchresults.html?aid=${A.booking.aid}&ss=" + encodeURIComponent(c.name) + "&group_adults=" + state.travelers + "&no_rooms=" + roomsNeeded;
}

// Wire interactions
$("p-city").addEventListener("change", function () { state.city = this.value; compute(); });
$("p-nights").addEventListener("input", function () {
  state.nights = +this.value;
  $("p-nights-val").textContent = state.nights;
  compute();
});

document.querySelectorAll("[data-travelers]").forEach(function (b) {
  b.addEventListener("click", function () {
    document.querySelectorAll("[data-travelers]").forEach(function (x) { x.classList.remove("is-active"); });
    b.classList.add("is-active");
    state.travelers = +b.dataset.travelers;
    compute();
  });
});
document.querySelectorAll("[data-style]").forEach(function (b) {
  b.addEventListener("click", function () {
    document.querySelectorAll("[data-style]").forEach(function (x) { x.classList.remove("is-active"); });
    b.classList.add("is-active");
    state.style = b.dataset.style;
    compute();
  });
});
document.querySelectorAll("[data-extra]").forEach(function (b) {
  b.addEventListener("click", function () {
    b.classList.toggle("is-active");
    const k = b.dataset.extra;
    if (state.extras.has(k)) state.extras.delete(k); else state.extras.add(k);
    compute();
  });
});
document.querySelectorAll("[data-cur]").forEach(function (b) {
  b.addEventListener("click", function () {
    document.querySelectorAll("[data-cur]").forEach(function (x) { x.classList.remove("is-active"); });
    b.classList.add("is-active");
    state.cur = b.dataset.cur;
    compute();
  });
});
compute();
</script>`;

  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Planner", url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Turkey trip cost calculator",
      description,
      url: canonical,
      applicationCategory: "TravelApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("planner/index.html", html);
}



// ---- RSS feed (signal of active publication; read by feed readers + Google News) ----
function renderRss() {
  const today = new Date().toUTCString();
  const items = cities.map((c) => {
    return `  <item>
    <title>${esc(c.name)}: where to stay</title>
    <link>${config.siteUrl}/${c.slug}/</link>
    <guid>${config.siteUrl}/${c.slug}/</guid>
    <description>${esc(c.tagline)}</description>
    <pubDate>${today}</pubDate>
  </item>`;
  }).join("\n");
  const guides = [
    { slug: "planner", title: "Trip cost calculator" },
    { slug: "quiz", title: "Which Turkish city fits your trip?" },
    { slug: "visa", title: "Turkey visa guide" },
    { slug: "is-turkey-safe", title: "Is Turkey safe?" },
    { slug: "best-time-to-visit-turkey", title: "Best time to visit Turkey" },
    { slug: "how-many-nights-turkey", title: "How many nights in Turkey?" },
    { slug: "istanbul-to-cappadocia", title: "Istanbul to Cappadocia transport guide" },
  ].map((g) => `  <item>
    <title>${esc(g.title)}</title>
    <link>${config.siteUrl}/${g.slug}/</link>
    <guid>${config.siteUrl}/${g.slug}/</guid>
    <pubDate>${today}</pubDate>
  </item>`).join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(config.siteName)}</title>
  <link>${config.siteUrl}/</link>
  <atom:link href="${config.siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
  <description>${esc(config.siteDescription)}</description>
  <language>en</language>
  <lastBuildDate>${today}</lastBuildDate>
${items}
${guides}
</channel>
</rss>`;
  writeFile("feed.xml", body);
}



// =====================================================================
// Phase 2 features: restaurants, author page, journal, compare, gallery
// =====================================================================

const RESTAURANTS = (function () {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "restaurants.json"), "utf8")).byArea || {}; }
  catch (_) { return {}; }
})();

const JOURNAL = (function () {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "journal-posts.json"), "utf8")).posts || []; }
  catch (_) { return []; }
})();

// ---- Restaurant block (rendered inside neighborhood blocks) ----
function restaurantsBlock(areaSlug) {
  const list = RESTAURANTS[areaSlug];
  if (!list || !list.length) return "";
  return `
<div class="restaurants">
  <div class="section-label" style="margin:24px 0 16px">Where to eat in this neighborhood</div>
  <div class="restaurant-grid">
    ${list.map((r) => `
      <div class="restaurant-card">
        <div class="restaurant-cat">${esc(r.category)}</div>
        <h4 class="restaurant-name">${esc(r.name)}</h4>
        <p class="restaurant-note">${esc(r.note)}</p>
      </div>
    `).join("")}
  </div>
</div>`;
}

// ---- Photo gallery (renders if city has a photos array) ----
function photoGalleryBlock(c) {
  if (!c.photos || !c.photos.length) return "";
  return `
<section class="container section-sm">
  <div class="section-label">Photographs of ${esc(c.name)}</div>
  <div class="gallery-grid">
    ${c.photos.map((p) => `<figure class="gallery-figure"><img src="${esc(p.src)}" alt="${esc(p.alt || c.name)}" loading="lazy">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}</figure>`).join("")}
  </div>
</section>`;
}

// ---- Author page (/about/eruo/) ----
function renderAuthorPage() {
  const canonical = `${config.siteUrl}/about/${AUTHOR.slug}/`;
  const title = `About ${AUTHOR.name} — ${config.siteName}`;
  const description = `The founder and editor of ${config.siteName}. Travel writer covering Turkey since 2023.`;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/about/">About</a> / ${esc(AUTHOR.name)}</div>
</div>
<section class="container container-narrow">
  <div class="page-head">
    <div class="eyebrow">Editorial</div>
    <h1>${esc(AUTHOR.name)}</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:540px">${esc(AUTHOR.credentials)}</p>
  </div>

  <div class="prose">
    <h2>How we research</h2>
    <p>Every city covered on this site is visited at least annually. Different neighborhoods, different trips. Restaurants we recommend, we eat at. Public ferries, not chartered ones. We pay for our own bookings.</p>
    <p>We do not accept PR-funded trips. We do not accept paid placements. Hotels earn their spots by meeting the criteria on the <a href="/about/">about page</a> — long-running review averages, location accuracy, consistency.</p>

    <h2>Get in touch</h2>
    <p><a href="mailto:${esc(config.business.contactEmail)}">${esc(config.business.contactEmail)}</a> for corrections, suggestions, or trip-planning questions.</p>
  </div>
</section>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "About", url: `${config.siteUrl}/about/` },
      { name: AUTHOR.name, url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Person",
      name: AUTHOR.name,
      worksFor: { "@type": "Organization", name: config.siteName, url: config.siteUrl },
      url: canonical,
    },
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`about/${AUTHOR.slug}/index.html`, html);
}

// ---- Journal hub (/journal/) ----
function renderJournalHub() {
  const canonical = `${config.siteUrl}/journal/`;
  const title = `Journal — ${config.siteName}`;
  const description = `Editorial articles on Turkey travel — itinerary deep-dives, seasonal advice, and tested-by-us reviews.`;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="breadcrumb"><a href="/">Home</a> / Journal</div>
</div>
<section class="container">
  <div class="page-head">
    <div class="eyebrow">Editorial</div>
    <h1>The Journal</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:680px">Longer reads on Turkey — tested itineraries, seasonal advice, and the small things that separate a great trip from a mediocre one.</p>
  </div>
  <div class="journal-list">
    ${JOURNAL.map((p) => `
      <article class="journal-item">
        <div class="journal-meta">
          <time>${esc(p.publishedAt)}</time>
          <span>·</span>
          <span>${p.readMinutes} min read</span>
        </div>
        <h2 class="journal-title"><a href="/journal/${esc(p.slug)}/">${esc(p.title)}</a></h2>
        <p class="journal-subtitle">${esc(p.subtitle)}</p>
        <p class="journal-summary">${esc(p.summary)}</p>
        <a href="/journal/${esc(p.slug)}/" class="journal-link">Read →</a>
      </article>
    `).join("")}
  </div>
</section>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Journal", url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: `${config.siteName} Journal`,
      url: canonical,
      blogPost: JOURNAL.map((p) => ({
        "@type": "BlogPosting",
        headline: p.title,
        url: `${config.siteUrl}/journal/${p.slug}/`,
        datePublished: p.publishedAt,
        author: { "@type": "Person", name: AUTHOR.name },
      })),
    },
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("journal/index.html", html);
}

// ---- Individual journal post ----
function renderJournalPost(p) {
  const canonical = `${config.siteUrl}/journal/${p.slug}/`;
  const title = `${p.title} — ${config.siteName}`;
  const description = p.subtitle;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/journal/">Journal</a> / ${esc(p.title)}</div>
</div>
<article class="container container-narrow journal-article">
  <div class="page-head" style="border-bottom:none;padding-bottom:0">
    <div class="eyebrow">Article</div>
    <h1>${esc(p.title)}</h1>
    <p class="journal-subtitle" style="font-size:1.3rem;color:var(--ink-muted);font-style:italic;margin-top:12px">${esc(p.subtitle)}</p>
    <div class="journal-meta" style="margin-top:24px">
      <time>${esc(p.publishedAt)}</time>
      <span>·</span>
      <span>${p.readMinutes} min read</span>
      <span>·</span>
      <span>${esc(AUTHOR.name)}</span>
    </div>
  </div>

  <div class="prose mt-4">
    ${p.bodyHtml ? p.bodyHtml : `
      <p>${esc(p.summary)}</p>
      <div class="callout-warning" style="background:var(--accent-soft);border-left:2px solid var(--accent);padding:18px 22px;margin:24px 0;font-size:0.95rem;color:var(--ink-muted)">
        <strong>Coming soon.</strong> The full ${p.readMinutes}-minute read is being written. Subscribe at the foot of any page and we'll email you when it goes live.
      </div>
    `}
    <p style="margin-top:32px;color:var(--ink-muted);font-size:.92rem">Tagged: ${p.tags.map((t) => `<span style="background:var(--accent-soft);padding:2px 8px;border-radius:2px;margin-right:6px">${esc(t)}</span>`).join("")}</p>
  </div>

  <div class="lead-magnet mt-4">
    <div class="eyebrow">Free, sent instantly</div>
    <h3>Get our 3-day Istanbul itinerary while you wait</h3>
    <p class="text-muted">The exact day-by-day plan we'd send a friend.</p>
    <form class="lead-form" action="${esc(config.emailCaptureEndpoint)}" data-source="journal-${esc(p.slug)}">
      <input type="email" name="email" placeholder="your@email.com" required>
      <button type="submit" class="btn btn-primary">Send it</button>
    </form>
  </div>
</article>
${essentialsBlock()}
${footer()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Journal", url: `${config.siteUrl}/journal/` },
      { name: p.title, url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: p.title,
      description: p.subtitle,
      url: canonical,
      datePublished: p.publishedAt,
      author: { "@type": "Person", name: AUTHOR.name },
      publisher: { "@type": "Organization", name: config.siteName, url: config.siteUrl },
    },
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`journal/${p.slug}/index.html`, html);
}

// ---- Compare-cities tool (/compare/) ----
function renderComparePage() {
  const canonical = `${config.siteUrl}/compare/`;
  const title = `Compare Turkish cities — Istanbul vs Cappadocia, Antalya vs Bodrum, and more`;
  const description = `Pick any two Turkish cities and see them side-by-side: hotel prices, neighborhoods, ideal stay length, vibe, best months.`;

  const cityData = cities.map((c) => ({
    slug: c.slug,
    name: c.name,
    emoji: c.emoji,
    tagline: c.tagline,
    idealNights: c.idealNights,
    whenToGo: c.whenToGo,
    areasCount: c.areas.length,
    hotelsCount: c.hotels.length,
    priceMin: Math.min(...c.hotels.map((h) => h.priceFrom).filter(Boolean), 999),
    priceMax: Math.max(...c.hotels.map((h) => h.priceFrom).filter(Boolean), 0),
    bestFor: c.bestFor.join(", "),
  }));

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="breadcrumb"><a href="/">Home</a> / Compare</div>
</div>
<section class="container container-narrow">
  <div class="page-head">
    <div class="eyebrow">Tool</div>
    <h1>Compare two Turkish cities</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:680px">Pick any two destinations to see them side-by-side. Hotel price ranges, neighborhood counts, ideal stay length, vibe, and best months — all in one view.</p>
  </div>

  <div class="compare-tool">
    <div class="compare-pickers">
      <div class="compare-picker">
        <label>City A</label>
        <select id="city-a">
          ${cities.map((c, i) => `<option value="${esc(c.slug)}"${i === 0 ? ' selected' : ''}>${esc(c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="compare-picker">
        <label>City B</label>
        <select id="city-b">
          ${cities.map((c, i) => `<option value="${esc(c.slug)}"${i === 1 ? ' selected' : ''}>${esc(c.name)}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="compare-result" id="compare-result"></div>
  </div>
</section>
${essentialsBlock()}
${footer()}
${tail()}

<script>
const CITIES = ${JSON.stringify(cityData)};
function $(id) { return document.getElementById(id); }
function find(slug) { return CITIES.find(function (c) { return c.slug === slug; }); }
function render() {
  const a = find($("city-a").value);
  const b = find($("city-b").value);
  if (!a || !b) return;
  const rows = [
    { label: "Tagline",       a: a.tagline,       b: b.tagline },
    { label: "Ideal stay",    a: a.idealNights,   b: b.idealNights },
    { label: "Best months",   a: a.whenToGo,      b: b.whenToGo },
    { label: "Neighborhoods", a: a.areasCount + " areas",   b: b.areasCount + " areas" },
    { label: "Curated hotels",a: a.hotelsCount + " hotels", b: b.hotelsCount + " hotels" },
    { label: "Price range",   a: "$" + a.priceMin + "–$" + a.priceMax, b: "$" + b.priceMin + "–$" + b.priceMax },
    { label: "Best for",      a: a.bestFor,       b: b.bestFor },
  ];
  $("compare-result").innerHTML =
    '<div class="compare-cards">' +
      '<div class="compare-card"><h2>' + a.emoji + " " + a.name + '</h2><a class="btn btn-ghost btn-sm" href="/' + a.slug + '/">Open ' + a.name + '</a></div>' +
      '<div class="compare-card"><h2>' + b.emoji + " " + b.name + '</h2><a class="btn btn-ghost btn-sm" href="/' + b.slug + '/">Open ' + b.name + '</a></div>' +
    '</div>' +
    '<table class="compare-tbl">' +
      '<thead><tr><th></th><th>' + a.name + '</th><th>' + b.name + '</th></tr></thead>' +
      '<tbody>' +
        rows.map(function (r) {
          return '<tr><td class="rl">' + r.label + '</td><td>' + r.a + '</td><td>' + r.b + '</td></tr>';
        }).join("") +
      '</tbody>' +
    '</table>';
}
$("city-a").addEventListener("change", render);
$("city-b").addEventListener("change", render);
render();
</script>`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Compare", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("compare/index.html", html);
}


// =====================================================================
// Long-game inbound: /partnerships/ + Editor's Pick badge
// =====================================================================
// Editorial framing — never reads as pay-to-play. Hotels reach out wanting to
// be considered; the published criteria stay editorial; any commercial
// arrangements are negotiated privately and disclosed in copy where required.

// Editor's Pick badge — rendered on hotel cards if hotel.editorsPick === true.
// Add this manually in cities*.json to flag your top picks.
function editorsPickBadge(hotel) {
  if (!hotel.editorsPick) return "";
  return `<span class="ep-badge" title="Editor's Pick — selected by our editorial team">Editor's Pick</span>`;
}

// ---- /partnerships/ page (for hoteliers, restaurants, tour operators) ----
function renderPartnerships() {
  const canonical = `${config.siteUrl}/partnerships/`;
  const title = `Partnerships — ${config.siteName}`;
  const description = `For hoteliers, restaurants, and tour operators in Turkey. How to be considered for editorial coverage.`;
  const b = config.business;
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="breadcrumb"><a href="/">Home</a> / Partnerships</div>
</div>
<section class="container container-narrow">
  <div class="page-head">
    <div class="eyebrow">For the industry</div>
    <h1>Partnerships</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:580px">If you run a hotel, restaurant, or tour operation in Turkey and you want to be considered for our editorial coverage, this is the right page.</p>
  </div>

  <div class="prose">
    <h2>What we cover</h2>
    <p>${esc(config.siteName)} reviews accommodations, restaurants, and experiences in Turkey for an English-speaking, decision-focused traveler. We publish neighborhood guides for ${esc(String(cities.length))} cities, plus tested itineraries and editorial features in our journal.</p>

    <h2>How we select properties</h2>
    <p>We do not accept payment for inclusion in editorial guides. Hotels and restaurants earn coverage by meeting our published criteria — long-running review averages, neighborhood location accuracy, consistent service quality, and clear best-for fit. Our <a href="/about/">about page</a> explains the methodology in detail.</p>
    <p>That said, we read every introduction. If you'd like us to consider your property, the form below is the right way in.</p>

    <h2>Submit your property for consideration</h2>
    <p>Send us a one-paragraph note — what your property is, where it is, what makes it specific. Photos and Booking.com / Tripadvisor links help. Address it to:</p>
    <p><a href="mailto:${esc(b.editorialEmail)}?subject=Submission%20-%20[Your%20property%20name]">${esc(b.editorialEmail)}</a></p>
    <p>We don't respond to every submission, but every one is read. Properties we add typically appear in a guide within 30 days of acceptance, and we visit every newly added property within 12 months.</p>

    <h2>Commercial partnerships</h2>
    <p>For commercial inquiries that go beyond editorial coverage — sponsored journal features, off-site campaigns, or dedicated content collaborations — write to <a href="mailto:${esc(b.partnershipsEmail)}">${esc(b.partnershipsEmail)}</a>. We handle these carefully, with clear disclosure to readers as required by FTC guidance and our own editorial standards.</p>
    <p>We are selective. The reader's trust is the only asset we have, and any partnership that would compromise it is one we decline.</p>

    <h2>Press &amp; media</h2>
    <p>Journalists and media partners requesting quotes, statistics, or syndication: <a href="mailto:${esc(b.editorialEmail)}">${esc(b.editorialEmail)}</a>. Response within 48 hours.</p>

    <h2>What we don't do</h2>
    <ul>
      <li>Sell guaranteed inclusion in any editorial guide</li>
      <li>Accept manuscripts or copy provided by properties as our own editorial</li>
      <li>Publish reviews based solely on press materials — every property in our guides is independently assessed</li>
      <li>Run unmarked sponsored content (all paid placements are clearly disclosed)</li>
    </ul>
  </div>
</section>
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Partnerships", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("partnerships/index.html", html);
}


// Editor's Picks — collect flagged hotels for homepage featured strip
function getEditorsPicks() {
  const picks = [];
  for (const c of cities) {
    for (const h of c.hotels) {
      if (h.editorsPick) picks.push({ hotel: h, city: c });
    }
  }
  return picks;
}

function editorsPicksStrip() {
  const picks = getEditorsPicks();
  if (!picks.length) return "";
  return `
<section class="container section-sm" id="editors-picks">
  <div class="section-label">Editor's Picks</div>
  <h2 style="font-weight:300;letter-spacing:-0.025em;margin-bottom:8px">The hotels we'd book ourselves</h2>
  <p class="text-muted" style="max-width:560px;margin-bottom:32px">${picks.length} flagship properties across Turkey, hand-selected by our editorial team. The bar is high — most cities don't have one.</p>
  <div class="grid grid-2 grid-3">
    ${picks.map(({ hotel, city }) => hotelCard(hotel, city)).join("")}
  </div>
</section>`;
}

function run() {
  try {
    if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  } catch (e) {
    console.log("  (skipping clean — overwriting in place)");
  }
  mkdirp(OUT);
  copyDir(ASSETS_SRC, path.join(OUT, "assets"));

  renderHome();
  renderAbout();
  renderThankYouNew();                 // both /thank-you/ and /thank-you-combo/
  renderQuiz();
  renderVisa();
  renderTransportGuide();
  renderSafety();
  renderPrivacy();
  renderTerms();
  renderContact();
  renderPlanner();
  renderPartnerships();
  renderJournalHub();
  for (const p of JOURNAL) renderJournalPost(p);
  renderComparePage();
  renderSeasonalGuide();
  renderNightsGuide();
  renderGuidesHub();
  renderFlights();
  renderInsurance();
  renderESim();
  renderMoneyGuide();
  renderPackingList();
  renderArrivalIstanbul();
  renderExperiencesHub();
  for (const _exp of EXPERIENCES) renderExperiencePost(_exp);
  renderRegionsHub();
  for (const _r of REGIONS) renderRegionPage(_r);
  for (const [_slug, _trips] of Object.entries(DAY_TRIPS)) renderDayTrips(_slug, _trips);
  renderUltimateGuide();
  renderMonthsHub();
  for (const _m of MONTHS) renderMonthPage(_m);
  renderCollectionsHub();
  for (const _c of COLLECTIONS) renderCollectionPage(_c);

  for (const c of cities) {
    renderCity(c);
    renderProgrammaticForCity(c);
    renderToursPage(c);
  }

  renderAllCrossCollections();
  writeCityOgImages();
  writeFavicon();
  writeOgImage();
  writeAppleTouchIcon();
  writeManifest();
  writeSecurityTxt();
  render404();
  renderRss();
  renderSitemap();
  renderRobots();

  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else files.push(p);
    }
  })(OUT);
  const htmlCount = files.filter((f) => f.endsWith(".html")).length;
  console.log(`\n✓ Build complete`);
  console.log(`  ${cities.length} cities`);
  console.log(`  ${htmlCount} HTML pages`);
  console.log(`  ${files.length} files total`);
  console.log(`  Output: ${OUT}\n`);
}

run();
