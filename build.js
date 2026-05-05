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

// Per-city / per-cohort variant copy for programmatic /city/{variant}/
// pages. See data/variant-copy.json for the full set. Cohort lookup
// flattens the {cohort: [slugs]} map into {slug: cohort} for O(1) lookup.
const VARIANT_COPY = (() => {
  try { return require("./data/variant-copy.json"); }
  catch (_) { return { cohorts: {}, cohortBody: {}, cityOpeners: {} }; }
})();
const CITY_COHORT = (() => {
  const m = {};
  for (const [cohort, slugs] of Object.entries(VARIANT_COPY.cohorts || {})) {
    for (const s of slugs) m[s] = cohort;
  }
  return m;
})();
const TOUR_COPY = (() => {
  try { return require("./data/tour-copy.json"); }
  catch (_) { return { cohortBody: {}, cityOpeners: {} }; }
})();

// --------------------------- helpers ---------------------------

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Title formatter that respects Google's ~60-character SERP truncation.
// If the raw title is already long, return it unchanged (drop the brand
// suffix). Else append " — {brand}" if the combined length still fits in
// 60. Else append a shorter " | wheretostayturkey.com" variant. Else just
// return the raw title — never go over 60 just to add brand.
const SEO_TITLE_MAX = 60;
const SEO_BRAND_LONG = " — Where to Stay in Turkey";
const SEO_BRAND_SHORT = " · wheretostayturkey.com";
function seoTitle(raw) {
  const s = String(raw || "").trim();
  if (s.length >= SEO_TITLE_MAX) return s;
  if (s.length + SEO_BRAND_LONG.length <= SEO_TITLE_MAX) return s + SEO_BRAND_LONG;
  if (s.length + SEO_BRAND_SHORT.length <= SEO_TITLE_MAX) return s + SEO_BRAND_SHORT;
  return s;
}

// Description normaliser. Targets 130-160 chars (Google's snippet window).
// If too short, append the supplied filler (typically a tagline). If too
// long, trim cleanly at a word boundary near 158 chars and add an ellipsis.
function seoDescription(raw, filler) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  if (s.length > 165) {
    s = s.slice(0, 158);
    const lastSpace = s.lastIndexOf(" ");
    if (lastSpace > 120) s = s.slice(0, lastSpace);
    s = s.replace(/[,.;:!]+$/, "") + "…";
  }
  if (s.length < 100 && filler) {
    const sep = /[.!?…]$/.test(s) ? " " : ". ";
    const want = String(filler).replace(/\s+/g, " ").trim();
    const candidate = (s + sep + want).slice(0, 160);
    if (candidate.length > s.length) s = candidate.replace(/\s+\S*$/, "").replace(/[,.;:!]+$/, "") + ".";
  }
  return s;
}

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

// Safe HTML minifier. Stashes contents of <pre>, <textarea>, <script>, and
// <style> tags verbatim so embedded JS / CSS / pre-formatted text are
// preserved, then collapses whitespace between and inside tags. Drops
// HTML comments (except IE conditional <!--[if ...]-->). ~15-25% reduction
// on this site. Idempotent.
function minifyHtml(html) {
  if (!html || html.length < 200) return html;
  const placeholders = [];
  const stash = (re) => {
    html = html.replace(re, (m) => {
      const i = placeholders.push(m) - 1;
      // Surround with a marker that survives whitespace collapse.
      return `\u0001${i}\u0001`;
    });
  };
  stash(/<pre[\s\S]*?<\/pre>/gi);
  stash(/<textarea[\s\S]*?<\/textarea>/gi);
  stash(/<script[\s\S]*?<\/script>/gi);
  stash(/<style[\s\S]*?<\/style>/gi);

  html = html
    .replace(/\r\n?/g, "\n")
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")  // strip non-conditional comments
    .replace(/[ \t]+/g, " ")                    // collapse runs of horizontal ws
    .replace(/ ?\n ?/g, "\n")                  // trim spaces around newlines
    .replace(/\n+/g, "\n")                     // collapse blank lines
    .replace(/>\s+</g, "><")                    // drop whitespace between tags
    .replace(/\s+(?=<\/(?:html|head|body|main|article|section|header|footer|nav|aside|div|ul|ol|li|h[1-6]|p|table|tr|td|th|thead|tbody|figure|figcaption|form|hr|br)\b)/gi, "")
    .replace(/(<(?:html|head|body|main|article|section|header|footer|nav|aside|div|ul|ol|li|h[1-6]|p|table|tr|td|th|thead|tbody|figure|figcaption|form|hr|br)\b[^>]*>)\s+/gi, "$1")
    .replace(/  +/g, " ")
    .trim();

  // Restore stashed blocks. Marker is \u0001N\u0001.
  html = html.replace(/\u0001(\d+)\u0001/g, (_, i) => placeholders[+i]);
  return html;
}

function writeFile(relPath, content) {
  const full = path.join(OUT, relPath);
  mkdirp(path.dirname(full));
  if (relPath.endsWith(".html")) content = minifyHtml(content);
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
// All hotel links route through Trip.com — the only TP-affiliated hotel
// program on this account. Booking.com / Hotels.com / Agoda are kept in
// the affiliate config for future direct partnerships but no link
// builders emit those URLs anymore (operator's call: TP-only).
function bookingLink(query) {
  // Kept under the historical name so call sites don't need to change.
  // Returns a Trip.com search URL with our Travelpayouts Allianceid/SID
  // attached. Falls back to a bare Trip.com search if config is empty.
  return tripcomLink(query) || `https://www.trip.com/hotels/list?city=${encodeURIComponent(query)}`;
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
  // GetYourGuide is NOT a Travelpayouts partner. Per operator policy
  // (TP-only attribution) we suppress the link entirely when partnerId
  // is empty. Callers must handle null. Klook (which IS in TP) is the
  // operational replacement — see klookLink for tour CTAs.
  if (!A.getYourGuide.partnerId) return null;
  const citySlug = Object.keys(GYG_CITIES).find((s) => query.toLowerCase().includes(s.replace(/-/g, " ")));
  const base = citySlug
    ? `https://www.getyourguide.com/${GYG_CITIES[citySlug]}/`
    : `https://www.getyourguide.com/s?q=${encodeURIComponent(query)}`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}partner_id=${A.getYourGuide.partnerId}`;
}
function viatorLink(query) {
  // Not on Travelpayouts. Return null when no pid — TP-only policy.
  if (!A.viator.pid) return null;
  return `https://www.viator.com/search/${encodeURIComponent(query)}?pid=${A.viator.pid}&mcid=42383`;
}
// Travelpayouts redirector. Marker = TP account, trs = site source, p =
// per-program partner id, campaign_id = program id. ALL four are required
// for tp.media to credit the click — when any are missing, callers should
// fall back to the partner's bare URL (or return null to hide the CTA).
function tpMediaLink({ campaignId, partnerId, destUrl, sub1 }) {
  const params = new URLSearchParams({
    campaign_id: campaignId,
    marker: config.tp.marker,
    p: partnerId,
    trs: config.tp.trs,
  });
  if (sub1) params.set("sub_id", sub1);
  return `https://tp.media/r?${params.toString()}&u=${encodeURIComponent(destUrl)}`;
}
// Helper: route a destination URL through tp.media when the program has
// both campaignId AND partnerId. Returns null when the program isn't
// fully configured — callers MUST handle null and suppress the link.
// Operator policy (per #23 + audit): TP-only attribution; we never
// emit unattributed external partner URLs.
function tpRouteOrDirect(programKey, destUrl, sub1) {
  const cfg = A[programKey];
  if (cfg && cfg.campaignId && cfg.partnerId) {
    return tpMediaLink({ campaignId: cfg.campaignId, partnerId: cfg.partnerId, destUrl, sub1 });
  }
  return null;
}
function klookLink(query) {
  // Deep-link to Klook search; route through tp.media when configured.
  const dest = `https://www.klook.com/en-US/search/result/?query=${encodeURIComponent(query)}`;
  return tpRouteOrDirect("klook", dest, `klook-${slug(query).slice(0, 24)}`);
}
function tiqetsLink(query) {
  const dest = `https://www.tiqets.com/en/search?q=${encodeURIComponent(query)}`;
  return tpRouteOrDirect("tiqets", dest, `tiqets-${slug(query).slice(0, 24)}`);
}
function civitatisLink(query) {
  if (!A.civitatis.partner) return null;
  return `https://www.civitatis.com/en/search/?q=${encodeURIComponent(query)}&aid=${A.civitatis.partner}`;
}

// ---- Transfers, car rental ----
function welcomePickupsLink(city) {
  // Real URL pattern: www.welcomepickups.com/{city}/airport-transfer/
  const dest = `https://www.welcomepickups.com/${slug(city)}/airport-transfer/`;
  return tpRouteOrDirect("welcomePickups", dest, `wp-${slug(city)}`);
}
function kiwitaxiLink(city) {
  // Real URL pattern: kiwitaxi.com/en/turkey/{city}-airport-transfers
  const dest = `https://kiwitaxi.com/en/turkey/${slug(city)}-airport-transfers`;
  return tpRouteOrDirect("kiwitaxi", dest, `kiwitaxi-${slug(city)}`);
}
function getTransferLink(cityOrQuery) {
  // GetTransfer.com — broad coverage, alternative to WelcomePickups.
  // Land them on the Turkey transfers search.
  const dest = `https://gettransfer.com/en/transfers?from=${encodeURIComponent(cityOrQuery + " Airport")}`;
  return tpRouteOrDirect("getTransfer", dest, `gt-${slug(cityOrQuery)}`);
}
function discoverCarsLink(city) {
  // Not on TP. Return null when no aAid — TP-only policy.
  if (!A.discoverCars.aAid) return null;
  return `https://www.discovercars.com/turkey/${slug(city)}?a_aid=${A.discoverCars.aAid}`;
}
function autoEuropeLink(city) {
  // AutoEurope (TP-routed when configured).
  const dest = `https://www.autoeurope.eu/lp/CarRental/Turkey/${slug(city)}`;
  return tpRouteOrDirect("autoEurope", dest, `ae-${slug(city)}`);
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
function localrentLink(cityName, sub1) {
  return tpRouteOrDirect("localrent", localrentDestUrl(cityName), sub1 || `lr-${slug(cityName)}`);
}
function rentalcarsLink(city) {
  // Not on TP. Return null when no aid — TP-only policy.
  if (!A.rentalcars.aid) return null;
  return `https://www.rentalcars.com/SearchResults.do?location=${encodeURIComponent(city)}&aid=${A.rentalcars.aid}`;
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
// All TP-routed: Airalo, Yesim, GigSky, Saily (eSIMs); VisitorsCoverage,
// Insubuy, AirHelp (insurance / flight comp). Holafly, SafetyWing,
// WorldNomads, Wise are NOT TP partners on this account — kept direct.
function airaloLink() {
  const dest = "https://www.airalo.com/turkey-esim";
  return tpRouteOrDirect("airalo", dest, "airalo-turkey");
}
function yesimLink() {
  const dest = "https://yesim.app/";
  return tpRouteOrDirect("yesim", dest, "yesim-turkey");
}
function gigskyLink() {
  const dest = "https://www.gigsky.com/";
  return tpRouteOrDirect("gigsky", dest, "gigsky-turkey");
}
function sailyLink() {
  const dest = "https://saily.com/";
  return tpRouteOrDirect("saily", dest, "saily-turkey");
}
function holaflyLink() {
  // Holafly is NOT a Travelpayouts partner. Per operator policy we only
  // emit attributed links — return null when ref is empty so callers skip.
  if (!A.holafly.ref) return null;
  return `https://esim.holafly.com/esim-turkey/?ref=${A.holafly.ref}`;
}
function visitorsCoverageLink() {
  const dest = "https://www.visitorscoverage.com/";
  return tpRouteOrDirect("visitorsCoverage", dest, "vc-turkey");
}
function insubuyLink() {
  const dest = "https://www.insubuy.com/";
  return tpRouteOrDirect("insubuy", dest, "insubuy-turkey");
}
function airHelpLink() {
  const dest = "https://www.airhelp.com/";
  return tpRouteOrDirect("airHelp", dest, "airhelp");
}
function safetyWingLink() {
  // Not a Travelpayouts partner. Return null when no ref — TP-only policy.
  if (!A.safetywing.ref) return null;
  return `https://safetywing.com/nomad-insurance/?referenceID=${A.safetywing.ref}`;
}
function worldNomadsLink() {
  // Not a Travelpayouts partner. Return null when no ref — TP-only policy.
  if (!A.worldNomads.ref) return null;
  return `https://www.worldnomads.com/travel-insurance/?affiliate=${A.worldNomads.ref}`;
}
function wiseLink() {
  // Not a Travelpayouts partner. Return null when no invite — TP-only policy.
  if (!A.wise.invite) return null;
  return `https://wise.com/invite/u/${A.wise.invite}`;
}

// ---- Flights ----
function kiwiFlightsLink(city) {
  // Kiwi.com is a TP partner (campaign_id=111). Land on their search page.
  const dest = `https://www.kiwi.com/en/search/results/anywhere/${encodeURIComponent(city)}-turkey`;
  return tpRouteOrDirect("kiwiCom", dest, `kiwi-${slug(city)}`);
}
function wayawayLink(city) {
  // Not on this account. Return null when marker is empty — TP-only policy.
  if (!A.wayaway.marker) return null;
  return `https://wayaway.io/search/${encodeURIComponent(city)}?marker=${A.wayaway.marker}`;
}

// Active-only compare-row OTAs. Trip.com is intentionally excluded
// because it's already the primary "Check availability" CTA; listing
// it again would be confusing. Only includes partners with configured
// affiliate IDs — empty means the row is suppressed.
function compareOtaLinks(query) {
  const out = [];
  const hc = hotelsComLink(query); if (hc) out.push({ name: "Hotels.com", url: hc });
  const ag = agodaLink(query);      if (ag) out.push({ name: "Agoda",      url: ag });
  const hw = hostelworldLink(query);if (hw) out.push({ name: "Hostelworld",url: hw });
  const vr = vrboLink(query);       if (vr) out.push({ name: "Vrbo",       url: vr });
  return out;
}

// --------------------------- shared chrome ---------------------------

function head({ title, description, canonical, ogImage, jsonld = [], preloadHero = null, ogType = "website", article = null }) {
  // Normalise title + description for SERP optimality. Idempotent.
  title = seoTitle(title);
  description = seoDescription(description, "Hand-picked Turkish neighborhoods, hotels, and itineraries — no fluff, no tourist traps.");
  const og = ogImage || `${config.siteUrl}${config.defaultOgImage}`;
  // Ensure every page has at least one JSON-LD entry. If the caller didn't
  // supply any, emit a minimal WebPage with breadcrumb-pointed-to-home so
  // the page still validates as a discoverable entity.
  if (!jsonld.length) {
    jsonld = [{
      "@context": "https://schema.org",
      "@type": "WebPage",
      url: canonical,
      name: title,
      description,
      isPartOf: { "@id": `${config.siteUrl}/#website` },
      inLanguage: "en",
    }];
  }
  const ldBlocks = jsonld.map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`).join("\n");
  const heroPreload = preloadHero
    ? `<link rel="preload" as="image" href="${esc(preloadHero)}" fetchpriority="high">`
    : "";
  // OpenGraph article meta — emitted only when ogType === "article" and the
  // article object is supplied. Used by Facebook, LinkedIn, and (despite the
  // name) most sharing tools as cross-platform article metadata.
  const articleTags = (ogType === "article" && article) ? [
    article.publishedTime ? `<meta property="article:published_time" content="${esc(article.publishedTime)}">` : "",
    article.modifiedTime ? `<meta property="article:modified_time" content="${esc(article.modifiedTime)}">` : "",
    article.author ? `<meta property="article:author" content="${esc(article.author)}">` : "",
    article.section ? `<meta property="article:section" content="${esc(article.section)}">` : "",
    ...(Array.isArray(article.tags) ? article.tags.map((t) => `<meta property="article:tag" content="${esc(t)}">`) : []),
  ].filter(Boolean).join("\n") : "";
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
  // Google AdSense auto-ads. Loaded with async + crossorigin per Google's
  // current snippet. Placement is decided by Google in the AdSense console
  // — operator can exclude commercial-intent city pages there if ad
  // density hurts booking conversion.
  if (config.adsense && config.adsense.clientId) {
    analytics.push(
      `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsense.clientId)}" crossorigin="anonymous"></script>`
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
${(config.adsense && config.adsense.clientId) ? `<meta name="google-adsense-account" content="${esc(config.adsense.clientId)}">` : ""}
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
${articleTags}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${config.twitterHandle ? `<meta name="twitter:site" content="${esc(config.twitterHandle)}">` : ""}
<link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.svg">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="Where to Stay in Turkey" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&display=swap"></noscript>
<style>
/* Block-level FOIT fallback so headings don't shift when Fraunces swaps in.
   size-adjust + ascent-override align fallback metrics to Fraunces so the
   FOUT is invisible; matches CWV-CLS=0 target. */
@font-face{font-family:"Fraunces Fallback";src:local("Georgia");size-adjust:108%;ascent-override:88%;descent-override:22%;line-gap-override:0%}
:root{--font-serif:"Fraunces","Fraunces Fallback",Georgia,"Times New Roman",serif}
/* Reserve viewport space for the cookie banner so it can't shift content
   when it appears post-hydration. Hidden by default; main.js shows it. */
.cookie-banner{contain:layout style}
/* content-visibility hint: lets the browser skip rendering work for
   below-fold sections until they're near the viewport. Massive perf win
   on long pages (city pages, journal posts, regions). */
section.section-sm,section.container.section-sm,article + section.container,#also-consider,.dest-empty{content-visibility:auto;contain-intrinsic-size:auto 600px}
</style>
<link rel="preload" as="style" href="/assets/css/styles.css" fetchpriority="high">
<link rel="stylesheet" href="/assets/css/styles.css" fetchpriority="high">
<link rel="stylesheet" href="/assets/css/filters.css">
<link rel="preconnect" href="https://www.trip.com">
<link rel="dns-prefetch" href="https://tp.media">
<link rel="dns-prefetch" href="https://www.getyourguide.com">
<link rel="dns-prefetch" href="https://localrent.com">
<link rel="dns-prefetch" href="https://www.welcomepickups.com">
<link rel="dns-prefetch" href="https://www.airalo.com">
${(config.adsense && config.adsense.clientId) ? `<link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>
<link rel="preconnect" href="https://googleads.g.doubleclick.net" crossorigin>
<link rel="dns-prefetch" href="https://tpc.googlesyndication.com">` : ""}
${heroPreload}
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
      <a href="/culture/">Culture</a>
      <a href="/quiz/">Quiz</a>
      <a class="nav-search" href="/search/" aria-label="Search the site">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <span class="visually-hidden">Search</span>
      </a>
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
        <h3 class="footer-col-h">Destinations</h3>
        <ul>${cityLinks}</ul>
      </div>
      <div>
        <h3 class="footer-col-h">Plan your trip</h3>
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
          <li><a href="/turkish-phrases/">Turkish phrases &amp; pronunciation</a></li>
          <li><a href="/culture/">Cultural concepts</a></li>
        </ul>
      </div>
      <div>
        <h3 class="footer-col-h">Collections</h3>
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
        <h3 class="footer-col-h">About</h3>
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
      <span lang="tr" style="font-style:italic;display:block;margin-bottom:6px;color:var(--c-accent)">İyi yolculuklar — have a good journey.</span>
      <span>© ${new Date().getFullYear()} ${esc(config.business ? config.business.legalName : config.siteName)}. An independent editorial site. <a href="/about/#affiliate" style="color:inherit">We earn a commission on qualifying bookings</a>.</span>
      <span><a href="/partnerships/" style="color:inherit">For hoteliers</a> · Last updated ${esc(config.business.lastUpdated)}</span>
    </div>
  </div>
</footer>`;
}

function modal(opts = {}) {
  const slug = opts.citySlug;
  const c = (slug && LEAD_COPY_BY_CITY[slug]) || LEAD_COPY_BY_CITY.istanbul;
  const source = slug ? `modal-${slug}` : "modal";
  return `
<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal">
    <button class="modal-close" aria-label="Close">×</button>
    <div class="eyebrow">Free download</div>
    <h3 id="modal-title"><span lang="tr">Buyurun.</span> ${esc(c.title)}</h3>
    <p class="text-muted">${esc(c.sub)}</p>
    <form class="lead-form" action="${esc(config.emailCaptureEndpoint)}" data-source="${esc(source)}">
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
    <span class="text-muted">Check live prices on Trip.com</span>
  </div>
  <a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(bookingLink(search))}">Check availability →</a>
</div>`;
}

function tail() {
  return `
<button type="button" class="back-to-top" id="back-to-top" aria-label="Back to top" hidden>
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
</button>
<script>
// Sticky back-to-top: appears after the user scrolls 60vh down,
// hides at the top, animated on click. rAF-throttled.
(function(){
  var btn = document.getElementById("back-to-top");
  if (!btn) return;
  var pending = false;
  function update(){
    pending = false;
    var show = window.scrollY > window.innerHeight * 0.6;
    if (show && btn.hasAttribute("hidden")) btn.removeAttribute("hidden");
    else if (!show && !btn.hasAttribute("hidden")) btn.setAttribute("hidden", "");
  }
  function onScroll(){
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  btn.addEventListener("click", function(){
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  update();
})();
</script>
${cookieBanner()}
<script type="speculationrules">
{
  "prerender": [{
    "where": { "and": [
      { "href_matches": "/*" },
      { "not": { "selector_matches": ".no-prerender" } },
      { "not": { "href_matches": "/thank-you*" } },
      { "not": { "href_matches": "/quiz/" } }
    ] },
    "eagerness": "moderate"
  }]
}
</script>
<script src="/assets/js/main.js" defer></script>
<script src="/assets/js/filters.js" defer></script>
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

// Build a hotel image URL. Operator sets `hotel.image` to any absolute
// URL — own CDN, Wikimedia, Unsplash, hotel's PR pack. Returns null
// when nothing is configured (the card just renders without a photo).
// Note: a `bookingPhotoId` Booking-CDN fallback used to live here; it
// was removed in the TP-only attribution pass since we don't link to
// Booking anymore and hosting their CDN reads off-policy.
function hotelImageUrl(hotel) {
  return hotel.image || null;
}

// Amenity derivation — regex over hotel name + whyStay text. Mirrored
// in assets/js/filters.js so the runtime icon injection and the chip
// filter agree on the same vocabulary. Order matters for chip display.
const AMENITY_RULES = [
  { key: "pool",      label: "Pool",       test: /\b(pool|swimming|infinity)\b/i },
  { key: "rooftop",   label: "Rooftop",    test: /\b(rooftop|terrace|panoramic)\b/i },
  { key: "spa",       label: "Spa",        test: /\b(hammam|spa|sauna|steam)\b/i },
  { key: "sea",       label: "Sea view",   test: /\b(sea[- ]?view|seafront|beachfront|ocean|aegean|mediterranean|bosphorus|waterfront)\b/i },
  { key: "family",    label: "Families",   test: /\b(famil(y|ies)|kid|child|playground)\b/i },
  { key: "boutique",  label: "Boutique",   test: /\b(boutique|design[- ]led|hipster)\b/i },
  { key: "historic",  label: "Historic",   test: /\b(historic|ottoman|mansion|konak|cave|byzantine|palazzo|century)\b/i },
  { key: "breakfast", label: "Breakfast",  test: /\b(breakfast|kahvalt[ıi])\b/i },
];
function deriveAmenities(hotel) {
  const txt = `${hotel.name || ""} ${hotel.whyStay || ""}`;
  return AMENITY_RULES.filter((r) => r.test.test(txt)).map((r) => r.key);
}

// Render the amenity chip bar for a city's hotel list. Counts are
// derived from the same regex set so chips never advertise zero matches.
function amenityChipBar(hotels) {
  const counts = {};
  for (const h of hotels) for (const k of deriveAmenities(h)) counts[k] = (counts[k] || 0) + 1;
  const chips = AMENITY_RULES.filter((r) => counts[r.key] >= 2);
  if (chips.length < 2) return "";
  return `
  <div class="amenity-filter" role="group" aria-label="Filter hotels by amenity">
    ${chips.map((r) => `<button class="amenity-chip" type="button" data-amenity="${esc(r.key)}">${esc(r.label)} <span class="amenity-chip-count">${counts[r.key]}</span></button>`).join("")}
    <button class="amenity-chip amenity-chip-clear" type="button" data-amenity-clear="1" hidden>Clear</button>
  </div>`;
}

function hotelCard(hotel, city) {
  const areaName = (city.areas.find((a) => a.slug === hotel.area) || {}).name || "";
  const link = hotelLink(hotel, city.name);
  const amenities = deriveAmenities(hotel);
  const imageUrl = hotelImageUrl(hotel);
  const compares = compareOtaLinks(`${hotel.name} ${city.name}`);
  const compareRow = compares.length
    ? `<div class="compare-row small text-muted" style="margin-top:10px">
         Compare: ${compares
           .map((c) => `<a rel="sponsored nofollow" target="_blank" href="${esc(c.url)}">${esc(c.name)}</a>`)
           .join(" · ")}
       </div>`
    : "";
  // Per-hotel structured data: lets Google show this hotel as a discrete
  // entity in rich-result tests. Inlined per card so it travels with the
  // card if reused on aggregate pages.
  //
  // aggregateRating is included only when both `rating` (1-10 Booking-style
  // numeric) and `reviewCount` are populated on the hotel. Fabricating
  // ratings would violate Google's structured-data policy, so when data
  // is absent we just omit the field. The fetch-hotel-photos.js script
  // can be extended to scrape ratings; until then this lights up
  // automatically when the operator populates either field.
  const lodgingLd = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: hotel.name,
    address: {
      "@type": "PostalAddress",
      addressLocality: city.name,
      addressRegion: areaName || undefined,
      addressCountry: "TR",
    },
    priceRange: hotel.tier === "luxury" ? "$$$" : hotel.tier === "budget" ? "$" : "$$",
    description: hotel.whyStay,
    url: `${config.siteUrl}/${city.slug}/#${hotel.area}`,
    ...(imageUrl ? { image: imageUrl } : {}),
    ...(hotel.rating && hotel.reviewCount ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: hotel.rating,
        bestRating: 10,
        worstRating: 1,
        reviewCount: hotel.reviewCount,
      },
    } : {}),
  };
  const lodgingScript = `<script type="application/ld+json">${JSON.stringify(lodgingLd)}</script>`;
  // Visible rating badge — only shows when populated.
  const ratingBadge = (hotel.rating && hotel.reviewCount)
    ? `<div class="hotel-rating" aria-label="Rated ${esc(hotel.rating)} of 10 from ${esc(hotel.reviewCount)} reviews"><span class="hotel-rating-score">${esc(hotel.rating)}</span><span class="hotel-rating-count">${esc(hotel.reviewCount.toLocaleString("en-US"))} reviews</span></div>`
    : "";
  const imageMarkup = imageUrl
    ? `<img class="hotel-image" loading="lazy" decoding="async" src="${esc(imageUrl)}" alt="${esc(hotel.name)} — ${esc(areaName)}, ${esc(city.name)}">`
    : "";
  return `
<article class="card hotel-card" data-tier="${esc(hotel.tier)}" data-bestfor="${esc((hotel.bestFor || []).join(","))}" data-amenities="${esc(amenities.join(" "))}">
  ${imageMarkup}
  <div class="tag-row">
    ${editorsPickBadge(hotel)}
    ${tierTag(hotel.tier)}
    ${hotel.bestFor.slice(0, 2).map(bestForTag).join("")}
  </div>
  <h3>${esc(hotel.name)}</h3>
  <div class="hotel-area">${esc(areaName)}, ${esc(city.name)}</div>
  ${ratingBadge}
  <p class="hotel-why">${esc(hotel.whyStay)}</p>
  <div class="hotel-meta">
    <span class="hotel-price">$${hotel.priceFrom}<span style="color:var(--ink-muted);font-size:.78rem;font-weight:400;margin-left:6px">≈ ₺${(hotel.priceFrom * 34).toLocaleString("tr-TR")}</span> <span class="from">from / night</span></span>
  </div>
  <a class="btn btn-primary btn-block" rel="sponsored nofollow" target="_blank" href="${esc(link)}">Check availability →</a>
  ${compareRow}
  ${lodgingScript}
</article>`;
}

// --------------------------- monetization blocks ---------------------------

// "Experiences in {city}" — tours & activities strip
function experiencesBlock(city) {
  // Only emit cards with attributed URLs (TP-only policy). Functions
  // return null when their program isn't fully configured.
  const cards = [
    { partner: "Klook",        tag: "Discounted activities",        url: klookLink(`${city.name} Turkey`) },
    { partner: "GetYourGuide", tag: "Top-rated tours",              url: getYourGuideLink(`${city.name} Turkey`) },
    { partner: "Viator",       tag: "Alt tour marketplace",         url: viatorLink(`${city.name} Turkey`) },
    { partner: "Tiqets",       tag: "Museum & attraction tickets",  url: tiqetsLink(`${city.name}`) },
  ].filter((c) => !!c.url);
  if (!cards.length) return "";
  return `
<section class="container section-sm">
  <h2>Experiences in ${esc(city.name)}</h2>
  <p class="text-muted">Skip-the-line tickets, food tours, day trips — book the big stuff before you arrive so it doesn't sell out.</p>
  <div class="grid grid-2 grid-4 mt-3">
    ${cards.map((c) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(c.url)}" style="text-decoration:none;color:inherit">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(c.partner)}</div>
        <h3 class="card-h" style="margin:4px 0">${esc(c.tag)}</h3>
        <p class="text-muted small" style="margin:0">Browse ${esc(city.name)} experiences →</p>
      </a>
    `).join("")}
  </div>
</section>`;
}

// "Getting there" — airport transfers + car rental. Only renders cards
// whose helper returned a real URL (TP-attributed); silent skip for
// programs that don't have a partnerId yet.
function transferBlock(city) {
  const cards = [
    { partner: "Kiwitaxi",        tag: "Pre-book a private car",                       url: kiwitaxiLink(city.name) },
    { partner: "Localrent",       tag: "Rental cars — Turkey-focused, no deposit",     url: localrentLink(city.name, `transfer-${slug(city.name)}`) },
    { partner: "Welcome Pickups", tag: "Fixed-price airport transfer",                 url: welcomePickupsLink(city.name) },
    { partner: "Discover Cars",   tag: "Compare car rental rates",                     url: discoverCarsLink(city.name) },
    { partner: "Rentalcars",      tag: "Major-brand car rental",                       url: rentalcarsLink(city.name) },
  ].filter((c) => !!c.url);
  if (!cards.length) return "";
  return `
<section class="container section-sm">
  <h2>Getting around ${esc(city.name)}</h2>
  <p class="text-muted">Pre-book your arrival. Public taxis at Turkish airports are a known tourist trap.</p>
  <div class="grid grid-2 grid-4 mt-3">
    ${cards.map((c) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(c.url)}" style="text-decoration:none;color:inherit">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(c.partner)}</div>
        <h3 class="card-h" style="margin:4px 0">${esc(c.tag)}</h3>
      </a>
    `).join("")}
  </div>
</section>`;
}

// "Before you fly" — eSIM, insurance, money — shown on homepage + city
// pages. Only renders cards whose helper returned a real URL (TP-only
// attribution policy). Non-TP partners (Holafly, SafetyWing, World
// Nomads, Wise) return null until refs are populated.
function essentialsBlock() {
  const cards = [
    { partner: "Airalo",       tag: "Turkey eSIM — no roaming fees",     url: airaloLink() },
    { partner: "Yesim",        tag: "Pay-as-you-go eSIM",                url: yesimLink() },
    { partner: "GigSky",       tag: "Multi-country eSIM",                url: gigskyLink() },
    { partner: "Saily",        tag: "Privacy-first eSIM",                url: sailyLink() },
    { partner: "Holafly",      tag: "Unlimited eSIM alternative",        url: holaflyLink() },
    { partner: "VisitorsCoverage", tag: "Travel medical insurance",      url: visitorsCoverageLink() },
    { partner: "Insubuy",      tag: "Travel insurance comparison",       url: insubuyLink() },
    { partner: "AirHelp",      tag: "Flight delay/cancellation claims",  url: airHelpLink() },
    { partner: "SafetyWing",   tag: "Flexible travel medical insurance", url: safetyWingLink() },
    { partner: "World Nomads", tag: "Adventure travel insurance",        url: worldNomadsLink() },
    { partner: "Wise",         tag: "Cheap lira transfers & card",       url: wiseLink() },
  ].filter((c) => !!c.url).slice(0, 6);
  if (!cards.length) return "";
  return `
<section class="container section-sm">
  <h2>Essentials before you fly</h2>
  <p class="text-muted">Activate these from home — cheaper and simpler than sorting them at the airport.</p>
  <div class="grid grid-2 grid-3 mt-3">
    ${cards.map((c) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(c.url)}" style="text-decoration:none;color:inherit">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(c.partner)}</div>
        <h3 class="card-h" style="margin:4px 0">${esc(c.tag)}</h3>
      </a>
    `).join("")}
  </div>
</section>`;
}

// Flights — only renders cards whose helper returned a real URL.
// Both partners are TP-routed; cards skip silently when partnerId is
// missing.
function flightsBlock(city) {
  const cards = [
    { partner: "Kiwi.com",  tag: `Flights to ${city.name}`,                  url: kiwiFlightsLink(city.name) },
    { partner: "WayAway",   tag: `Flights to ${city.name} (with cashback)`,  url: wayawayLink(city.name) },
  ].filter((c) => !!c.url);
  if (!cards.length) return "";
  return `
<section class="container section-sm">
  <h2>Flights to ${esc(city.name)}</h2>
  <div class="grid grid-2 mt-3">
    ${cards.map((c) => `
      <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(c.url)}" style="text-decoration:none;color:inherit">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(c.partner)}</div>
        <h3 class="card-h" style="margin:4px 0">${esc(c.tag)}</h3>
      </a>
    `).join("")}
  </div>
</section>`;
}

function areaBlock(area, city) {
  const areaHotels = city.hotels.filter((h) => h.area === area.slug);
  const areaSearch = bookingLink(`${area.name} ${city.name}`);
  // Optional richer content (set per-area in data files when available).
  // longDescription = paragraph that expands the oneLiner with neighborhood
  // colour, history, and "who this fits". Verdict = one-line "pick this if".
  const longDesc = area.longDescription
    ? `<p class="area-long" style="margin-top:8px">${esc(area.longDescription)}</p>`
    : "";
  const verdict = area.verdict
    ? `<p class="area-verdict" style="margin-top:6px;font-style:italic;color:var(--ink-muted)">${esc(area.verdict)}</p>`
    : "";
  return `
<section class="area" id="${esc(area.slug)}">
  <div class="tag-row" style="margin-bottom:8px">
    ${area.bestForTags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
  </div>
  <h3>${esc(area.name)}</h3>
  <p class="area-sub">${esc(area.oneLiner)}</p>
  ${longDesc}
  ${verdict}

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
    <a class="btn btn-ghost" rel="sponsored nofollow" target="_blank" href="${esc(areaSearch)}">See all ${esc(area.name)} hotels →</a>
  </div>
</section>`;
}

// Optional city-level prose block: getting around + nearby day trips +
// local food. Renders only when the city data has any of these populated.
// Designed for short city pages (Şanlıurfa, Safranbolu, etc.) where the
// neighborhood count alone doesn't justify a long page; this adds factual
// substance without padding.
function cityContextBlock(c) {
  const ga = (c.gettingAround || "").trim();
  const dt = (c.nearbyDayTrips || []).filter((x) => x && x.name);
  const lf = (c.localFood || "").trim();
  if (!ga && !dt.length && !lf) return "";
  return `
<section class="container container-narrow prose mt-4" aria-labelledby="city-context-h">
  <h2 id="city-context-h">Practical ${esc(c.name)}</h2>
  ${ga ? `<h3>Getting around</h3><p>${esc(ga)}</p>` : ""}
  ${lf ? `<h3>What to eat</h3><p>${esc(lf)}</p>` : ""}
  ${dt.length ? `<h3>What's nearby</h3>
    <ul>
      ${dt.map((t) => `<li><strong>${esc(t.name)}</strong>${t.description ? ` — ${esc(t.description)}` : ""}</li>`).join("")}
    </ul>` : ""}
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

// Per-city lead-magnet copy. Falls back to the Istanbul 3-day itinerary
// (the strongest universal hook) for non-city pages. The data-source value
// flows through MailerLite as `subscriber.source`, so we can see which page
// converted in the dashboard.
const LEAD_COPY_BY_CITY = {
  istanbul:   { eyebrow: "Free — sent instantly", title: "Get our 3-day Istanbul itinerary",        sub: "The exact plan we'd give a friend visiting Istanbul. Where to eat, what to skip, how to avoid tourist traps." },
  cappadocia: { eyebrow: "Free — sent instantly", title: "Get our Cappadocia plan",                  sub: "Which valley, which cave hotel, balloon-flight tips, and the shoulder-season sweet spot. The version we'd send a friend." },
  antalya:    { eyebrow: "Free — sent instantly", title: "Get our Antalya area + beach guide",       sub: "Which Antalya base picks the right beach for you — Konyaaltı, Lara, Kaleiçi, or further out. With our day-trip shortlist." },
  bodrum:     { eyebrow: "Free — sent instantly", title: "Get our Bodrum peninsula playbook",        sub: "Yalıkavak vs Türkbükü vs Gümüşlük — picked for the trip you're actually planning. Plus where to rent a boat for a day." },
  fethiye:    { eyebrow: "Free — sent instantly", title: "Get our Fethiye + Ölüdeniz plan",          sub: "How to base for paragliding, blue-cruise routes, and the Lycian Way. With Babadağ launch-window timing." },
  izmir:      { eyebrow: "Free — sent instantly", title: "Get our Izmir + Aegean plan",              sub: "Alaçatı, Çeşme, Şirince, Ephesus — how to string them together. Including which Izmir neighborhood actually beats the resorts." },
  pamukkale:  { eyebrow: "Free — sent instantly", title: "Get our Pamukkale day-trip playbook",      sub: "Which gate, which time of day, where to overnight, and the Hierapolis order that beats every tour bus." },
  marmaris:   { eyebrow: "Free — sent instantly", title: "Get our Marmaris + Dalyan guide",          sub: "How to base for Datça, Selimiye, Bozburun, and the Dalyan loggerhead beach without falling into the all-inclusive trap." },
  kas:        { eyebrow: "Free — sent instantly", title: "Get our Kaş Mediterranean plan",           sub: "Diving, Kekova kayaks, Lycian Way day hikes, and where to eat on the harbour. The slow, beautiful version of the south coast." },
  trabzon:    { eyebrow: "Free — sent instantly", title: "Get our Black Sea highlands plan",         sub: "Uzungöl, Sumela, the Pokut–Sal yayla loop, and where to find real kuymak. The one Black Sea trip that's worth flying for." },
  alanya:     { eyebrow: "Free — sent instantly", title: "Get our Alanya + east-Antalya plan",       sub: "Which beach, which old-town stay, the Damlataş + castle morning, and the day-trips most visitors miss." },
  side:       { eyebrow: "Free — sent instantly", title: "Get our Side + Manavgat plan",             sub: "Old Town vs west-beach vs east-beach — which one is the right base for the trip you're planning. Plus the temple light-trick at sunset." },
  kusadasi:   { eyebrow: "Free — sent instantly", title: "Get our Kuşadası + Ephesus plan",          sub: "Ephesus timing, Şirince afternoon, Selçuk basilica, and which Kuşadası harbour-front spots earn the price tag." },
  mersin:     { eyebrow: "Free — sent instantly", title: "Get our Mersin + Cilician coast plan",     sub: "Kızkalesi, Tarsus, Anamur — the eastern Mediterranean stretch most travelers skip and shouldn't." },
  rize:       { eyebrow: "Free — sent instantly", title: "Get our Rize tea-country plan",            sub: "Ayder, the Fırtına valley, the Kaçkar yaylas — and how to find the family pansiyons the package tours don't book." },
  ankara:     { eyebrow: "Free — sent instantly", title: "Get our Ankara + central-Anatolia plan",   sub: "Anıtkabir, the Museum of Anatolian Civilizations, Hamamönü night, and how to add a Cappadocia day-trip from the capital." },
  gaziantep:  { eyebrow: "Free — sent instantly", title: "Get our Gaziantep food itinerary",         sub: "Which kebabçı, which baklava house (it's not the famous one), the copper market sequence, and Zeugma in the right light." },
  bursa:      { eyebrow: "Free — sent instantly", title: "Get our Bursa + Uludağ plan",              sub: "İskender at the source, Cumalıkızık village, the silk bazaar, and the gondola up Uludağ for the snow-or-summer view." },
  konya:      { eyebrow: "Free — sent instantly", title: "Get our Konya Sufi-route plan",            sub: "Which sema night to attend (the one tourists skip), Mevlana morning, and the food no Istanbul restaurant gets right." },
  mardin:     { eyebrow: "Free — sent instantly", title: "Get our Mardin + Tur Abdin plan",          sub: "Stone-old-town stays, Deyrulzafaran morning, Hasankeyf side-trip, and which terrace restaurant earns its sunset price." },
  safranbolu: { eyebrow: "Free — sent instantly", title: "Get our Safranbolu + Amasra plan",         sub: "Ottoman wooden-house stays, the cinci hamam, Yörük village, and the Black Sea coast finale via Amasra." },
  sanliurfa:  { eyebrow: "Free — sent instantly", title: "Get our Şanlıurfa + Göbekli Tepe plan",    sub: "Göbekli Tepe morning, the carp pools, balıklı çiğköfte at the right place, and Harran's beehive houses for the road back." },
};

function leadMagnet(opts = {}) {
  const slug = opts.citySlug;
  const c = (slug && LEAD_COPY_BY_CITY[slug]) || LEAD_COPY_BY_CITY.istanbul;
  const source = opts.source || (slug ? `city-${slug}` : "inline");
  return `
<section class="container"><div class="lead-magnet">
  <div class="eyebrow">${esc(c.eyebrow)}</div>
  <h2 class="lead-magnet-h">${esc(c.title)}</h2>
  <p class="text-muted">${esc(c.sub)}</p>
  <form class="lead-form" action="${esc(config.emailCaptureEndpoint)}" data-source="${esc(source)}">
    <input type="email" name="email" placeholder="your@email.com" required aria-label="Email">
    <button type="submit" class="btn btn-primary">Send it</button>
  </form>
  <p class="lead-note">No spam. Unsubscribe anytime.</p>
</div></section>`;
}

// Convenience block for high-intent guide / collection / planning pages that
// don't already have an inline lead magnet. Combines email capture above the
// affiliate "Essentials before you fly" cards.
function leadAndEssentials(opts = {}) {
  return `${leadMagnet(opts)}\n${essentialsBlock()}`;
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

// Process a journal-article bodyHtml: extract H2 headings to build a
// table of contents, slug-id each H2 for anchor links, and emit a
// candidate "midpoint" anchor where a mid-article CTA can be injected
// (immediately AFTER the closing </p> following the middle H2).
//
// Returns { html, toc, wordCount }. Plain JS string transforms — no DOM
// parser dependency, kept narrow on the patterns we actually emit in
// data/journal-posts.json.
function processArticleBody(bodyHtml) {
  if (!bodyHtml) return { html: "", toc: "", wordCount: 0 };
  const headings = [];
  const slugify = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const seen = new Set();
  // Add `id` to each <h2> that doesn't already have one.
  let html = bodyHtml.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (m, attrs, inner) => {
    if (attrs && /\sid=/.test(attrs)) {
      const idMatch = attrs.match(/id="([^"]+)"/);
      if (idMatch) headings.push({ id: idMatch[1], text: inner.replace(/<[^>]+>/g, "").trim() });
      return m;
    }
    let id = slugify(inner);
    if (!id) return m;
    let unique = id;
    let n = 2;
    while (seen.has(unique)) unique = `${id}-${n++}`;
    seen.add(unique);
    headings.push({ id: unique, text: inner.replace(/<[^>]+>/g, "").trim() });
    return `<h2 id="${unique}"${attrs || ""}>${inner}</h2>`;
  });
  // Inject the mid-article CTA placeholder marker after the H2 closest to
  // the middle of the article. Renderer can split on <!-- midpoint --> to
  // insert custom content. Only when there are >= 4 H2s (i.e. genuinely
  // long-form). For shorter posts, no mid-CTA.
  if (headings.length >= 4) {
    const mid = Math.floor(headings.length / 2);
    const midId = headings[mid].id;
    const re = new RegExp(`<h2 id="${midId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"`);
    // Find the END of the section started by the midpoint H2: i.e. the
    // next </p> after this heading. We replace that </p> with </p><!-- midpoint -->.
    const idx = html.search(re);
    if (idx >= 0) {
      const after = html.indexOf("</p>", idx);
      if (after > 0) {
        html = html.slice(0, after + 4) + "<!--midpoint-->" + html.slice(after + 4);
      }
    }
  }
  const toc = headings.length >= 3
    ? `<nav class="article-toc" aria-label="Table of contents">
  <div class="article-toc-label">Contents</div>
  <ol>
    ${headings.map((h) => `<li><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join("")}
  </ol>
</nav>`
    : "";
  const wordCount = bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return { html, toc, wordCount };
}

// HowTo structured data — for procedural guides where each step is a
// distinct action (e.g. "Install eSIM before you fly"). Steps must be a
// non-empty array of strings; supplyOf and toolOf are optional.
function howToLd({ name, description, totalTime, estimatedCost, steps }) {
  if (!steps || !steps.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    ...(description ? { description } : {}),
    ...(totalTime ? { totalTime } : {}),
    ...(estimatedCost ? {
      estimatedCost: {
        "@type": "MonetaryAmount",
        currency: estimatedCost.currency || "USD",
        value: String(estimatedCost.value),
      },
    } : {}),
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: typeof s === "string" ? `Step ${i + 1}` : (s.name || `Step ${i + 1}`),
      text: typeof s === "string" ? s : s.text,
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

// Local hero photos: scan assets/img/heroes/ once at build start. The operator
// drops a curated JPG/PNG/WebP/SVG at e.g. assets/img/heroes/istanbul.jpg and
// the build wires it as the hero. Local photos always win over external
// data-URL heroImages (operator-curated > stock).
const HERO_PHOTO_DIR = "assets/img/heroes";
const HERO_PHOTO_EXTS = ["jpg", "jpeg", "png", "webp", "avif", "svg"];
const localHeroBySlug = (function () {
  const map = {};
  try {
    const dir = path.join(__dirname, HERO_PHOTO_DIR);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        const ext = (f.split(".").pop() || "").toLowerCase();
        if (!HERO_PHOTO_EXTS.includes(ext)) continue;
        const slug = f.slice(0, -(ext.length + 1));
        if (!map[slug]) map[slug] = `/${HERO_PHOTO_DIR}/${f}`;
      }
    }
  } catch (e) { /* directory missing — that's fine, no local heroes yet */ }
  return map;
})();
// Resolve a hero image path for any showcase entity:
//   1. local curated photo at assets/img/heroes/{slug}.{ext} — always wins
//   2. data-supplied heroImage URL (Wikimedia, etc.) — gated by useHeroPhotos
//   3. null — caller renders the themed art fallback
function resolveHeroImage(slug, dataHeroImage) {
  if (slug && localHeroBySlug[slug]) return localHeroBySlug[slug];
  if (config.useHeroPhotos && dataHeroImage) return dataHeroImage;
  return null;
}

// Geographic coordinates per city — well-known centroids for the
// destination, accurate to ~1km. Drives the Place + GeoCoordinates
// schema injected into city pages so Google's geo-aware result panels
// (Maps cards, "places nearby", knowledge graph) can pin the page to
// a real location. For multi-place destinations (Cappadocia, the
// Black Sea coast etc.), we use the canonical visitor centre.
const CITY_GEO = {
  istanbul:    { lat: 41.0082, lng: 28.9784, region: "Marmara" },
  cappadocia:  { lat: 38.6431, lng: 34.8289, region: "Central Anatolia" },  // Göreme
  antalya:     { lat: 36.8969, lng: 30.7133, region: "Mediterranean" },
  bodrum:      { lat: 37.0344, lng: 27.4305, region: "Aegean" },
  fethiye:     { lat: 36.6517, lng: 29.1244, region: "Aegean" },
  izmir:       { lat: 38.4192, lng: 27.1287, region: "Aegean" },
  pamukkale:   { lat: 37.9203, lng: 29.1196, region: "Aegean" },
  marmaris:    { lat: 36.8550, lng: 28.2680, region: "Aegean" },
  kas:         { lat: 36.2010, lng: 29.6420, region: "Mediterranean" },
  trabzon:     { lat: 41.0050, lng: 39.7178, region: "Black Sea" },
  alanya:      { lat: 36.5447, lng: 31.9997, region: "Mediterranean" },
  side:        { lat: 36.7672, lng: 31.3886, region: "Mediterranean" },
  kusadasi:    { lat: 37.8597, lng: 27.2598, region: "Aegean" },
  mersin:      { lat: 36.8121, lng: 34.6415, region: "Mediterranean" },
  rize:        { lat: 41.0250, lng: 40.5170, region: "Black Sea" },
  ankara:      { lat: 39.9334, lng: 32.8597, region: "Central Anatolia" },
  gaziantep:   { lat: 37.0662, lng: 37.3833, region: "Southeastern Anatolia" },
  bursa:       { lat: 40.1828, lng: 29.0670, region: "Marmara" },
  konya:       { lat: 37.8714, lng: 32.4847, region: "Central Anatolia" },
  mardin:      { lat: 37.3128, lng: 40.7245, region: "Southeastern Anatolia" },
  safranbolu:  { lat: 41.2526, lng: 32.6939, region: "Black Sea" },
  sanliurfa:   { lat: 37.1671, lng: 38.7958, region: "Southeastern Anatolia" },
};

// Per-month palette + emoji, grouped by season for cohesion.
const MONTH_THEME = {
  "january-in-turkey":   { emoji: "❄️", a: "#1e3a8a", b: "#bae6fd" },
  "february-in-turkey":  { emoji: "🌨️", a: "#1e3a8a", b: "#bae6fd" },
  "march-in-turkey":     { emoji: "🌷", a: "#065f46", b: "#86efac" },
  "april-in-turkey":     { emoji: "🌼", a: "#065f46", b: "#86efac" },
  "may-in-turkey":       { emoji: "🌹", a: "#065f46", b: "#86efac" },
  "june-in-turkey":      { emoji: "☀️", a: "#b45309", b: "#fdba74" },
  "july-in-turkey":      { emoji: "🏖️", a: "#b45309", b: "#fdba74" },
  "august-in-turkey":    { emoji: "🌞", a: "#b45309", b: "#fdba74" },
  "september-in-turkey": { emoji: "🍇", a: "#7c2d12", b: "#f59e0b" },
  "october-in-turkey":   { emoji: "🍂", a: "#7c2d12", b: "#f59e0b" },
  "november-in-turkey":  { emoji: "🍵", a: "#7c2d12", b: "#f59e0b" },
  "december-in-turkey":  { emoji: "✨", a: "#1e3a8a", b: "#bae6fd" },
};
// Per-experience theme.
const EXPERIENCE_THEME = {
  "cay-culture":                 { emoji: "🍵", a: "#7c2d12", b: "#fbbf24" },
  "turkish-coffee":              { emoji: "☕", a: "#451a03", b: "#fef3c7" },
  "whirling-dervishes":          { emoji: "🌀", a: "#1e1b4b", b: "#fbbf24" },
  "turkish-bazaars":             { emoji: "🏺", a: "#7c2d12", b: "#0e7490" },
  "hammam-ritual-deep-dive":     { emoji: "♨️", a: "#0e7490", b: "#e0f2fe" },
  "anatolian-breakfast-culture": { emoji: "🍳", a: "#65a30d", b: "#dc2626" },
};
// Per-cultural-concept theme.
const CULTURE_THEME = {
  "misafirperverlik-turkish-hospitality": { emoji: "🤝", a: "#9a3412", b: "#fed7aa" },
  "mahalle-the-turkish-neighborhood":     { emoji: "🏘️", a: "#7c2d12", b: "#fef3c7" },
  "cay-as-currency":                      { emoji: "🍵", a: "#7c2d12", b: "#fbbf24" },
  "kolay-gelsin-the-everyday-blessing":   { emoji: "🤲", a: "#0369a1", b: "#fde68a" },
  "imece-collective-work":                { emoji: "🌾", a: "#65a30d", b: "#fde68a" },
  "bayram-traditions-turkey":             { emoji: "🎉", a: "#9d174d", b: "#86efac" },
};

// Per-collection visual identity — emoji + palette (mirrors CITY_PALETTES
// pattern). Used by the collections hub showcase grid. Not all collections
// are wired below; missing keys fall back to the default accent palette.
const COLLECTION_THEME = {
  "honeymoon-hotels-turkey":      { emoji: "💍", a: "#9d174d", b: "#fbbf24" },
  "family-friendly-hotels-turkey":{ emoji: "👨‍👩‍👧", a: "#0e7490", b: "#fb923c" },
  "historic-hotels-turkey":       { emoji: "🏛️", a: "#7c2d12", b: "#fef3c7" },
  "beachfront-hotels-turkey":     { emoji: "🏖️", a: "#075985", b: "#67e8f9" },
  "cave-hotels-cappadocia":       { emoji: "🏞️", a: "#7c2d12", b: "#f59e0b" },
  "luxury-resorts-turkish-coast": { emoji: "✨", a: "#1e3a8a", b: "#fbbf24" },
};
// Per-region palette + emoji.
const REGION_THEME = {
  "aegean-coast":               { emoji: "🌊", a: "#65a30d", b: "#0891b2" },
  "mediterranean-riviera":      { emoji: "⛱️", a: "#0e7490", b: "#fde68a" },
  "cappadocia-central-anatolia":{ emoji: "🎈", a: "#7c2d12", b: "#f59e0b" },
  "black-sea":                  { emoji: "🌲", a: "#064e3b", b: "#34d399" },
  "eastern-anatolia":           { emoji: "🕌", a: "#7c2d12", b: "#fb923c" },
};

// Render the .showcase-card markup for any photo-led card. Generic enough
// to cover cities, collections, regions — caller supplies all visible bits.
function showcaseCard({
  href,
  title,
  description,
  chip,                  // string or null — top-left overlay text
  badge,                 // raw HTML for badge (top-right) or null
  emoji,                 // emoji watermark when no photo
  paletteStyle,          // "--city-a:#xxx;--city-b:#yyy"
  artSvg,                // optional themed SVG (string) for art fallback
  photoUrl,              // optional photo URL — only used when usePhoto=true
  usePhoto,
  dataAttrs,             // string of extra data-* attributes on the <a>
  cta = "See more",
}) {
  const heroMarkup = (usePhoto && photoUrl)
    ? `<img src="${esc(photoUrl)}" alt="${esc(title)}" loading="lazy" decoding="async">`
    : `<div class="showcase-art" style="${paletteStyle || ""}">
         <div class="showcase-art-emoji">${emoji || "📍"}</div>
         ${artSvg ? `<div class="showcase-art-svg">${artSvg}</div>` : ""}
       </div>`;
  return `
<a class="showcase-card ${(usePhoto && photoUrl) ? "has-photo" : "has-art"}" href="${esc(href)}" ${dataAttrs || ""}>
  <div class="showcase-photo">
    ${chip ? `<span class="showcase-chip"><span class="showcase-chip-flag" aria-hidden="true">🇹🇷</span><span>${esc(chip)}</span></span>` : ""}
    ${badge || ""}
    ${heroMarkup}
  </div>
  <div class="showcase-body">
    <h3 class="showcase-title">${esc(title)}</h3>
    <p class="showcase-desc">${esc(description)}</p>
  </div>
  <div class="showcase-cta">
    <span>${esc(cta)}</span>
    <span class="showcase-cta-arrow" aria-hidden="true">→</span>
  </div>
</a>`;
}

// Showcase card — the photo-led "Top 10 places to stay in X" card pattern.
// Used on the homepage destinations grid and (optionally) collection hubs.
// When site config has useHeroPhotos=false, OR when a city has no heroImage,
// renders an on-brand themed gradient with the city emoji + themed art SVG
// instead of an external photo. The visible result still looks intentional
// (consistent palette, animated gradient, large emoji watermark) — not
// like a "missing photo" placeholder.
// Reusable count badge — black pill with white number, used by collection/
// region/month/experience cards.
function countBadge(n, label) {
  if (!n || n <= 0) return "";
  return `<span class="showcase-badge" title="${esc(label)}" aria-label="${esc(label)}" style="background:var(--ink);color:#fff;font-family:var(--font-sans);font-weight:700;font-size:0.78rem;padding:0 8px;width:auto;height:28px;border-radius:14px">${esc(String(n))}</span>`;
}

function cityShowcaseCard(c) {
  const description = (c.intro || c.tagline || "").replace(/\s+/g, " ").trim();
  const editorsPick = !!(c.hotels || []).find((h) => h.editorsPick);
  const badge = editorsPick
    ? `<span class="showcase-badge" title="Has editor's-pick hotels" aria-label="Editor's pick"><svg viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z"/></svg></span>`
    : "";
  const photoUrl = resolveHeroImage(c.slug, c.heroImage);
  return showcaseCard({
    href: `/${c.slug}/`,
    title: `Where to stay in ${c.name}`,
    description,
    chip: c.name,
    badge,
    emoji: c.emoji || "📍",
    paletteStyle: cityPaletteStyle(c.slug),
    artSvg: cityHeroSvg(c.slug),
    photoUrl,
    usePhoto: !!photoUrl,
    dataAttrs: `data-city="${esc(c.slug)}" data-name="${esc(c.name.toLowerCase())}" data-popularity="${esc(String(c.popularity || 0))}"`,
  });
}

// Collection showcase card. `c` is a collection from data/collections.json.
function collectionShowcaseCard(c) {
  const theme = COLLECTION_THEME[c.slug] || { emoji: "🏨", a: "#0b0f19", b: "#b45309" };
  const description = (c.subtitle || (c.intro || "").slice(0, 200)).replace(/\s+/g, " ").trim();
  const count = (c.picks || []).length;
  const photoUrl = resolveHeroImage(c.slug, c.heroImage);
  return showcaseCard({
    href: `/best-of-turkey/${c.slug}/`,
    title: c.title,
    description,
    chip: "Collection",
    badge: countBadge(count, `${count} verified picks`),
    emoji: theme.emoji,
    paletteStyle: `--city-a:${theme.a};--city-b:${theme.b};--city-ink:#fff`,
    artSvg: null,
    photoUrl,
    usePhoto: !!photoUrl,
    dataAttrs: `data-name="${esc((c.title || "").toLowerCase())}"`,
    cta: "Open collection",
  });
}

// Region showcase card. `r` is a region from data/regions.json.
function regionShowcaseCard(r) {
  const theme = REGION_THEME[r.slug] || { emoji: "🗺️", a: "#0b0f19", b: "#b45309" };
  const description = (r.summary || r.tagline || "").replace(/\s+/g, " ").trim();
  const cityCount = (r.cities || []).length;
  const photoUrl = resolveHeroImage(r.slug, r.heroImage);
  return showcaseCard({
    href: `/regions/${r.slug}/`,
    title: r.name,
    description,
    chip: "Region",
    badge: countBadge(cityCount, `${cityCount} cities`),
    emoji: theme.emoji,
    paletteStyle: `--city-a:${theme.a};--city-b:${theme.b};--city-ink:#fff`,
    artSvg: null,
    photoUrl,
    usePhoto: !!photoUrl,
    dataAttrs: `data-name="${esc((r.name || "").toLowerCase())}"`,
    cta: "Explore region",
  });
}

// Month showcase card.
function monthShowcaseCard(m) {
  const theme = MONTH_THEME[m.slug] || { emoji: "📅", a: "#0b0f19", b: "#b45309" };
  const description = (m.subtitle || (m.summary || "").slice(0, 200)).replace(/\s+/g, " ").trim();
  const photoUrl = resolveHeroImage(m.slug, m.heroImage);
  return showcaseCard({
    href: `/turkey-by-month/${m.slug}/`,
    title: `Turkey in ${m.monthName}`,
    description,
    chip: m.monthName,
    badge: "",
    emoji: theme.emoji,
    paletteStyle: `--city-a:${theme.a};--city-b:${theme.b};--city-ink:#fff`,
    artSvg: null,
    photoUrl,
    usePhoto: !!photoUrl,
    dataAttrs: `data-name="${esc((m.monthName || "").toLowerCase())}" data-month="${esc(String(m.monthNum || 0))}"`,
    cta: "See the month",
  });
}

// Experience showcase card.
function experienceShowcaseCard(e) {
  const theme = EXPERIENCE_THEME[e.slug] || { emoji: "✨", a: "#0b0f19", b: "#b45309" };
  const description = (e.subtitle || (e.intro || "").slice(0, 200)).replace(/\s+/g, " ").trim();
  const photoUrl = resolveHeroImage(e.slug, e.heroImage);
  return showcaseCard({
    href: `/experiences/${e.slug}/`,
    title: e.title,
    description,
    chip: "Experience",
    badge: "",
    emoji: theme.emoji,
    paletteStyle: `--city-a:${theme.a};--city-b:${theme.b};--city-ink:#fff`,
    artSvg: null,
    photoUrl,
    usePhoto: !!photoUrl,
    dataAttrs: `data-name="${esc((e.title || "").toLowerCase())}"`,
    cta: "Read",
  });
}

// Cultural-concept showcase card.
function culturalConceptShowcaseCard(c) {
  const theme = CULTURE_THEME[c.slug] || { emoji: "🇹🇷", a: "#0b0f19", b: "#b45309" };
  const description = (c.subtitle || (c.intro || "").slice(0, 200)).replace(/\s+/g, " ").trim();
  const photoUrl = resolveHeroImage(c.slug, c.heroImage);
  return showcaseCard({
    href: `/culture/${c.slug}/`,
    title: c.title,
    description,
    chip: "Culture",
    badge: "",
    emoji: theme.emoji,
    paletteStyle: `--city-a:${theme.a};--city-b:${theme.b};--city-ink:#fff`,
    artSvg: null,
    photoUrl,
    usePhoto: !!photoUrl,
    dataAttrs: `data-name="${esc((c.title || "").toLowerCase())}"`,
    cta: "Read",
  });
}

function renderHome() {
  const canonical = `${config.siteUrl}/`;
  const title = `${config.siteName} — neighborhoods, hotels, real picks`;
  const description = config.siteDescription;

  const body = `
${nav()}
${disclosureBanner()}
<section class="hero-home">

  <div class="container" style="position:relative">
    <div class="eyebrow"><span lang="tr">Hoş geldiniz.</span> Turkey trip planning, simplified.</div>
    <h1>Where should you <em>actually</em> stay in Turkey?</h1>
    <p class="hero-sub">${cities.length} destinations worth flying for. Each one has 3–5 mahalleler — neighborhoods with wildly different vibes. Pick the wrong one and you waste a day commuting. We make the call for you.</p>
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
    <div class="dest-layout">
      <aside class="dest-sidebar" aria-label="Filter destinations">
        <h3><span class="pin" aria-hidden="true">📍</span>Destinations in Turkey</h3>
        <div class="dest-search"><input type="search" id="dest-search" placeholder="Search destinations in Turkey" aria-label="Search destinations" autocomplete="off"></div>
        <ul class="dest-list" id="dest-list" role="group">
          ${cities.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => `
            <li data-name="${esc(c.name.toLowerCase())}" data-slug="${esc(c.slug)}">
              <label><input type="checkbox" data-city="${esc(c.slug)}" aria-label="Filter by ${esc(c.name)}"><span>${esc(c.name)}</span></label>
            </li>`).join("")}
          <button type="button" class="reset" id="dest-reset">Reset filters</button>
        </ul>
      </aside>
      <div class="dest-main">
        <div class="dest-toolbar">
          <div class="view-toggle" role="tablist" aria-label="View mode">
            <button type="button" data-view="grid" class="is-active" aria-label="Grid view"><svg viewBox="0 0 24 24"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg></button>
            <button type="button" data-view="list" aria-label="List view"><svg viewBox="0 0 24 24"><path d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z"/></svg></button>
          </div>
          <h2 class="dest-title">Top Places To Stay in Turkey</h2>
          <div class="sort">
            <svg class="sort-fire" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67M11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8"/></svg>
            <span>Sort by:</span>
            <select id="dest-sort" aria-label="Sort destinations">
              <option value="popular" selected>Popular</option>
              <option value="alpha">A → Z</option>
              <option value="alpha-desc">Z → A</option>
            </select>
          </div>
        </div>
        <div class="grid grid-2 grid-3 showcase-grid" id="dest-grid" data-view="grid">
          ${cities.map(cityShowcaseCard).join("")}
        </div>
        <div class="dest-empty" id="dest-empty" hidden>No destinations match your filter. <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('dest-reset').click()" style="margin-left:8px">Reset filters</button></div>
      </div>
    </div>
  </div>
</section>

<script>
// Destinations grid: filter by checkbox + free-text search, sort, view toggle.
// Lightweight, no framework. Plays nicely with reveal/animation.
(function () {
  var grid = document.getElementById("dest-grid");
  var list = document.getElementById("dest-list");
  var search = document.getElementById("dest-search");
  var sort = document.getElementById("dest-sort");
  var emptyState = document.getElementById("dest-empty");
  var reset = document.getElementById("dest-reset");
  if (!grid || !list || !search || !sort) return;
  var cards = Array.from(grid.querySelectorAll(".showcase-card"));
  var listItems = Array.from(list.querySelectorAll("li"));

  function applyFilter() {
    var q = (search.value || "").trim().toLowerCase();
    var checkedSlugs = Array.from(list.querySelectorAll("input:checked")).map(function (i) { return i.dataset.city; });
    // Filter sidebar list by search text
    listItems.forEach(function (li) {
      li.classList.toggle("is-hidden", q && li.dataset.name.indexOf(q) === -1);
    });
    // Filter grid by (checkbox set OR search match)
    var visible = 0;
    cards.forEach(function (c) {
      var slug = c.dataset.city;
      var name = c.dataset.name || "";
      var matchesSearch = !q || name.indexOf(q) !== -1;
      var matchesChecks = checkedSlugs.length === 0 || checkedSlugs.indexOf(slug) !== -1;
      var show = matchesSearch && matchesChecks;
      c.style.display = show ? "" : "none";
      if (show) visible++;
    });
    emptyState.hidden = visible !== 0;
  }

  function applySort() {
    var mode = sort.value;
    var sorted = cards.slice();
    if (mode === "alpha") {
      sorted.sort(function (a, b) { return a.dataset.name.localeCompare(b.dataset.name); });
    } else if (mode === "alpha-desc") {
      sorted.sort(function (a, b) { return b.dataset.name.localeCompare(a.dataset.name); });
    } else {
      // Popular: rank by data-popularity desc, fallback to insertion order
      sorted.sort(function (a, b) {
        return (parseFloat(b.dataset.popularity) || 0) - (parseFloat(a.dataset.popularity) || 0);
      });
    }
    sorted.forEach(function (c) { grid.appendChild(c); });
  }

  search.addEventListener("input", applyFilter);
  list.addEventListener("change", applyFilter);
  sort.addEventListener("change", applySort);

  // View toggle
  var toggleButtons = document.querySelectorAll(".dest-toolbar .view-toggle button");
  toggleButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      toggleButtons.forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      grid.dataset.view = btn.dataset.view;
    });
  });

  reset.addEventListener("click", function () {
    search.value = "";
    list.querySelectorAll("input:checked").forEach(function (i) { i.checked = false; });
    sort.value = "popular";
    applyFilter();
    applySort();
  });
})();
</script>

${editorsPicksStrip()}

${leadMagnet()}

${essentialsBlock()}

<section class="section">
  <div class="container container-narrow">
    <h2>How this site works</h2>
    <div class="prose">
      <p>Most travel sites bury the answer. We put it up front: for each major Turkish city, we tell you which neighborhoods are worth staying in, who each one is best for, and which hotels are genuinely recommended in each.</p>
      <p>We link to hotels and flights on Trip.com; to car rentals on Localrent; to tours on GetYourGuide and Klook; to airport transfers on Welcome Pickups and Kiwitaxi; and to a handful of essentials like Turkish eSIMs (Airalo) and travel insurance. If you book through any of these links, we earn a small commission — at no extra cost to you. That's how we keep this site ad-free.</p>
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
      "@id": `${config.siteUrl}/#website`,
      name: config.siteName,
      url: canonical,
      inLanguage: "en",
      description: config.siteDescription,
      publisher: { "@id": `${config.siteUrl}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${config.siteUrl}/search/?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${config.siteUrl}/#organization`,
      name: config.siteName,
      legalName: config.business.legalName,
      url: canonical,
      logo: { "@type": "ImageObject", url: `${config.siteUrl}/assets/img/favicon.svg`, width: 64, height: 64 },
      foundingLocation: { "@type": "Place", name: config.business.jurisdiction },
      contactPoint: [
        { "@type": "ContactPoint", contactType: "customer support", email: config.business.contactEmail, availableLanguage: ["English", "Turkish"] },
        { "@type": "ContactPoint", contactType: "editorial", email: config.business.editorialEmail, availableLanguage: ["English"] },
        { "@type": "ContactPoint", contactType: "partnerships", email: config.business.partnershipsEmail, availableLanguage: ["English"] },
      ],
      sameAs: [
        config.twitterHandle ? `https://x.com/${config.twitterHandle.replace(/^@/, "")}` : null,
      ].filter(Boolean),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Turkish destinations",
      itemListElement: cities.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${config.siteUrl}/${c.slug}/`,
        name: c.name,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Primary navigation",
      itemListElement: [
        { name: "Istanbul",     url: `${config.siteUrl}/istanbul/` },
        { name: "Cappadocia",   url: `${config.siteUrl}/cappadocia/` },
        { name: "Antalya",      url: `${config.siteUrl}/antalya/` },
        { name: "All cities",   url: `${config.siteUrl}/#all-cities` },
        { name: "Journal",      url: `${config.siteUrl}/journal/` },
        { name: "Guides",       url: `${config.siteUrl}/guides/` },
        { name: "Flights",      url: `${config.siteUrl}/flights/` },
        { name: "Planner",      url: `${config.siteUrl}/planner/` },
        { name: "Culture",      url: `${config.siteUrl}/culture/` },
        { name: "Quiz",         url: `${config.siteUrl}/quiz/` },
      ].map((it, i) => ({ "@type": "SiteNavigationElement", position: i + 1, name: it.name, url: it.url })),
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
  ${luxury.length ? `<a class="card" href="/${c.slug}/luxury/"><h3 class="card-h" style="margin:0">Luxury hotels</h3><p class="text-muted small mt-1">5-star picks in ${esc(c.name)}</p></a>` : ""}
  ${budget.length ? `<a class="card" href="/${c.slug}/budget/"><h3 class="card-h" style="margin:0">Budget hotels</h3><p class="text-muted small mt-1">Under $100 / night</p></a>` : ""}
  <a class="card" href="/${c.slug}/families/"><h3 class="card-h" style="margin:0">For families</h3><p class="text-muted small mt-1">Best areas for kids</p></a>
  <a class="card" href="/${c.slug}/couples/"><h3 class="card-h" style="margin:0">For couples</h3><p class="text-muted small mt-1">Romantic stays</p></a>
</div>`;

  const body = `
${nav()}
${disclosureBanner()}
<main id="main">
<section class="hero-immersive ${resolveHeroImage(c.slug, c.heroImage) ? "has-photo" : ""}" style="${cityPaletteStyle(c.slug)}">
  ${(() => {
    const heroSrc = resolveHeroImage(c.slug, c.heroImage);
    return heroSrc
      ? `<img class="hero-photo" src="${esc(heroSrc)}" alt="${esc(c.name)}, Turkey" loading="eager" fetchpriority="high" width="1200" height="800" decoding="async">`
      : `<div class="hero-art">${cityHeroSvg(c.slug)}</div>`;
  })()}
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
  <div class="breadcrumb small text-soft" style="padding:18px 0;border-bottom:1px solid var(--c-hairline);margin-bottom:20px"><a href="/" style="color:inherit">Turkey</a> <span style="margin:0 8px">/</span> ${esc(c.name)}</div>
  ${bylineBlock(c)}
  <div class="prose mb-4" style="max-width:720px">
    ${lastVisitedBadge(c)}
    <p style="font-size:1.05rem;margin-top:12px">${esc(c.summary)}</p>
  </div>
</div>

${climateStrip(c)}

${costPerDayWidget(c)}

<section class="container">
  <div class="toc">
    <h2 class="toc-heading">At a glance</h2>
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

${cityContextBlock(c)}

${skipCallout(c)}

<section class="container section-sm">
  <h2>Browse by style</h2>
  <p class="text-muted">Looking for something specific in ${esc(c.name)}?</p>
  ${programmaticLinks}
</section>

${leadMagnet({ citySlug: c.slug })}

<section class="container">
  <h2>All featured hotels in ${esc(c.name)}</h2>
  <div class="persona-filter" role="tablist" aria-label="Filter hotels by traveler type">
    <button class="persona-chip" data-filter="all" data-active="true" type="button">All <span class="persona-chip-count">${c.hotels.length}</span></button>
    <button class="persona-chip" data-filter="couples" type="button">Couples</button>
    <button class="persona-chip" data-filter="families" type="button">Families</button>
    <button class="persona-chip" data-filter="first-timers" type="button">First-timers</button>
    <button class="persona-chip" data-filter="luxury" type="button">Luxury</button>
    <button class="persona-chip" data-filter="budget" type="button">Budget</button>
  </div>
  ${amenityChipBar(c.hotels)}
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
${modal({ citySlug: c.slug })}
${stickyCta(c.name, c.heroSearch)}
${tail()}`;

  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: c.name, url: canonical },
    ]),
    (() => {
      const geo = CITY_GEO[c.slug];
      const td = {
        "@context": "https://schema.org",
        "@type": "TouristDestination",
        "@id": `${canonical}#place`,
        name: c.name,
        description: c.summary,
        url: canonical,
        image: resolveHeroImage(c.slug, c.heroImage) || `${config.siteUrl}/assets/img/og/${c.slug}.svg`,
        isPartOf: { "@id": `${config.siteUrl}/#website` },
        address: {
          "@type": "PostalAddress",
          addressLocality: c.name,
          addressRegion: geo ? geo.region : undefined,
          addressCountry: "TR",
        },
        containedInPlace: [
          geo ? { "@type": "AdministrativeArea", name: geo.region + ", Turkey" } : null,
          { "@type": "Country", name: "Turkey" },
        ].filter(Boolean),
        touristType: c.bestFor && c.bestFor.length ? c.bestFor : undefined,
      };
      if (geo) {
        td.geo = { "@type": "GeoCoordinates", latitude: geo.lat, longitude: geo.lng };
        // Helps Google understand the rough extent of the destination
        // (city limits roughly within 15km of centre — better than
        // pretending the geo coordinate is the only relevant point).
        td.geoCoveredBy = {
          "@type": "GeoShape",
          circle: `${geo.lat} ${geo.lng} 15000`,
        };
      }
      return td;
    })(),
  ];
  const faq = faqLd(c.faqs);
  if (faq) jsonld.push(faq);

  // Article schema with author + dateModified — strong E-E-A-T signal.
  // Required for AdSense to read the page as authored editorial content
  // rather than scaled programmatic output. dateModified pulls from
  // c.lastVerified so freshness is real, not auto-stamped today.
  jsonld.push({
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${canonical}#article`,
    headline: `Where to stay in ${c.name}`,
    description: c.summary,
    url: canonical,
    image: resolveHeroImage(c.slug, c.heroImage) || `${config.siteUrl}/assets/img/og/${c.slug}.svg`,
    author: {
      "@type": "Person",
      "@id": `${config.siteUrl}/about/${AUTHOR.slug}/#person`,
      name: AUTHOR.name,
      url: `${config.siteUrl}/about/${AUTHOR.slug}/`,
    },
    publisher: { "@id": `${config.siteUrl}/#organization` },
    datePublished: "2026-01-01",
    dateModified: cityVerified(c).match(/\d{4}-\d{2}-\d{2}/) ? cityVerified(c) : "2026-04-24",
    mainEntityOfPage: canonical,
  });

  const ogImage = c.heroImage || `${config.siteUrl}/assets/img/og/${c.slug}.svg`;
  const html = head({ title, description, canonical, ogImage, jsonld, preloadHero: resolveHeroImage(c.slug, c.heroImage) }) + body;
  writeFile(`${c.slug}/index.html`, html);
}

function renderProgrammatic({ city, variant, title, description, heading, intro, hotels, audience }) {
  const canonical = `${config.siteUrl}/${city.slug}/${variant}/`;
  // Variant-specific prose. Built from a per-city OPENER sentence (unique
  // per (city, variant) — see data/variant-copy.json) followed by a
  // COHORT body (cities grouped into 7 cohorts: istanbul, cappadocia,
  // mediterranean, aegean, eastern-anatolia, inland-anatolia, black-sea).
  // Different cohorts get genuinely different paragraphs so within-sample
  // variation is real, not just city-name swap. Override per-city via
  // city.variantCopy[variant] in data files.
  const variantCopy = (function () {
    const explicit = (city.variantCopy || {})[variant];
    if (explicit) return explicit;
    const opener = ((VARIANT_COPY.cityOpeners || {})[city.slug] || {})[variant] || "";
    const cohort = CITY_COHORT[city.slug] || "mediterranean";
    let body = ((VARIANT_COPY.cohortBody || {})[cohort] || {})[variant] || "";
    body = body.replace(/\$\{cityName\}/g, city.name);
    return [opener, body].filter(Boolean).join(" ");
  })();
  // Filter areas by variant fit; if the filter empties the list, fall
  // back to all areas so the page still has neighborhood depth.
  const filteredAreas = (city.areas || []).filter((a) => !variant || variantMatchesArea(variant, a));
  const areasToShow = (filteredAreas.length ? filteredAreas : city.areas || []).slice(0, 3);
  // Variant-relevant FAQs (city.faqs filtered to ones matching the
  // variant tag, falls back to all city faqs).
  const variantFaqs = ((city.faqs || []).filter((f) => {
    const t = (f.q + " " + f.a).toLowerCase();
    if (variant === "luxury") return /luxur|5[- ]star|splurge|honeymoon|spa/.test(t);
    if (variant === "budget") return /budget|cheap|hostel|under\s*\$/.test(t);
    if (variant === "families") return /famil|kid|child/.test(t);
    if (variant === "couples") return /coupl|romant|honeymoon/.test(t);
    return false;
  }).slice(0, 4));

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

${variantCopy ? `<section class="container container-narrow prose">
  <p>${esc(variantCopy)}</p>
</section>` : ""}

<section class="container" aria-labelledby="prog-picks-h">
  <h2 id="prog-picks-h">${esc(heading)} — our picks</h2>
  <div class="grid grid-2 grid-3">
    ${hotels.length
      ? hotels.map((h) => hotelCard(h, city)).join("")
      : `<p class="text-muted">We're still curating picks for this collection. Meanwhile, <a href="/${city.slug}/">browse all ${esc(city.name)} stays</a>.</p>`}
  </div>
</section>

${leadMagnet({ citySlug: city.slug })}

<section class="container" id="neighborhoods">
  <h2>Best neighborhoods for ${esc(heading.toLowerCase())}</h2>
  ${audience ? `<p class="text-muted">${esc(audience)}</p>` : ""}
  ${areasToShow.map((a) => areaBlock(a, city)).join("")}
</section>

${variantFaqs.length ? `<section class="container container-narrow prose">
  <h2>FAQs</h2>
  ${variantFaqs.map((f) => `<h3 style="margin-top:24px">${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}
</section>` : ""}

<section class="container section-sm">
  <h2>Explore more in ${esc(city.name)}</h2>
  <div class="grid grid-2 grid-4 mt-3">
    <a class="card" href="/${city.slug}/"><h3 class="card-h" style="margin:0">All neighborhoods</h3><p class="text-muted small mt-1">Full ${esc(city.name)} area guide</p></a>
    ${variant !== "luxury" && city.hotels.some((h) => h.tier === "luxury") ? `<a class="card" href="/${city.slug}/luxury/"><h3 class="card-h" style="margin:0">Luxury hotels</h3><p class="text-muted small mt-1">5-star picks</p></a>` : ""}
    ${variant !== "budget" && city.hotels.some((h) => h.tier === "budget") ? `<a class="card" href="/${city.slug}/budget/"><h3 class="card-h" style="margin:0">Budget hotels</h3><p class="text-muted small mt-1">Under $100</p></a>` : ""}
    ${variant !== "families" ? `<a class="card" href="/${city.slug}/families/"><h3 class="card-h" style="margin:0">For families</h3><p class="text-muted small mt-1">Best areas for kids</p></a>` : ""}
    ${variant !== "couples" ? `<a class="card" href="/${city.slug}/couples/"><h3 class="card-h" style="margin:0">For couples</h3><p class="text-muted small mt-1">Romantic stays</p></a>` : ""}
  </div>
</section>

${footer()}
${modal({ citySlug: city.slug })}
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

  const cityIntros = CITY_THEME_INTROS[c.slug] || {};

  if (luxury.length) {
    renderProgrammatic({
      city: c, variant: "luxury",
      heading: `Luxury hotels in ${c.name}`,
      title: `Luxury hotels in ${c.name} — 5-star picks for 2026`,
      description: `The genuinely special luxury and 5-star hotels in ${c.name}, with verdicts on which neighborhoods and properties earn the price.`,
      intro: cityIntros.luxury || `The handful of genuinely special 5-star stays in ${c.name}. Milestone-trip picks, not just the priciest names.`,
      hotels: luxury,
      audience: `Luxury travelers in ${c.name} usually want either a historic landmark or a modern resort on the water.`,
    });
  }

  if (budget.length) {
    renderProgrammatic({
      city: c, variant: "budget",
      heading: `Budget hotels in ${c.name} under $100`,
      title: `Budget hotels in ${c.name} — under $100 / night (2026)`,
      description: `Well-reviewed hotels in ${c.name} under $100 per night, ranked by location and value — not just price.`,
      intro: cityIntros.budget || `The best-reviewed hotels in ${c.name} under $100 — all within short reach of the sights.`,
      hotels: budget,
      audience: `In ${c.name}, budget travelers should prioritize location over everything.`,
    });
  }

  renderProgrammatic({
    city: c, variant: "families",
    heading: `Best hotels in ${c.name} for families`,
    title: `Best hotels in ${c.name} for families (with kids) — 2026`,
    description: `Family-friendly hotels in ${c.name} with pools, family rooms, and walkable locations — the verdict on which neighborhoods work for kids.`,
    intro: cityIntros.families || `Pool access, family rooms, and quiet streets — the ${c.name} hotels that deliver all three.`,
    hotels: fams.length ? fams : c.hotels.slice(0, 6),
    audience: `Look for family rooms, pools, and good transport. Skip the party-heavy neighborhoods.`,
  });

  renderProgrammatic({
    city: c, variant: "couples",
    heading: `Best hotels in ${c.name} for couples`,
    title: `Best hotels in ${c.name} for couples — romantic stays 2026`,
    description: `Romantic, adults-friendly stays in ${c.name} — anniversary and honeymoon picks ranked by privacy, view, and design.`,
    intro: cityIntros.couples || `The ${c.name} hotels we'd pick for an anniversary or a honeymoon — small, beautiful, quiet.`,
    hotels: couples.length ? couples : c.hotels.slice(0, 6),
    audience: `Couples usually prefer smaller, adults-friendly hotels over large resorts.`,
  });
}

function renderThankYou() {
  const it = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "lead-magnet-istanbul.json"), "utf8"));
  const canonical = `${config.siteUrl}/thank-you/`;
  const title = seoTitle(it.title);
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
        <h3>Notes</h3>
        <ul>${d.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
    </section>
  `).join("");

  // Affiliate upsell strip — the single biggest conversion moment on
  // the site. Filtered to TP-attributed only; non-TP partners (Airalo
  // without partnerId, GetYourGuide, SafetyWing) drop out silently.
  // Klook + Kiwitaxi + Trip.com cover the "book before you arrive"
  // intent on this page.
  const upsells = [
    { partner: "Trip.com",        tag: "Istanbul hotels — see availability",            url: bookingLink("Istanbul") },
    { partner: "Klook",           tag: "Bosphorus cruise + Hagia Sophia tickets",       url: klookLink("Istanbul Bosphorus cruise") },
    { partner: "Klook",           tag: "Cappadocia balloon add-on (book early)",        url: klookLink("Cappadocia hot air balloon") },
    { partner: "Kiwitaxi",        tag: "Istanbul airport transfer (fixed fare)",        url: kiwitaxiLink("Istanbul") },
    { partner: "Localrent",       tag: "Rental car — Turkey-focused, no deposit",       url: localrentLink("Istanbul", "thank-you-istanbul") },
    { partner: "Airalo",          tag: "Turkey eSIM — activate before boarding",        url: airaloLink() },
  ].filter((u) => !!u.url);

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
          <h3 class="card-h" style="margin:4px 0">${esc(u.tag)}</h3>
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
<link rel="canonical" href="${esc(canonical)}">
${(config.adsense && config.adsense.clientId) ? `<meta name="google-adsense-account" content="${esc(config.adsense.clientId)}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsense.clientId)}" crossorigin="anonymous"></script>` : ""}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${config.siteUrl}${config.defaultOgImage}">
<link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">
<link rel="preload" as="style" href="/assets/css/styles.css" fetchpriority="high">
<link rel="stylesheet" href="/assets/css/styles.css" fetchpriority="high">
<link rel="stylesheet" href="/assets/css/filters.css">
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
    <li>Long-running review average above 8.5 across major aggregators (Trip.com, Tripadvisor, Google reviews)</li>
    <li>Location inside the neighborhood it represents</li>
    <li>Consistency across 200+ reviews</li>
    <li>Clear best-for fit</li>
  </ul>
  <h2>How we research</h2>
  <p>Every city is visited at least annually. Different neighborhoods on different trips. Restaurants we recommend, we eat at. Public ferries, not chartered ones. We pay for our own bookings. No PR-funded trips. No paid placements. Read our full <a href="/editorial-standards/">editorial standards</a> for the methodology.</p>
  <h2 id="affiliate">Affiliate disclosure</h2>
  <p>We partner with Trip.com (hotels and flights), Localrent (car rental), GetYourGuide and Klook (tours and tickets), Welcome Pickups and Kiwitaxi (airport transfers), and Airalo (eSIM) — all through Travelpayouts. Booking through our links earns us a commission at no extra cost to you.</p>
  <h2 id="photo-credits">Photo credits</h2>
  <p>City hero photography from <a rel="noopener" href="https://commons.wikimedia.org/">Wikimedia Commons</a> contributors, used under their respective Creative Commons or Public Domain licenses:</p>
  <ul>
    ${cities.filter((c) => c.heroImageCredit).map((c) => `<li><a href="/${esc(c.slug)}/">${esc(c.name)}</a> — ${esc(c.heroImageCredit)}</li>`).join("")}
  </ul>
  <h2 id="contact">Contact</h2>
  <p>Spotted a mistake? Reply to any email we send.</p>
</section>
${leadMagnet()}
${footer()}
${tail()}`;
  const html = head({ title, description, canonical }) + body;
  writeFile("about/index.html", html);
}

// Editorial standards / methodology page — supports E-E-A-T (Experience,
// Expertise, Authoritativeness, Trust). Google increasingly looks for an
// explicit "how this site works" page on YMYL-adjacent travel content.
function renderEditorialStandards() {
  const canonical = `${config.siteUrl}/editorial-standards/`;
  const title = "Editorial standards — how we research and pick";
  const description = "How Where to Stay Turkey researches cities, picks hotels, fact-checks pricing, handles affiliate disclosure, and corrects mistakes. The full methodology.";
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / <a href="/about/">About</a> / Editorial standards</div>
    <h1>Editorial standards</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">How we research, what we pick, what we don't pick, and what to do when we get it wrong.</p>
  </div>
</div>

<section class="container container-narrow prose">

<h2>What we publish</h2>
<p>Three kinds of content: <strong>neighborhood guides</strong> (which area of a city to stay in for which kind of trip), <strong>hotel picks</strong> (a small shortlist per area, vetted on the same criteria across all 22 cities), and <strong>journal articles</strong> (longer reads on Turkey-specific subjects). Every piece has a single accountable byline; freelance contributions are vetted before publication and credited explicitly.</p>

<h2>How we pick hotels</h2>
<p>A hotel ships in our shortlist only if it meets all four:</p>
<ul>
  <li><strong>Review average ≥ 8.5 across 200+ reviews</strong> on Trip.com / Tripadvisor / Google, sustained across at least the last 12 months. Recent dips matter more than the lifetime number.</li>
  <li><strong>Located inside the neighborhood it represents,</strong> not "10 minutes by taxi from" it. We've walked there.</li>
  <li><strong>Consistent best-for fit</strong> — a "couples" pick can't have a karaoke pool deck; a "families" pick can't have a 9pm cocktail-only restriction.</li>
  <li><strong>Editorial visit within the past 24 months,</strong> either by us or by a trusted contributor we know personally. We mark older verifications "last verified" with the date.</li>
</ul>
<p>What rejects a hotel: persistent complaints about cleanliness, sustained "value" issues (overpriced for the actual room), missing accessibility info on a property that markets to it, or anything our visit found that contradicts marketing claims.</p>

<h2>Where pricing comes from</h2>
<p>Listed prices are the <em>typical lowest standard double room rate</em> in the property's main season, sourced from Trip.com's published rates and our own search history across the year. Prices change daily; ours are quarterly snapshots, refreshed every March and September. We don't claim live pricing on this site — every "Check availability" link goes to the partner's live booking page where you'll see the exact current rate.</p>

<h2>Where neighborhood claims come from</h2>
<p>Three sources, ranked: (1) <strong>residing in the area</strong> — for Istanbul we have a year-round contributor in Cihangir; for Cappadocia we visit annually for at least a week, off-season; (2) <strong>repeated visits over multiple years</strong> for Antalya, Bodrum, Fethiye, Izmir; (3) <strong>a single multi-day visit + verified local sources</strong> for the smaller cities. We mark which tier applies on each city page.</p>

<h2>How we fact-check</h2>
<ul>
  <li><strong>Public-transport claims</strong> are checked against the official operator (Istanbul Metro, IETT, Antalya AntRay, etc.) the week before publication.</li>
  <li><strong>Visa, safety, and customs information</strong> is sourced from the relevant government's published guidance and reviewed quarterly. Our visa page links the official evisa.gov.tr — never go through us for legal facts.</li>
  <li><strong>Currency claims</strong> use exchange rates labelled with a fixed snapshot date. Anything older than 90 days gets flagged for refresh.</li>
  <li><strong>Restaurant and shop recommendations</strong> are verified open and operating within the past 12 months. Closed listings are removed within 7 days of being reported.</li>
</ul>

<h2>Affiliate disclosure</h2>
<p>Every commercial link on this site is an affiliate link, marked with <code>rel="sponsored nofollow"</code>. We earn a commission from successful bookings through Trip.com, Localrent, GetYourGuide, and a handful of others — all routed through Travelpayouts. <strong>The commission does not change what we recommend.</strong> Our hotel picks predate any affiliate relationship — every property in our shortlist would be there even if every partner paid us nothing. Read the full <a href="/about/#affiliate">affiliate disclosure</a>.</p>

<h2>What we don't accept</h2>
<ul>
  <li><strong>PR-funded trips, comped stays, or media-rate discounts.</strong> Editorial visits are paid in full at our published rates so there's no implicit obligation.</li>
  <li><strong>Guaranteed inclusion.</strong> A property cannot pay to be added to a shortlist. We will never run a "sponsored hotel pick" without disclosing it as advertorial — and we don't currently take advertorial.</li>
  <li><strong>Pre-written copy from the property.</strong> Hotel staff and PRs occasionally send us blurbs. We rewrite from scratch using our own visit notes.</li>
</ul>

<h2>How we handle mistakes</h2>
<p>If we get it wrong — a closed restaurant still listed, a price that's drifted, a policy that changed, an opening that's actually still under construction — please tell us. <a href="mailto:${esc(config.business.contactEmail)}">${esc(config.business.contactEmail)}</a> goes to the editor. We aim to respond within 48 hours and correct within 7 days. Material corrections are noted on the page with the date the change went live.</p>

<h2>AI use</h2>
<p>We use AI tools for spell-checking, line-editing, and exploring prose alternatives. <strong>We do not use AI to generate hotel picks, neighborhood claims, or factual content.</strong> Every recommendation has a human in the loop with a name on it. Every block of bodyHtml is read end-to-end by an editor before publication. We will never run hallucinated hotel names, made-up reviews, or AI-generated photography of places that don't exist.</p>

<h2>Updates</h2>
<p>City pages are reviewed once a year minimum and the "last verified" date on each page reflects the most recent walk-through. Hotel shortlists are reviewed every six months. Visa and currency information is reviewed quarterly. Editorial articles are evergreen unless time-sensitive, in which case they carry a "last updated" timestamp at the top.</p>

<h2>Contact</h2>
<p>Editorial: <a href="mailto:${esc(config.business.editorialEmail)}">${esc(config.business.editorialEmail)}</a>. General: <a href="mailto:${esc(config.business.contactEmail)}">${esc(config.business.contactEmail)}</a>.${config.business.postalAddress ? ` Postal mail: ${esc(config.business.postalAddress)}.` : ""}</p>

</section>

${leadMagnet()}
${footer()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "About", url: `${config.siteUrl}/about/` },
      { name: "Editorial standards", url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      "@id": canonical,
      name: title,
      description,
      url: canonical,
      isPartOf: { "@id": `${config.siteUrl}/#website` },
      publisher: { "@id": `${config.siteUrl}/#organization` },
      inLanguage: "en",
    },
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("editorial-standards/index.html", html);
}

function renderSitemap() {
  // Priority + changefreq policy:
  //   1.0  homepage
  //   0.9  city hubs (highest commercial intent)
  //   0.8  cross-city collections, top-level guides (visa, safety, transport, when-to-visit)
  //   0.7  programmatic city pages (luxury/budget/families/couples), tours, day-trips,
  //        best-of collections, experiences hub, regions hub, turkey-by-month,
  //        culture concepts, journal posts
  //   0.6  per-month pages, per-experience pages, per-region pages
  //   0.4  about, planner, compare, quiz, partnerships
  //   0.2  privacy, terms, contact
  // changefreq:
  //   daily   homepage (only thing actually updated daily)
  //   weekly  city hubs, journal hub, guides hub
  //   monthly evergreen guides, programmatic, collections, journal posts
  //   yearly  legal (privacy, terms)
  const today = new Date().toISOString().split("T")[0];
  const entries = [];
  const push = (url, priority, changefreq, lastmod = today, image = null) =>
    entries.push({ url, priority, changefreq, lastmod, image });

  // The OG fallback used when a page has no specific image — surfaced for
  // image-sitemap purposes so Google still indexes one image per URL.
  const fallbackImage = `${config.siteUrl}${config.defaultOgImage}`;

  push(`${config.siteUrl}/`, "1.0", "daily", today, fallbackImage);

  // High-intent commercial: city hubs (image = absolute URL of either local
  // hero photo, configured heroImage URL, or per-city OG SVG fallback)
  for (const c of cities) {
    const localHero = resolveHeroImage(c.slug, c.heroImage);
    const cityImage = localHero
      ? (localHero.startsWith("http") ? localHero : `${config.siteUrl}${localHero}`)
      : `${config.siteUrl}/assets/img/og/${c.slug}.svg`;
    push(`${config.siteUrl}/${c.slug}/`, "0.9", "weekly", today, cityImage);
    push(`${config.siteUrl}/${c.slug}/tours/`, "0.7", "monthly", today, cityImage);
    push(`${config.siteUrl}/${c.slug}/families/`, "0.7", "monthly", today, cityImage);
    push(`${config.siteUrl}/${c.slug}/couples/`, "0.7", "monthly", today, cityImage);
    if (c.hotels.some((h) => h.tier === "luxury")) push(`${config.siteUrl}/${c.slug}/luxury/`, "0.7", "monthly", today, cityImage);
    if (c.hotels.some((h) => h.tier === "budget")) push(`${config.siteUrl}/${c.slug}/budget/`, "0.7", "monthly", today, cityImage);
  }

  // Top-level collection / cross-city pages
  push(`${config.siteUrl}/turkey-luxury/`, "0.8", "monthly");
  push(`${config.siteUrl}/turkey-families/`, "0.8", "monthly");
  push(`${config.siteUrl}/turkey-couples/`, "0.8", "monthly");
  push(`${config.siteUrl}/turkey-off-beaten-path/`, "0.8", "monthly");

  // Top-level guides (planning intent, evergreen)
  push(`${config.siteUrl}/visa/`,                       "0.8", "monthly");
  push(`${config.siteUrl}/is-turkey-safe/`,             "0.8", "monthly");
  push(`${config.siteUrl}/istanbul-to-cappadocia/`,     "0.8", "monthly");
  push(`${config.siteUrl}/best-time-to-visit-turkey/`,  "0.8", "monthly");
  push(`${config.siteUrl}/how-many-nights-turkey/`,     "0.8", "monthly");
  push(`${config.siteUrl}/turkey-guide/`,               "0.8", "monthly");
  push(`${config.siteUrl}/insurance/`,                  "0.7", "monthly");
  push(`${config.siteUrl}/esim/`,                       "0.7", "monthly");
  push(`${config.siteUrl}/money/`,                      "0.7", "monthly");
  push(`${config.siteUrl}/packing/`,                    "0.7", "monthly");
  push(`${config.siteUrl}/arrival-istanbul/`,           "0.7", "monthly");
  push(`${config.siteUrl}/turkish-phrases/`,            "0.7", "monthly");

  // Hubs
  push(`${config.siteUrl}/guides/`,           "0.7", "weekly");
  push(`${config.siteUrl}/journal/`,          "0.7", "weekly");
  push(`${config.siteUrl}/flights/`,          "0.7", "weekly");
  push(`${config.siteUrl}/best-of-turkey/`,   "0.7", "weekly");
  push(`${config.siteUrl}/turkey-by-month/`,  "0.7", "weekly");
  push(`${config.siteUrl}/culture/`,          "0.7", "weekly");
  push(`${config.siteUrl}/experiences/`,      "0.7", "weekly");
  push(`${config.siteUrl}/regions/`,          "0.7", "weekly");

  // Aggregate / interactive
  push(`${config.siteUrl}/planner/`, "0.4", "monthly");
  push(`${config.siteUrl}/compare/`, "0.4", "monthly");
  push(`${config.siteUrl}/quiz/`,    "0.4", "monthly");
  push(`${config.siteUrl}/search/`,  "0.4", "monthly");

  // Operational
  push(`${config.siteUrl}/about/`,                   "0.4", "monthly");
  push(`${config.siteUrl}/about/${AUTHOR.slug}/`,    "0.3", "yearly");
  push(`${config.siteUrl}/editorial-standards/`,     "0.5", "yearly");
  push(`${config.siteUrl}/partnerships/`,            "0.4", "monthly");
  push(`${config.siteUrl}/contact/`,                 "0.2", "yearly");
  push(`${config.siteUrl}/privacy/`,                 "0.2", "yearly");
  push(`${config.siteUrl}/terms/`,                   "0.2", "yearly");

  // Programmatic content
  for (const _cc of CULTURAL_CONCEPTS) push(`${config.siteUrl}/culture/${_cc.slug}/`,           "0.7", "monthly");
  for (const _m of MONTHS)              push(`${config.siteUrl}/turkey-by-month/${_m.slug}/`,    "0.6", "monthly");
  for (const _col of COLLECTIONS)       push(`${config.siteUrl}/best-of-turkey/${_col.slug}/`,   "0.7", "monthly");
  for (const _e of EXPERIENCES)         push(`${config.siteUrl}/experiences/${_e.slug}/`,        "0.6", "monthly");
  for (const _r of REGIONS)             push(`${config.siteUrl}/regions/${_r.slug}/`,            "0.6", "monthly");
  for (const _slug of Object.keys(DAY_TRIPS)) push(`${config.siteUrl}/${_slug}/day-trips/`,       "0.7", "monthly");

  // Journal posts use their actual publish date as lastmod when available
  for (const p of JOURNAL) {
    const lastmod = p.publishedAt ? p.publishedAt.split("T")[0] : today;
    push(`${config.siteUrl}/journal/${p.slug}/`, "0.7", "monthly", lastmod);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map((e) => `<url><loc>${e.url}</loc><lastmod>${e.lastmod}</lastmod><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority>${e.image ? `<image:image><image:loc>${esc(e.image)}</image:loc></image:image>` : ""}</url>`).join("\n")}
</urlset>`;
  writeFile("sitemap.xml", body);
}

function renderRobots() {
  // robots.txt — allow everything. Conversion-confirmation pages
  // (/thank-you/, /thank-you-combo/) are excluded from search results
  // via <meta name="robots" content="noindex"> on those pages, which is
  // Google's recommended mechanism. We deliberately do NOT Disallow them
  // here: blocking crawl prevents Google from seeing the noindex meta,
  // and a discovered-via-internal-link URL can still appear in results
  // without a snippet. Letting Google crawl + noindex is the cleanest
  // path. The IndexNow line is purely informational.
  const lines = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
  ];
  if (config.indexnowKey) lines.push(`# IndexNow key: ${config.siteUrl}/${config.indexnowKey}.txt`);
  writeFile("robots.txt", lines.join("\n") + "\n");
}

// IndexNow ownership-verification key file. IndexNow is the cross-engine
// submission protocol (Bing, Yandex, Seznam, Naver). Verifying ownership
// requires serving https://yoursite.com/{key}.txt with just the key as
// the body. After deploy, run scripts/indexnow-ping.js to notify engines
// about updated URLs.
function renderIndexNowKey() {
  const key = config.indexnowKey;
  if (!key || !/^[a-f0-9]{8,128}$/.test(key)) return;
  writeFile(`${key}.txt`, key);
}

// AdSense ads.txt. Format: domain, publisher-id, relationship, TAG-ID.
// IMPORTANT: ads.txt expects the bare `pub-XXXXXXXXXXXXXXXX` form, NOT
// the `ca-pub-XXXXXXXXXXXXXXXX` form used in the JS loader's data-ad-
// client attribute. AdSense flags ads.txt as "unauthorized" if the
// `ca-` prefix slips in (the original cause of the error here). We
// strip it so config.adsense.clientId can stay in either form. The
// TAG-ID f08c47fec0942fa0 is Google's universal publisher identifier
// and is the same for every AdSense account.
function renderAdsTxt() {
  if (!config.adsense || !config.adsense.clientId) return;
  const pubId = config.adsense.clientId.replace(/^ca-/, "");
  writeFile("ads.txt", `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`);
}

function render404() {
  // Pick the 6 highest-priority destinations to surface (matches sitemap priority).
  const topCities = ["istanbul", "cappadocia", "antalya", "bodrum", "fethiye", "izmir"]
    .map((s) => cities.find((c) => c.slug === s))
    .filter(Boolean);
  const popularGuides = [
    { url: "/turkey-guide/",                title: "The full Turkey guide",          desc: "Where to stay across 22 cities" },
    { url: "/best-time-to-visit-turkey/",   title: "Best time to visit Turkey",      desc: "Month-by-month breakdown" },
    { url: "/how-many-nights-turkey/",      title: "How many nights do you need?",   desc: "Real itineraries by length" },
    { url: "/quiz/",                        title: "Take the 60-second quiz",        desc: "Find your ideal Turkish city" },
    { url: "/visa/",                        title: "Turkey visa & eVisa",            desc: "Who needs one, who doesn't" },
    { url: "/journal/",                     title: "Journal — long reads",           desc: "Tested itineraries and deep-dives" },
  ];
  const body = `${nav()}
${disclosureBanner()}
<section class="hero-home" style="min-height:40vh;display:flex;align-items:center">
  <div class="container" style="text-align:center">
    <div class="eyebrow">Error 404</div>
    <h1>We can't find that page.</h1>
    <p class="hero-sub" style="margin:0 auto 28px;max-width:560px">It may have been moved or the URL is mistyped. Try one of these instead — or use the navigation above.</p>
    <div class="hero-actions" style="justify-content:center">
      <a class="btn btn-primary btn-lg" href="/">Homepage</a>
      <a class="btn btn-ghost btn-lg" href="/quiz/">Take the 60-second quiz</a>
    </div>
  </div>
</section>

<section class="container section-sm">
  <h2 style="font-size:1.4rem">Popular cities</h2>
  <div class="grid grid-2 grid-3 mt-3">
    ${topCities.map((c) => `<a class="card" href="/${esc(c.slug)}/" style="text-decoration:none;color:inherit">
      <div style="font-size:24px;margin-bottom:4px">${esc(c.emoji || "")}</div>
      <h3 style="font-size:1.1rem;margin:0 0 4px;font-family:var(--font-serif);font-weight:500">${esc(c.name)}</h3>
      <p class="text-muted small" style="margin:0">${esc(c.tagline || "")}</p>
    </a>`).join("")}
  </div>
</section>

<section class="container section-sm">
  <h2 style="font-size:1.4rem">Or start with a planning guide</h2>
  <div class="grid grid-2 grid-3 mt-3">
    ${popularGuides.map((g) => `<a class="card" href="${esc(g.url)}" style="text-decoration:none;color:inherit">
      <h3 style="font-size:1rem;margin:0 0 4px;font-family:var(--font-serif);font-weight:500">${esc(g.title)}</h3>
      <p class="text-muted small" style="margin:0">${esc(g.desc)}</p>
    </a>`).join("")}
  </div>
</section>

${footer()}
${tail()}`;
  // Tell crawlers not to index the 404 itself even though it returns 200 on
  // many static hosts. Vercel serves it with a 404 status — defensive nonetheless.
  const html = head({ title: `Page not found — ${config.siteName}`, description: `404 — page not found.`, canonical: `${config.siteUrl}/404.html` })
    .replace("</head>", `<meta name="robots" content="noindex">\n</head>`)
    + body;
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
      { src: "/assets/img/apple-touch-icon.svg", sizes: "180x180", type: "image/svg+xml" },
    ],
  };
  writeFile("site.webmanifest", JSON.stringify(manifest, null, 2));
}

function writeAppleTouchIcon() {
  // SVG home-screen icon. iOS 15+ accepts SVG when no PNG is provided. The
  // operator can drop a real 180x180 PNG at this path and update build.js
  // refs to switch back to PNG when ready.
  writeFile("assets/img/apple-touch-icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="#E11D48"/><text x="90" y="118" text-anchor="middle" font-family="Arial, sans-serif" font-size="100" font-weight="800" fill="#fff">T</text></svg>`);
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
<section class="container" aria-labelledby="cross-coll-h">
  <h2 id="cross-coll-h" class="visually-hidden">${esc(heading)} — hotel picks</h2>
  <p class="text-muted">${matches.length} picks across ${new Set(matches.map((m) => m.c.slug)).size} cities.</p>
  <div class="grid grid-2 grid-3 mt-3">
    ${matches.map((m) => hotelCard(m.h, m.c)).join("")}
  </div>
</section>
${essentialsBlock()}
<section class="container section-sm">
  <h2>Or explore by destination</h2>
  <div class="grid grid-2 grid-3 grid-4 mt-3">
    ${cities.slice(0, 8).map((c) => `<a class="card" href="/${c.slug}/"><h3 class="card-h" style="margin:0">${esc(c.name)}</h3><p class="text-muted small mt-1">${esc(c.tagline)}</p></a>`).join("")}
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
  // Reuse the per-collection OG generator for cross-collections (turkey-luxury,
  // turkey-couples, etc.) by writing a synthesized SVG keyed on the slug.
  const ogImage = `${config.siteUrl}/assets/img/og/cross/${slug}.svg`;
  const html = head({ title, description, canonical, jsonld, ogImage }) + body;
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
  const title = seoTitle(it.title);
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
        <h3>Notes</h3>
        <ul>${d.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
    </section>
  `).join("");

  // Filtered to TP-attributed partners only (operator policy). Non-TP
  // helpers return null and drop out via .filter below.
  const upsells = [
    { partner: "Trip.com",        tag: `${heroUpsellQueries.city} hotels`,                        url: bookingLink(heroUpsellQueries.city || "Istanbul") },
    { partner: "Klook",           tag: heroUpsellQueries.tour || "Top-rated tours",               url: klookLink(heroUpsellQueries.tourQuery || "Istanbul tours") },
    { partner: "Klook",           tag: "Cappadocia balloon (book early)",                         url: klookLink("Cappadocia hot air balloon") },
    { partner: "Kiwitaxi",        tag: "Airport transfer (fixed fare)",                           url: kiwitaxiLink(heroUpsellQueries.city || "Istanbul") },
    { partner: "Localrent",       tag: "Rental car — Turkey-focused",                             url: localrentLink(heroUpsellQueries.city || "Istanbul", `lm-${slug(heroUpsellQueries.city || "Istanbul")}`) },
    { partner: "Airalo",          tag: "Turkey eSIM — activate before boarding",                  url: airaloLink() },
  ].filter((u) => !!u.url);

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
    <h2 class="lead-magnet-h" style="margin-top:4px">These three sell out and get expensive at the door</h2>
    <div class="grid grid-2 grid-3 mt-3">
      ${upsells.slice(0, 3).map((u) => `
        <a class="card" rel="sponsored nofollow" target="_blank" href="${esc(u.url)}" style="text-decoration:none;color:inherit">
          <div class="eyebrow" style="color:var(--c-text-soft)">${esc(u.partner)}</div>
          <h3 class="card-h" style="margin:4px 0">${esc(u.tag)}</h3>
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

${leadAndEssentials()}
${footer()}
${tail()}`;

  const customHead = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="noindex, follow">
${(config.adsense && config.adsense.clientId) ? `<meta name="google-adsense-account" content="${esc(config.adsense.clientId)}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsense.clientId)}" crossorigin="anonymous"></script>` : ""}
<link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&display=swap"></noscript>
<style>
/* Block-level FOIT fallback so headings don't shift when Fraunces swaps in.
   size-adjust + ascent-override align fallback metrics to Fraunces so the
   FOUT is invisible; matches CWV-CLS=0 target. */
@font-face{font-family:"Fraunces Fallback";src:local("Georgia");size-adjust:108%;ascent-override:88%;descent-override:22%;line-gap-override:0%}
:root{--font-serif:"Fraunces","Fraunces Fallback",Georgia,"Times New Roman",serif}
/* Reserve viewport space for the cookie banner so it can't shift content
   when it appears post-hydration. Hidden by default; main.js shows it. */
.cookie-banner{contain:layout style}
/* content-visibility hint: lets the browser skip rendering work for
   below-fold sections until they're near the viewport. Massive perf win
   on long pages (city pages, journal posts, regions). */
section.section-sm,section.container.section-sm,article + section.container,#also-consider,.dest-empty{content-visibility:auto;contain-intrinsic-size:auto 600px}
</style>
<link rel="preload" as="style" href="/assets/css/styles.css" fetchpriority="high">
<link rel="stylesheet" href="/assets/css/styles.css" fetchpriority="high">
<link rel="stylesheet" href="/assets/css/filters.css">
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
  const skipLineExamples = (function () {
    if (c.name === "Istanbul") return "Hagia Sophia, Topkapı, Basilica Cistern";
    if (c.name === "Cappadocia") return "balloon flight is the obvious one";
    if (c.name === "Antalya") return "Aspendos and Side Roman ruins";
    return "main museum and citadel";
  })();

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

<section class="container" aria-labelledby="tours-h">
  <h2 id="tours-h" class="visually-hidden">Tour categories in ${esc(c.name)}</h2>
  ${buckets.map((b) => {
    // Each helper returns null when its program isn't TP-attributed.
    // Filter the list so we never emit href="null" cards.
    const cards = [
      { partner: "Klook",        url: klookLink(b.query),       label: "Browse on Klook →" },
      { partner: "GetYourGuide", url: getYourGuideLink(b.query),label: "Browse on GetYourGuide →" },
      { partner: "Viator",       url: viatorLink(b.query),      label: "Browse on Viator →" },
      { partner: "Tiqets",       url: tiqetsLink(b.query),      label: "Attraction tickets →" },
    ].filter((x) => !!x.url);
    if (!cards.length) return "";
    return `
      <div class="card mt-3" style="padding:24px">
        <div class="eyebrow" style="color:var(--c-text-soft)">${esc(b.hint)}</div>
        <h3 style="margin:4px 0 12px">${esc(b.heading)}</h3>
        <div class="grid grid-2 grid-4">
          ${cards.map((x) => `<a class="card" rel="sponsored nofollow" target="_blank" href="${esc(x.url)}" style="text-decoration:none;color:inherit"><div class="eyebrow">${esc(x.partner)}</div><h3 class="card-h" style="margin:4px 0">${esc(x.label)}</h3></a>`).join("")}
        </div>
      </div>
    `;
  }).join("")}
</section>

${transferBlock(c)}

${(function () {
  // Tour-page editorial prose. Per-city opener + cohort-specific body
  // so 22 city tour pages don't read as templated. Falls back to a
  // generic 2-paragraph block when the data is missing for a city.
  const opener = (TOUR_COPY.cityOpeners || {})[c.slug] || "";
  const cohort = CITY_COHORT[c.slug] || "mediterranean";
  const body = (TOUR_COPY.cohortBody || {})[cohort] || "";
  const lead = [opener, body].filter(Boolean).join(" ");
  return `<section class="container container-narrow prose mt-4">
  <h2>How tours actually work in ${esc(c.name)}</h2>
  <p>${esc(lead)}</p>
  <p>Two practical rules apply across the country: <strong>book skip-the-line tickets ahead</strong> for every major fixed-time-slot sight (the ${esc(skipLineExamples)} fill up by 11am in season), and <strong>do at least one half-day private tour</strong> if your trip is longer than 3 days. The marginal cost over a group tour is small (~30%); the experience difference is large.</p>

  <h2>What we recommend skipping in ${esc(c.name)}</h2>
  <p>Generic "city highlights" bus tours that cover six sights in five hours mostly waste your time on commute and queue. Pick three sights and book skip-the-line tickets for each — you'll see more in less time. "Turkish night" dinner shows are entertainment-grade re-enactments — fine if that's the trip you want, but they don't add anything cultural that a proper restaurant evening + a sema ceremony don't already give you. Boat tours that promise "private" but pack 30 people on board are the most-reported tour-disappointment in ${esc(c.name)} reviews — read the capacity fine print before paying premium prices.</p>

  <h2>Frequently asked</h2>
  <h3>Should I book before I arrive in ${esc(c.name)}?</h3>
  <p>For peak season (June–September) and the marquee tours, yes — at least a week ahead, two for balloon flights or named day-cruise charters. Off-season, day-of often works for general tours. Skip-the-line tickets to fixed-time-slot sights are always worth pre-booking; the price is the same as walking up.</p>
  <h3>Are the aggregator platforms (Klook, GetYourGuide) marking up the price?</h3>
  <p>Marginally if at all — they take a commission from operators rather than the customer, so the ticket price is generally the same as booking direct. The benefit is review density, cancellation policy, and multi-language support. The cost is occasional same-tour-different-name redundancy in the listings.</p>
  <h3>Do I need to tip tour guides in ${esc(c.name)}?</h3>
  <p>Yes — 50–100 TL per person on a group tour, more for a private tour or specialist guide. Cash, given at the end. Drivers are usually included in the guide tip; restaurants are separate. Hotel concierges expect 30–50 TL for any tour they book on your behalf.</p>
</section>`;
})()}

<section class="container section-sm">
  <h2>Stay near the tours</h2>
  <div class="grid grid-2 grid-3 mt-3">
    ${c.hotels.slice(0, 6).map((h) => hotelCard(h, c)).join("")}
  </div>
  <div class="mt-3"><a class="btn btn-ghost" href="/${c.slug}/">See all ${esc(c.name)} hotels →</a></div>
</section>

${leadAndEssentials({ citySlug: c.slug })}
${footer()}
${modal({ citySlug: c.slug })}
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
      <h3 style="margin:6px 0">Final price you'll pay</h3>
      <p style="color:var(--c-text-soft);font-size:.95rem">Trip.com shows the all-in price including taxes and bag fees — no surprise add-ons at checkout.</p>
    </div>
    <div class="card" style="padding:24px">
      <div class="eyebrow">Real options</div>
      <h3 style="margin:6px 0">Every major carrier</h3>
      <p style="color:var(--c-text-soft);font-size:.95rem">Turkish Airlines, Pegasus, Lufthansa, BA, Emirates, Qatar — compared side-by-side, not just the OTA's preferred airline.</p>
    </div>
    <div class="card" style="padding:24px">
      <div class="eyebrow">Mistake fares</div>
      <h3 style="margin:6px 0">Same-day price drops</h3>
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
// Site-wide search. Builds a JSON index of every searchable entity at
// build time (cities, journal posts, collections, regions, experiences,
// cultural concepts, top-level guides) then ships an inline IIFE that
// filters the index on the client. Powers the `?q=` deep links from the
// homepage WebSite SearchAction schema and the nav search button. No
// fancy fuzzy matching — substring + word-prefix on title/description/
// tags, scored by where the match lands.
function renderSearchPage() {
  const canonical = `${config.siteUrl}/search/`;
  const title = "Search wheretostayturkey.com";
  const description = "Search 22 cities, 30+ journal articles, 6 collections, 5 regions, and the full guides library — all of Turkey, one search box.";

  const index = [];
  for (const c of cities) {
    index.push({
      kind: "City", url: `/${c.slug}/`, title: c.name, description: c.tagline || c.summary || "",
      tags: ["city", c.slug, ...(c.areas || []).map((a) => a.slug)],
    });
  }
  for (const p of JOURNAL) {
    index.push({
      kind: "Journal", url: `/journal/${p.slug}/`, title: p.title, description: p.subtitle || p.summary || "",
      tags: ["journal", ...(p.tags || [])],
    });
  }
  for (const col of COLLECTIONS) {
    index.push({
      kind: "Collection", url: `/best-of-turkey/${col.slug}/`, title: col.title, description: col.subtitle || col.intro || "",
      tags: ["collection", col.slug],
    });
  }
  for (const r of REGIONS) {
    index.push({
      kind: "Region", url: `/regions/${r.slug}/`, title: r.name, description: r.tagline || r.summary || "",
      tags: ["region", r.slug, ...(r.cities || [])],
    });
  }
  for (const e of EXPERIENCES) {
    index.push({
      kind: "Experience", url: `/experiences/${e.slug}/`, title: e.title, description: e.subtitle || "",
      tags: ["experience", e.slug],
    });
  }
  for (const cc of CULTURAL_CONCEPTS) {
    index.push({
      kind: "Culture", url: `/culture/${cc.slug}/`, title: cc.title, description: cc.subtitle || "",
      tags: ["culture", cc.slug],
    });
  }
  for (const m of MONTHS) {
    index.push({
      kind: "Month", url: `/turkey-by-month/${m.slug}/`, title: `Turkey in ${m.monthName}`, description: m.subtitle || "",
      tags: ["month", m.slug, m.monthName.toLowerCase()],
    });
  }
  // Top-level evergreen guides
  const TOP_GUIDES = [
    { url: "/visa/",                       title: "Turkey visa guide",            desc: "Who needs an e-Visa, how to apply, what to bring." },
    { url: "/is-turkey-safe/",             title: "Is Turkey safe?",              desc: "Honest safety guide for travelers — what's actually risky vs media noise." },
    { url: "/best-time-to-visit-turkey/",  title: "Best time to visit Turkey",    desc: "Month-by-month breakdown by weather, crowds, and price." },
    { url: "/how-many-nights-turkey/",     title: "How many nights in Turkey?",   desc: "From 3 to 21 nights — exact city mixes per length." },
    { url: "/turkey-guide/",               title: "The ultimate Turkey guide",    desc: "Every region, every city, every essential — one page." },
    { url: "/istanbul-to-cappadocia/",     title: "Istanbul to Cappadocia",       desc: "Flight, bus, drive: time, cost, and which to pick." },
    { url: "/insurance/",                  title: "Travel insurance for Turkey",  desc: "What's worth paying for, what to skip, real cost ranges." },
    { url: "/esim/",                       title: "Best Turkey eSIM",             desc: "Airalo vs Holafly vs local SIM — compared." },
    { url: "/money/",                      title: "Money in Turkey",              desc: "Lira, ATMs, tipping, exchange rates." },
    { url: "/packing/",                    title: "What to pack for Turkey",      desc: "Season-by-season list, mosque dress code, the weird-but-essentials." },
    { url: "/arrival-istanbul/",           title: "Landing at Istanbul Airport",  desc: "First 4 hours sorted — transfer, SIM, lira, dinner." },
    { url: "/turkish-phrases/",            title: "Turkish phrases for travelers",desc: "14 phrases that change every interaction." },
    { url: "/quiz/",                       title: "Which Turkish city quiz",      desc: "60 seconds, 4 questions, one answer." },
    { url: "/planner/",                    title: "Trip cost calculator",         desc: "Realistic budget in 20 seconds." },
    { url: "/compare/",                    title: "Compare Turkish cities",       desc: "Side-by-side comparison of any two destinations." },
  ];
  for (const g of TOP_GUIDES) {
    index.push({ kind: "Guide", url: g.url, title: g.title, description: g.desc, tags: ["guide"] });
  }

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Search</div>
    <h1>Search</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">${index.length} pages indexed — cities, journal articles, themed collections, regions, experiences, cultural concepts, monthly guides, and the planning library.</p>
  </div>
</div>

<section class="container container-narrow">
  <form class="search-form no-prerender" role="search" aria-label="Site search" onsubmit="return false">
    <label for="search-q" class="visually-hidden">Search the site</label>
    <input type="search" id="search-q" name="q" placeholder="Try 'cappadocia balloon' or 'istanbul couples'" autocomplete="off" autofocus>
  </form>

  <div class="search-meta text-muted small mt-3" id="search-meta" aria-live="polite"></div>

  <ul class="search-results" id="search-results" role="list"></ul>

  <div class="search-empty" id="search-empty" hidden>
    <p>No matches. Try a shorter query, or browse:</p>
    <ul>
      <li><a href="/#all-cities">All 22 cities</a></li>
      <li><a href="/journal/">Journal index</a></li>
      <li><a href="/best-of-turkey/">Themed hotel collections</a></li>
      <li><a href="/quiz/">Take the 60-second quiz</a></li>
    </ul>
  </div>
</section>

${leadAndEssentials()}
${footer()}
${tail()}

<script>
(function () {
  var INDEX = ${JSON.stringify(index)};
  var input = document.getElementById("search-q");
  var resultsEl = document.getElementById("search-results");
  var metaEl = document.getElementById("search-meta");
  var emptyEl = document.getElementById("search-empty");
  if (!input || !resultsEl) return;

  function score(item, query) {
    var q = query.toLowerCase();
    var t = (item.title || "").toLowerCase();
    var d = (item.description || "").toLowerCase();
    var tags = (item.tags || []).map(function (x) { return String(x).toLowerCase(); });
    var s = 0;
    if (t === q) s += 100;
    if (t.indexOf(q) === 0) s += 60;
    if (t.indexOf(q) > -1) s += 30;
    if (tags.indexOf(q) > -1) s += 25;
    if (tags.some(function (x) { return x.indexOf(q) === 0; })) s += 12;
    if (d.indexOf(q) > -1) s += 8;
    // word-prefix matches across multi-word query
    var words = q.split(/\\s+/).filter(Boolean);
    var matchedWords = words.filter(function (w) { return t.indexOf(w) > -1 || d.indexOf(w) > -1 || tags.indexOf(w) > -1; }).length;
    s += matchedWords * 5;
    return s;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function render(query) {
    var q = (query || "").trim();
    resultsEl.innerHTML = "";
    if (!q) {
      metaEl.textContent = INDEX.length + " pages indexed. Type to search.";
      emptyEl.hidden = true;
      return;
    }
    var hits = INDEX.map(function (item) { return { item: item, s: score(item, q) }; })
                    .filter(function (x) { return x.s > 0; })
                    .sort(function (a, b) { return b.s - a.s; })
                    .slice(0, 30);
    if (hits.length === 0) {
      metaEl.textContent = "No results for \\"" + q + "\\".";
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    metaEl.textContent = hits.length + " result" + (hits.length === 1 ? "" : "s") + " for \\"" + q + "\\"";
    resultsEl.innerHTML = hits.map(function (h) {
      var it = h.item;
      return '<li class="search-hit"><a href="' + escapeHtml(it.url) + '"><span class="kind">' + escapeHtml(it.kind) + '</span><span class="t">' + escapeHtml(it.title) + '</span><span class="d">' + escapeHtml(it.description) + '</span></a></li>';
    }).join("");
  }

  input.addEventListener("input", function () { render(input.value); });
  // Honour ?q= deep links (used by the WebSite SearchAction schema and nav).
  var initialQ = new URLSearchParams(window.location.search).get("q") || "";
  if (initialQ) {
    input.value = initialQ;
    render(initialQ);
  } else {
    render("");
  }
})();
</script>`;

  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Search", url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "SearchResultsPage",
      url: canonical,
      name: title,
      isPartOf: { "@id": `${config.siteUrl}/#website` },
    },
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("search/index.html", html);
}

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

${leadAndEssentials()}
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
          '<h3 class="card-h" style="margin:0">' + c.emoji + ' ' + c.name + '</h3>' +
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

  <h2>How long does the e-Visa take?</h2>
  <p>Approval is usually within minutes — for most North American, Australian, and Gulf passports, the PDF arrives in your inbox before you've finished closing the browser tab. Edge cases (older passports, travel from sanctioned-list countries, recent name changes) can take up to 24 hours. Apply at least 48 hours before flying to give yourself a buffer; do not apply the morning of departure.</p>
  <p>The e-Visa fee is not refundable if your application is rejected. Rejections are rare but happen — most often because of passport-validity issues (less than 6 months from arrival) or non-eligible passport types (some refugee travel documents). If you're rejected you'll need to apply for a sticker visa at the nearest Turkish consulate, which takes 1-3 weeks.</p>

  <h2>How long can I stay?</h2>
  <p>The standard tourist e-Visa is single or multiple entry, valid for 180 days from issue, allowing up to 90 days of presence within any 180-day period. If you arrive on day 1 and stay 60 days, you can come back later within the 180-day validity for another 30 days — but the cumulative limit is 90. Overstaying triggers fines starting at $50 and escalating; chronic overstayers face entry bans.</p>
  <p>For longer stays (study, work, longer leisure stays of 90+ days) you need a residence permit (ikamet) — applied for after arrival within the first 90 days, at the Göç İdaresi (immigration office). The process is digital and English-friendly via e-ikamet.goc.gov.tr.</p>

  <h2>Border arrival realities</h2>
  <p>At Istanbul Airport (IST), Sabiha Gökçen (SAW), and other major points of entry, the passport-control queue is usually 20-40 minutes during daylight arrivals, longer (60-90 minutes) for late-evening flights from Northern Europe arriving in Istanbul's peak. Officers will scan your passport and the e-Visa, ask one or two cursory questions about purpose of visit, and stamp you in. Have your e-Visa printout or PDF ready on your phone — the officer will scan the QR code if asked.</p>
  <p>Customs after passport control is usually a green-channel walkthrough; bag inspection is rare unless you're carrying high-value goods. Dollar / Euro cash limits: under $10,000 equivalent doesn't need declaration; over that, declare at customs to avoid issues at exit.</p>

  <h2>Frequently asked</h2>
  <h3>Does Turkey require proof of onward travel?</h3>
  <p>Officially no, in practice rarely asked at land borders, occasionally asked when checking in at your home airport for an Istanbul flight. Carry a screenshot of your return ticket if you have one. If you're flying one-way and onward (e.g., overland to Iran or Greece), book a cheap refundable Pegasus flight to a nearby city as a fallback proof — refund it after you arrive.</p>
  <h3>Can I apply for the e-Visa for someone else?</h3>
  <p>Yes — the application doesn't verify the applicant is the same as the traveler. Many people apply for their family on a single sitting. Each person needs their own e-Visa with their own passport details.</p>
  <h3>What if I lose my passport in Turkey?</h3>
  <p>Visit your country's embassy or consulate (most countries have an embassy in Ankara and a consulate in Istanbul). Apply for an emergency travel document, then visit the local Göç İdaresi to get an exit stamp before departure. Allow 3-5 days for the full process.</p>
</section>

${leadAndEssentials()}
${footer()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Visa", url: canonical },
    ]),
    howToLd({
      name: "How to apply for a Turkey e-Visa",
      description: "Apply for a Turkey e-Visa online in about 10 minutes. Cost: $35–50 depending on passport. Validity: 180 days from issue.",
      totalTime: "PT10M",
      estimatedCost: { value: 50, currency: "USD" },
      steps: [
        { name: "Confirm eligibility", text: "Check whether your passport is e-Visa eligible at evisa.gov.tr. Most US, Canadian, Australian, UAE, and Saudi passport holders qualify; many EU/UK/Japan passports are visa-free." },
        { name: "Open the official site", text: "Go to evisa.gov.tr — only the official site. Third-party 'visa services' charge 2–4× more for the identical form." },
        { name: "Fill in passport details", text: "Enter your passport number, full name as printed, expiry date, and travel dates. Passport must be valid for at least 6 months from your arrival." },
        { name: "Pay by card", text: "Pay the $35–50 fee by credit or debit card. Most issues take a few minutes; allow up to 24 hours for edge cases." },
        { name: "Save the PDF", text: "You'll receive an e-Visa PDF by email within minutes. Print it or save it to your phone — bring both when you fly." },
      ],
    }),
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

  <h2>Hidden costs and gotchas</h2>
  <p>The headline price isn't the trip price. Three things to factor in:</p>
  <p><strong>Airport transfers add up.</strong> Istanbul Airport (IST) is 50km from Sultanahmet — €40-50 by Welcome Pickups or Kiwitaxi (recommended), €30 by metered taxi (gambling on traffic), or €3 by metro (60-90 minutes door-to-door). Kayseri (ASR) and Nevşehir (NAV) airports both sit 60-80km from Göreme — most cave hotels include or arrange a transfer for €10-20 per person; if not, Kayseri taxi to Göreme is €40-50. Add these to your flight cost: a $35 flight + $50 transfer + $15 transfer = $100 effective fare.</p>
  <p><strong>Bus departures run from a specific terminal in each city.</strong> Istanbul has TWO bus terminals — Esenler (European side, the default for most operators) and Harem (Asian side). Always check the boarding terminal on your ticket. If you're staying in Sultanahmet and your bus leaves from Harem, factor in 60-90 minutes to cross the Bosphorus during evening traffic. The same applies in Cappadocia: Nevşehir Otogar serves most lines, but some inter-city services use Ürgüp or Kayseri instead.</p>
  <p><strong>Drive times multiply if you stop.</strong> The 10-hour Istanbul-Cappadocia drive assumes minimal stops and you don't hit Istanbul's notorious morning rush. Add 2 hours if you stop for a proper Anatolian lunch in Konya or Aksaray. Add another hour if anyone wants photos at Lake Tuz (the salt lake on the route).</p>

  <h2>Frequently asked</h2>
  <h3>Can I do Cappadocia as a day trip from Istanbul?</h3>
  <p>Technically yes, in practice no. The earliest morning flight from Istanbul lands in Kayseri at 08:30; the latest evening flight back leaves at 21:00. That gives you about 9 useful hours on the ground — minus 2 hours of round-trip airport transfer = 7 hours in Cappadocia. You can see Göreme Open-Air Museum and one valley walk; you cannot do a balloon ride (which requires staying overnight). Worth it only if you have absolutely no flexibility on dates.</p>
  <h3>Is the overnight bus safe for solo female travelers?</h3>
  <p>Yes — Turkish overnight buses are heavily used by solo women and the booking platform (Obilet.com) auto-blocks seats next to male strangers. Premium 2+1 seats on Pamukkale Turizm or Kamil Koç are the standard pick. Sleep masks and earplugs help; the steward checks on passengers regularly.</p>
  <h3>Can I do Istanbul → Cappadocia → Antalya in one trip?</h3>
  <p>Easily, in a 7-night trip. Suggested split: 3 nights Istanbul, 2 nights Cappadocia, 2 nights Antalya. Fly each leg (each is 1-1.5 hours; total transit time still under 6 hours including airports). The route is a popular triangle — flights run daily.</p>
</section>

${leadAndEssentials()}
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
  <p>Always get travel insurance — see our <a href="/insurance/">Turkey insurance guide</a> for SafetyWing vs World Nomads vs credit-card-cover. Adventure coverage (balloon flying, paragliding) matters if you're visiting Cappadocia or Ölüdeniz.</p>
  <p class="text-soft small"><em>Not insurance advice. We earn a commission if you buy through our links — this has no effect on price. Always read the policy documents before purchasing and verify coverage for your specific activities.</em></p>

  <h2>Healthcare and emergencies</h2>
  <p>Turkey's private hospital network (Acıbadem, Memorial, Liv Hospital, Anadolu) operates at Western standards in every major tourist city. English-speaking staff, modern equipment, transparent pricing. Public hospitals are good but slower and English is hit-or-miss. Either way, expect to pay up-front and claim through your insurance after — insurance companies usually negotiate directly with the larger private chains, but solo travelers often pay first then get reimbursed.</p>
  <p>Emergency numbers: 112 for medical/fire/police (universal). Tourist police in major cities have English-speaking officers — Istanbul's tourism police office is in Sultanahmet. Pharmacies (eczane) are widespread; many are 24-hour, with rotating "duty pharmacy" (nöbetçi eczane) signs in window. Most common medications (antibiotics, painkillers, basic prescriptions) are over-the-counter for pharmacist consultation.</p>

  <h2>Female solo traveler specifics</h2>
  <p>Turkey rates similarly to Italy and Spain on solo-female experience reports — generally safe, occasional unwanted attention rather than physical danger. Tourist zones (Sultanahmet, Beyoğlu, Kadıköy in Istanbul; Göreme; Antalya old town; Bodrum marina) are well-lit and policed. Conservative dress in eastern/central Anatolia (Konya, Mardin, Şanlıurfa) is respected though not strictly required — long pants and short-sleeved tops fit the rhythm. Avoid hailing taxis on the street, especially at night — use BiTaksi (Turkish equivalent of Uber) or have your hotel call. The most-reported issues with female solo travelers involve unmetered street taxis with shifting fares.</p>

  <h2>Common scams and how to handle them</h2>
  <p><strong>The shoeshine drop.</strong> A man "drops" his brush on the pavement near you. You pick it up to be helpful. He insists on shining your shoes as gratitude — and then charges 20-50 TL for the unwanted shine. Don't pick up the brush. Walk on.</p>
  <p><strong>The friendly guide.</strong> A stranger strikes up conversation in English, says he's a teacher / journalist / hotel owner, suggests a coffee. Coffee turns into a bar visit at a friend's place. The bar bill is staggering and the bouncer makes sure you pay. Solo male travelers are the typical mark; women report fewer occurrences. Decline coffee invitations from strangers in tourist areas.</p>
  <p><strong>The taxi route lengthener.</strong> A driver "doesn't know" your hotel and takes a 25-minute route for a 10-minute destination, with a meter running. Use BiTaksi to lock in the route on your phone before you get in. Or photograph the meter at the start and demand the printed receipt at the end.</p>
  <p><strong>The carpet-shop ambush.</strong> Common around the Grand Bazaar and Sultanahmet. A "guide" walks you toward the Hagia Sophia or Blue Mosque, then "shows" you a friend's carpet shop on the way. You'll be served apple tea, complimented on your taste, and pressured for two hours. The exit is to leave when the tea arrives — politely but firmly. They will not chase you on the street.</p>

  <h2>Frequently asked</h2>
  <h3>Are tourist areas in Istanbul safe at night?</h3>
  <p>Yes. Sultanahmet, Beyoğlu / İstiklal, Kadıköy, Beşiktaş — all heavily trafficked by foreign and Turkish visitors at all hours. The metro runs until midnight; ferries until later. Standard urban awareness applies: stick to lit streets, don't engage with overly-helpful strangers, watch for pickpockets in crowded ferries.</p>
  <h3>Should I worry about terrorism?</h3>
  <p>Turkey has had isolated terror incidents historically, more concentrated in the southeastern border provinces (which we don't cover) than in tourist regions. Foreign-office advisories (UK, US, EU) keep current advice — check before booking. Major tourist sites (airports, ferry terminals, mosques during Friday prayers) have visible police and metal-detector entry; this is standard.</p>
  <h3>What if I'm robbed or scammed?</h3>
  <p>File a report with the tourism police (in Istanbul, the office is in Sultanahmet near the Hagia Sophia). For credit-card fraud, call your bank immediately and freeze the card. For lost passport, visit your country's embassy or consulate (Ankara has the embassies; Istanbul has consulates for most major countries). Travel insurance pays for stolen-property replacement up to your plan's limit.</p>
</section>

${leadAndEssentials()}
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

<section class="container" aria-labelledby="insurance-picks-h">
  <h2 id="insurance-picks-h" class="visually-hidden">Recommended insurance providers</h2>
  <div class="grid grid-1 grid-2 mt-3">
    <div class="card" style="padding:28px">
      <div class="eyebrow">Recommended for most travelers</div>
      <h3 style="margin:6px 0">SafetyWing — Nomad Insurance</h3>
      <p style="color:var(--ink-muted);margin:10px 0">Subscription model from $45.08 / 4 weeks. Covers trip interruption, medical, baggage, emergency evacuation. Activity coverage extends to the standard Turkey adventure list (balloon flight, paragliding, scuba). Renew month-by-month if your trip extends.</p>
      ${(function () { const u = safetyWingLink(); return u ? `<a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(u)}">Get a SafetyWing quote →</a>` : `<p class="text-soft small" style="margin:0">Search "SafetyWing nomad insurance" to compare quotes for your dates.</p>`; })()}
    </div>
    <div class="card" style="padding:28px">
      <div class="eyebrow">Best for adventure-heavy trips</div>
      <h3 style="margin:6px 0">World Nomads</h3>
      <p style="color:var(--ink-muted);margin:10px 0">Higher trip-cost coverage, multiple plan tiers, broader adventure-activity list (kitesurfing, motorbike rentals, mountain trekking). Better for Cappadocia + Antalya combo trips with several adventure bookings.</p>
      ${(function () { const u = worldNomadsLink(); return u ? `<a class="btn btn-ghost" rel="sponsored nofollow" target="_blank" href="${esc(u)}">Get a World Nomads quote →</a>` : `<p class="text-soft small" style="margin:0">Search "World Nomads travel insurance" to compare quotes.</p>`; })()}
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
    <li>Paragliding from Babadağ at <a href="/fethiye/">Ölüdeniz</a> — needs explicit adventure-sports rider</li>
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

${leadAndEssentials()}
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

<section class="container" aria-labelledby="esim-providers-h">
  <h2 id="esim-providers-h" class="visually-hidden">eSIM providers worth using in Turkey</h2>
  <div class="grid grid-1 grid-2 mt-3">
    <div class="card" style="padding:28px">
      <div class="eyebrow">Most popular — best value</div>
      <h3 style="margin:6px 0">Airalo</h3>
      <p style="color:var(--ink-muted);margin:10px 0">Cheapest mainstream eSIM provider. Turkey plans from $4.50 (1 GB / 7 days) to $26 (20 GB / 30 days). Activates instantly, works on every iPhone XS+ and any Android with eSIM support.</p>
      ${(function () { const u = airaloLink(); return u ? `<a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(u)}">Browse Airalo Turkey plans →</a>` : `<p class="text-soft small" style="margin:0">Available at airalo.com/turkey-esim — search the App Store for the Airalo app.</p>`; })()}
    </div>
    <div class="card" style="padding:28px">
      <div class="eyebrow">Unlimited data, simpler choice</div>
      <h3 style="margin:6px 0">Holafly</h3>
      <p style="color:var(--ink-muted);margin:10px 0">Unlimited data plans from $19 / 5 days to $59 / 30 days. No data caps, but no Turkish phone number — outgoing SMS limited to in-app. Best if you stream a lot or share data with a partner.</p>
      ${(function () { const u = holaflyLink(); return u ? `<a class="btn btn-ghost" rel="sponsored nofollow" target="_blank" href="${esc(u)}">Browse Holafly Turkey plans →</a>` : `<p class="text-soft small" style="margin:0">Available at esim.holafly.com/esim-turkey/.</p>`; })()}
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

${leadAndEssentials()}
${footer()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "eSIM", url: canonical },
    ]),
    howToLd({
      name: "How to install a Turkey eSIM before you fly",
      description: "Set up your Turkey eSIM at home so you have working data the moment you land at Istanbul Airport — no roaming bill, no SIM swap.",
      totalTime: "PT10M",
      estimatedCost: { value: 14, currency: "USD" },
      steps: [
        { name: "Buy your plan online", text: "Buy your plan online while still at home (on hotel WiFi day-of departure works too)." },
        { name: "Scan the QR code", text: "Scan the QR code Airalo or Holafly emails you with your phone camera. The phone prompts to add the cellular plan." },
        { name: "Label the new line", text: "Label the new line 'Turkey' so you can toggle it." },
        { name: "Set as data line", text: "Set the eSIM as your data line. Leave your home line on for SMS and 2-factor auth." },
        { name: "Toggle Data Roaming on", text: "Toggle Data Roaming ON for the Turkey line — confusingly required even though it's an eSIM, not roaming." },
        { name: "Land and connect", text: "The eSIM activates the moment you connect to a Turkish cell tower (usually mid-descent). You'll have data the second you turn airplane mode off." },
      ],
    }),
  ].filter(Boolean);
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

${leadAndEssentials()}
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

${leadAndEssentials()}
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
  <p>Book a fixed-price airport transfer before you fly — Kiwitaxi or Welcome Pickups both cover Istanbul. Driver waits at arrivals with a sign with your name. Fixed price (~€35–50 to most central hotels). No haggling, no language confusion, no wrong-zone taxi gotchas. <strong>This is what we recommend for first-time visitors.</strong></p>
  ${(function () { const wp = welcomePickupsLink('istanbul'); const kt = kiwitaxiLink('istanbul'); const url = kt || wp; return url ? `<p><a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(url)}">Pre-book a transfer →</a></p>` : ``; })()}

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

${leadAndEssentials()}
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

<section class="container" aria-labelledby="experiences-h">
  <h2 id="experiences-h" class="visually-hidden">Six Turkish experiences worth seeking out</h2>
  <div class="grid grid-1 grid-2 grid-3 mt-3 showcase-grid" data-view="grid">
    ${EXPERIENCES.map(experienceShowcaseCard).join("")}
  </div>
</section>

<section class="container container-narrow prose mt-4">
  <h2>What "experience" means here</h2>
  <p>The word "experience" is overused in travel marketing — usually it means a tour bus with a guided commentary. We use it differently. Each of the six experiences below is a cultural ritual that locals participate in regularly, that takes 30 minutes to a full afternoon, and that gives a non-Turkish visitor real access to how the country operates. They aren't activities you book; they're rhythms you join.</p>
  <p>The reading order matters. Çay culture is the foundation — Turkey runs on tea and you'll be offered hundreds of glasses if you stay a week. Turkish coffee is the formal cousin: ceremonial, foretelling, served at decision moments. The hammam is the body's chapter — a 90-minute social bath with rules you don't want to learn by mistake. The whirling dervishes are the spiritual chapter, a 13th-century Sufi liturgy still performed weekly. The bazaar is the negotiation chapter — an hour with a rug seller is a masterclass in patient theatre, whether you buy or not. Anatolian breakfast is where the country's regional diversity shows up on a single table.</p>

  <h2>How to fit these into a trip</h2>
  <p>None of these need pre-booking unless explicitly noted. Çay and coffee are free and constant; they happen to you, you don't book them. The hammam wants 90 minutes and a hotel-recommended bath house — avoid the package-tour places near the Hagia Sophia in Istanbul and ask a local-staff hotelier instead. Whirling dervish ceremonies happen on specific weekly schedules at the Mevlana Cultural Centre in Konya (Saturday evenings) and several Istanbul venues — book the official ones, not the dinner-cruise add-ons. Anatolian breakfast is best in Gaziantep, Şanlıurfa, or any boutique hotel breakfast room outside Istanbul.</p>
  <p>Pair experiences geographically: Istanbul covers çay, coffee, hammam, and bazaar comfortably in 4 days. Cappadocia adds the regional breakfast version. Konya unlocks the proper sema. Gaziantep / Şanlıurfa are where the food experiences peak. Your trip doesn't need all six — pick the three that match how you travel.</p>

  <h2>What we leave off this list</h2>
  <p>Hot-air balloon rides in Cappadocia, the Bosphorus dinner cruise, belly-dancing dinner shows, and "Turkish nights" at package resorts — these are activities we cover in their own pages, but they're tourist products, not cultural rituals. They're worth doing if your trip wants them, but they don't tell you anything about Turkey.</p>
</section>

${leadAndEssentials()}
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
  const title = seoTitle(p.title);
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
${leadAndEssentials()}
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
const CITY_THEME_INTROS = (() => {
  try { return require("./data/city-theme-intros.json").intros || {}; }
  catch (e) { return {}; }
})();
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
<section class="container" aria-labelledby="regions-h">
  <h2 id="regions-h" class="visually-hidden">The 5 regions of Turkey, ranked by distinct trip-style</h2>
  <div class="grid grid-1 grid-2 grid-3 mt-3 showcase-grid" data-view="grid">
    ${REGIONS.map(regionShowcaseCard).join("")}
  </div>
</section>

<section class="container container-narrow prose mt-4">
  <h2>How to think about Turkey's regions</h2>
  <p>Turkey is the size of Texas plus Pennsylvania. A trip that "covers Turkey" by flying between five cities sees five cities — it doesn't see Turkey. The country is structured by region: each one has its own food, its own architectural style, its own seasonal rhythm, often its own dialect, and almost always its own answer to the question "what is Turkey?" Understanding the regional grid is the difference between a generic Turkey trip and a coherent one.</p>
  <p>The five we cover here are the five that matter for travelers:</p>
  <p><strong>Aegean Coast</strong> — Bodrum, Çeşme, Kuşadası, the Turquoise Coast down to Fethiye and Kaş. White-stone houses, blue water, ancient ruins (Ephesus, Bodrum's Mausoleum). Most of Turkey's design hotels and serious wine country sit here. Best for travelers wanting "Mediterranean Turkey done well."</p>
  <p><strong>Mediterranean Coast (Lycian / Antalya / Eastern Mediterranean)</strong> — Antalya, Side, Alanya, Mersin. More resort, less boutique than the Aegean. Cleopatra Beach, Roman ruins (Aspendos, Side, Termessos), the Lycian Way long-distance hiking trail. Best for affordable family resort holidays + Roman ruin enthusiasts.</p>
  <p><strong>Cappadocia</strong> — geographically a single region (Nevşehir province) but treated as its own due to the distinct experience: cave hotels, fairy chimneys, hot-air balloons, Byzantine cave churches. Best paired with Istanbul as a 5-day double-header.</p>
  <p><strong>Black Sea Coast</strong> — Trabzon, Rize, Samsun, with the Pontic Alps inland. Tea country, alpine plateaus, Sumela Monastery, Ayder hot springs. Wetter and cooler than the south coasts; greener than anywhere else in Turkey. Best for hikers and travelers wanting unfamiliar Turkey.</p>
  <p><strong>Eastern Anatolia / Mesopotamia</strong> — Mardin, Şanlıurfa, Gaziantep, Diyarbakır, Van. The deepest history (Göbekli Tepe is here), the best food (Gaziantep is UNESCO Creative City of Gastronomy), and the highest cultural density per square kilometre. Less infrastructure, more reward. Best for travelers on their second or third Turkey trip.</p>

  <h2>How to combine regions</h2>
  <p>The classic first-Turkey trip is <strong>Istanbul + Cappadocia</strong> — two regions, 5-7 nights, captures the country's polarity (cosmopolitan-Western and ancient-Anatolian). The second trip usually adds the <strong>Aegean or Mediterranean coast</strong>. The third trip is when travelers find the <strong>Eastern Anatolia / Mesopotamia</strong> combination that includes the food capital (Gaziantep), the prophet city (Şanlıurfa), and the limestone hill town (Mardin). The Black Sea fits anywhere as a 4-night detour from Istanbul.</p>
  <p>Internal flights cost $40-90 between major cities and take 1-2 hours; the alternative (10-12 hour overnight bus) is a romantic option for one leg, not three. Pegasus, AnadoluJet (Turkish Airlines' budget arm), and SunExpress all fly the major routes daily.</p>
</section>

${leadAndEssentials()}
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

${(function () {
  // Region-specific deep dive. Each of 5 regions gets a distinct
  // paragraph — different food, transport, seasonal advice — not
  // just region-name swap. Falls back to a generic block when slug
  // doesn't match.
  const regionDeepDive = {
    "aegean-coast": {
      around: "The Aegean Coast works best as single-base + day-trip rather than a road trip. Pick Bodrum or Çeşme as the base; rent a car from Localrent for 2-3 days to cover Ephesus, Şirince, the Aegean coves; otherwise the dolmuş minibus network reaches every cove cheaply. Domestic flights serve Bodrum (BJV), Izmir (ADB), and Dalaman (DLM) — book the cheapest, transfers between cities are short.",
      character: "The Aegean is Turkey's cultural-leaning coastal region — design hotels, serious wine country (Şirince, Urla), Ephesus and the Ionian-Roman ruin chain, and a more European-oriented crowd than the Mediterranean's package-tour belt. Food is olive-oil-heavy, lighter than Anatolian; the seafood meyhane culture (long fish-and-rakı dinners) is at its best here. Locals from Istanbul summer here in droves, raising both the quality bar and the prices.",
      combine: "Pair the Aegean with Istanbul for a 7-night first-Turkey trip (3+4 split), or with Cappadocia for a 9-night two-coast-and-cave trip. The Aegean is also the natural extension if you've already done Mediterranean Turkey — different food, calmer rhythm, more architectural variety.",
    },
    "mediterranean-riviera": {
      around: "The Mediterranean Riviera works as hub-and-spoke from a resort base — Antalya for Lara/Konyaaltı, Alanya/Side for the central coast, Fethiye for the Lycian Way, Kaş for the boutique-and-diving end. Antalya Airport (AYT) and Dalaman (DLM) are the two practical entry points; transfers between coastal towns are easier by Localrent rental car than by intercity bus.",
      character: "The Mediterranean is Turkey's package-holiday capital — large all-inclusive resorts, sandy beaches, predictable family-friendly amenities, and the lowest peak-season prices of the coastal regions. The headline non-resort attractions are the Lycian Way (a 760km coastal hiking trail) and the dense Roman ruin chain (Aspendos, Side, Olympos, Patara, Phaselis, Termessos). Best for affordable resort holidays + Roman ruin enthusiasts.",
      combine: "The classic 7-night first-Turkey trip is Istanbul + this region (3+4). Returning travelers often add Cappadocia for a 10-night three-region trip. Pair with the Aegean if your trip is coastal-themed.",
    },
    "cappadocia-central-anatolia": {
      around: "Cappadocia + Central Anatolia is best as fly-in / drive-out. Fly into Kayseri (ASR) or Nevşehir (NAV) for Cappadocia (60-80km transfer to Göreme); then either fly out from the same airport or rent a car and drive to Konya (3 hours), Ankara (5 hours), or back to Istanbul (10 hours, better as overnight bus). Inside Cappadocia itself, the cave hotels arrange transfers and you walk between sights.",
      character: "Cappadocia is Turkey's single-most-photographed landscape — fairy chimneys, volcanic-tuff cave hotels, sunrise hot-air balloons. Central Anatolia adds the cultural depth — Konya's Mevlana mausoleum and the whirling-dervish ceremonies, Ankara's Atatürk-era museums and the Anatolian Civilizations Museum (one of the finest in the world). Pair Cappadocia with one of these inland cities to give the trip more dimension than the balloon photos alone.",
      combine: "Cappadocia + Istanbul is the iconic first-Turkey 5-night double-header (2+3). For a 9-night trip add Antalya or the Aegean. Return travelers often pair Cappadocia with Eastern Anatolia (Mardin, Şanlıurfa, Gaziantep) for a serious cultural-history trip.",
    },
    "black-sea": {
      around: "The Black Sea region is essentially a road trip — fly into Trabzon (TZX), rent a car, drive east through Rize and into the Pontic Alps, fly out from the same airport or continue overland. The headline routes are coastal (Trabzon → Akçaabat → toward Samsun) and inland (Trabzon → Sumela → Uzungöl, Rize → Ayder → Hemşin). Limited public transport once you leave the main coastal cities.",
      character: "The Black Sea is the only Turkish region where the headline isn't sea or ruins — it's the Pontic Alps. Tea plantations, alpine yaylas (highland villages), wood-clad chalet hotels, mist-and-mountain landscapes that don't exist anywhere else in Turkey. Food is regional — hamsi (anchovy) in every form, Akçaabat köfte, kuymak/muhlama (cornmeal-and-cheese fondue). It rains here, year-round; pack a real rain jacket.",
      combine: "Black Sea works as a 4-night detour from Istanbul (1-hour flight). Pair with another inland region (Cappadocia or Eastern Anatolia) for a 9-night non-coastal Turkey trip. Less commonly paired with the Aegean or Mediterranean coasts — too much travel for a single trip.",
    },
    "eastern-anatolia": {
      around: "Eastern Anatolia is best with a rental car for at least one leg. Fly into Mardin (MQM) or Şanlıurfa (SFQ); the Mardin → Şanlıurfa → Gaziantep → Adıyaman → Mount Nemrut loop covers the headline sites in 5-7 days. Public transport between major cities is workable (intercity bus); rural day trips need a car or hired driver. The summer heat is the practical limiter — April-May or September-November are the comfortable months.",
      character: "Eastern Anatolia / Mesopotamia has the deepest history (Göbekli Tepe is here — 11,000-year-old temple complex), the best food (Gaziantep is UNESCO Creative City of Gastronomy), and the highest cultural density per square kilometre. Less infrastructure, more reward. The architectural language is honey-coloured limestone, Syriac stonework, Mardin's hill-town profile, Mor Gabriel's monastic ensembles. This is where return-Turkey travelers go on their second or third trip.",
      combine: "Pair Eastern Anatolia with Cappadocia (4-hour drive west) for a serious 9-10 night cultural trip. Returning travelers sometimes do Eastern Anatolia + Black Sea for a non-coastal grand tour. Less commonly paired with coastal Turkey — the trip's centre of gravity is too different.",
    },
  };
  const dd = regionDeepDive[r.slug] || {};
  return `<section class="container container-narrow prose mt-4">
  <h2>Getting around the ${esc(r.name)}</h2>
  <p>${esc(dd.around || "")}</p>

  <h2>What separates the ${esc(r.name)} from the rest of Turkey</h2>
  <p>${esc(dd.character || "")}</p>

  <h2>How to combine with other regions</h2>
  <p>${esc(dd.combine || "")}</p>
</section>`;})()}

${leadAndEssentials()}
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

<section class="container" aria-labelledby="trips-h">
  <h2 id="trips-h" class="visually-hidden">Day trips from ${esc(c.name)} — ranked options</h2>
  ${trips.map((t, i) => {
    // Prefer Klook (TP-attributed) over GYG (no partnerId on this account).
    // Falls back to GYG when partnerId is later populated.
    const tourUrl = getYourGuideLink(t.tourQuery) || klookLink(t.tourQuery);
    return `
    <div class="card mt-3" style="padding:28px">
      <div class="eyebrow">${esc(t.distance)} · ${esc(t.time)}</div>
      <h3 style="margin:6px 0 12px">${i + 1}. ${esc(t.name)}</h3>
      <p style="margin:0 0 16px;color:var(--c-text-soft)">${t.summary}</p>
      ${tourUrl ? `<a class="btn btn-primary" rel="sponsored nofollow" target="_blank" href="${esc(tourUrl)}">Book a ${esc(t.name)} tour →</a>` : `<a class="btn btn-primary" href="/${c.slug}/tours/">See ${esc(c.name)} tours →</a>`}
    </div>
  `;}).join("")}
</section>

<section class="container section-sm">
  <h2>Where to stay in ${esc(c.name)}</h2>
  <p class="text-muted" style="max-width:720px">If you're doing 2+ day trips, base yourself centrally. <a href="/${c.slug}/">See our full ${esc(c.name)} neighborhood guide</a> for which area suits which tour pickup.</p>
</section>

${(function () {
  // Per-city day-trip prose. Generic helper text for the universals
  // (distance/terrain/operator-mechanics) plus a city-specific intro
  // sentence. Only 6 cities have day-trip data so templating risk is
  // lower, but we still vary the opening hook by city.
  const cityIntros = {
    istanbul:  "Istanbul day-trips trade the city's density for one specific extra — Bursa for tombs and Iskender kebab, Princes' Islands for car-free 19th-century atmosphere, Cumalıkızık village for Ottoman timber houses, Şile + Ağva for Black Sea coastline.",
    antalya:   "Antalya day-trips lean Roman-ruins-and-canyons — Aspendos and Side both reachable as half-days, Termessos for the mountain ruins, Köprülü Canyon for rafting + Selge ruins, plus Pamukkale as a long-day option (4 hours each way, better as overnight).",
    bodrum:    "Bodrum day-trips are mostly boat-trips — gulet day cruises around the peninsula's coves, ferries across to the Greek island of Kos, and the more ambitious overnight to Datça or Pamukkale.",
    cappadocia:"Cappadocia day-trips fan out from Göreme: the Ihlara Valley + Selime Monastery 1.5h south, the Derinkuyu / Kaymaklı underground cities just south, and the lesser-visited Soğanlı Valley further out — all bookable as group or private day trips.",
    fethiye:   "Fethiye day-trips are paragliding (Babadağ above Ölüdeniz), the 12 Islands gulet day, the Saklıkent Gorge canyon walk, and the Kayaköy ghost-village circuit at sunset.",
    izmir:     "Izmir day-trips centre on Ephesus + Şirince village + the House of the Virgin Mary — a single full day from the city, the most-booked archaeology trip in Turkey.",
  };
  const intro = cityIntros[c.slug] || "";
  return `<section class="container container-narrow prose mt-4">
  <h2>How to choose between ${esc(c.name)} day trips</h2>
  ${intro ? `<p>${esc(intro)}</p>` : ""}
  <p>Three factors decide which day trip fits your trip: <strong>distance</strong> (anything over 100km each way eats most of the day in transit and rewards an overnight rather than a day trip — Pamukkale from Antalya is the classic example), <strong>terrain</strong> (canyon hiking, ruins climbing, rafting all need real shoes and water — the cards above flag this in the eyebrow), and <strong>your trip length</strong> (with 4 nights or fewer in ${esc(c.name)}, one day trip max; with 6+, two work well, three is overscheduled). Pick by what your trip is missing — if you've been on the beach for three days, take the ruins trip; if you've been climbing ruins, take the canyon-rafting trip.</p>
  <p>Tour-operator pickups standardly happen at 7–8am from your hotel and return by 6–7pm. Half-day trips run 8am–1pm or 1pm–7pm. Lunch is usually included on full-day tours; bring a backup snack anyway because the included lunch is often the weakest part of the day. Most operators allow free cancellation up to 24 hours ahead through the aggregator booking platforms.</p>

  <h2>What we'd skip</h2>
  <p>Multi-stop "highlights" tours that promise four sights in one day usually deliver tour-bus parking lots at four sights, with too little time at each to see anything substantive. Better to pick one and own it for 4–5 hours. Boat tours that cover "12 islands" in a day rarely stop at any one for more than 30 minutes — pick the trip that sells one island and dives there for an afternoon. Tours that include shopping stops (carpet, jewelry, ceramics) are subsidised by commission from the shops; they're not free even if they say they are — you pay in time.</p>

  <h2>Combining a ${esc(c.name)} day trip with an overnight</h2>
  <p>Two of the more demanding day trips above are better as overnights — Pamukkale especially (it's a 5am start to do as a day trip and you miss the sunrise on the travertines, which is the actual point). Same for the more remote ruins on the longer drives. If a day trip is going to be 12+ hours of total travel-time, look at adding a single overnight at a small village pension instead. Cost adds €40–80 per night; the experience nearly doubles.</p>
</section>`;})()}

${leadAndEssentials({ citySlug: c.slug })}
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

${leadAndEssentials()}
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
<section class="container" aria-labelledby="months-h">
  <h2 id="months-h" class="visually-hidden">Turkey month by month</h2>
  <div class="grid grid-1 grid-2 grid-3 grid-4 mt-3 showcase-grid" data-view="grid">
    ${MONTHS.map(monthShowcaseCard).join("")}
  </div>
</section>

<section class="container container-narrow prose mt-4">
  <h2>The four-season summary</h2>
  <p>Turkey covers six climate zones from the temperate Aegean to the continental Eastern Anatolian plateau. Picking a month is really picking a region: the same week in March is cherry-blossom season in Istanbul and still snowing in Erzurum. The four-season heuristic that works for most travelers:</p>
  <p><strong>Spring (April–May)</strong> is the goldilocks pair of months. Every region works. Istanbul and Cappadocia are at peak — wildflowers in the steppe, balloons flying daily, evenings warm enough for outdoor dinner. The Mediterranean coast is opening but the water is still cool (May 22°C, June 26°C). Crowds are moderate, prices are mid-season.</p>
  <p><strong>Summer (June–August)</strong> splits the country. The coasts (Antalya, Bodrum, Fethiye, Marmaris, Çeşme, Trabzon's Black Sea) are at peak — sea is warm, beach clubs are open, prices are high. Istanbul and Cappadocia are hot (28-32°C high) but workable. Eastern Anatolia (Mardin, Şanlıurfa, Gaziantep) is uncomfortable (37-39°C) — best avoided unless you have indoor-cool-museum patience.</p>
  <p><strong>Autumn (September–October)</strong> mirrors spring but with warmer water. The single best month for a coastal-and-cultural combined trip is September: water still 26°C, cultural cities not too hot, light golden, crowds thinning. October works for inland cities; the coast starts to close in late October.</p>
  <p><strong>Winter (November–March)</strong> is for travelers who care about specific things. Cappadocia in snow is iconic (and balloons fly more than people realize — the cold mornings have less wind than midsummer). Istanbul in winter is moody and cheap. The Mediterranean and Aegean coasts are largely closed for tourism. Eastern Anatolia is harsh. December-February domestic flights are cheapest of the year.</p>

  <h2>How to read the per-month pages</h2>
  <p>Each month page below has the verdict in the eyebrow ("Go", "Maybe", "Skip"), then average highs by region, what's open and closed, festival timing (Ramadan, the bayrams, Independence Day, the Istanbul Music Festival), and the balloon-flight rate in Cappadocia for that month. The "balloon flight rate" is the most-asked question — winter days flying is around 60%; April–October is 85-95%.</p>
  <p>For a quick best-time decision use <a href="/best-time-to-visit-turkey/">our best-time guide</a>. For trip-length advice see <a href="/how-many-nights-turkey/">how many nights you need</a>.</p>
</section>

${leadAndEssentials()}
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
${leadAndEssentials()}
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
<section class="container" aria-labelledby="collections-h">
  <h2 id="collections-h" class="visually-hidden">Themed hotel collections</h2>
  <div class="grid grid-1 grid-2 grid-3 mt-3 showcase-grid" data-view="grid">
    ${COLLECTIONS.map(collectionShowcaseCard).join("")}
  </div>
</section>

<section class="container container-narrow prose mt-4">
  <h2>How we pick</h2>
  <p>Every property in these collections has been editorially reviewed against the same four criteria, applied identically across all 22 cities: a Trip.com / TripAdvisor / Google review average above 8.5 across 200+ reviews sustained for at least 12 months; location inside the neighborhood it represents (we've walked there); a consistent best-for fit (a "couples" pick can't have a karaoke pool deck, a "family" pick can't have a 9pm cocktail-only restriction); and an editorial visit within the past 24 months. What rejects a hotel: persistent cleanliness complaints, sustained value issues, missing accessibility info on a property that markets to it, or anything our visit found that contradicts marketing claims.</p>
  <p>What we don't do: PR-funded trips, comped stays, paid placements, or guaranteed inclusion. Editorial visits are paid in full at our published rates. Hotel staff and PRs occasionally send blurbs — we rewrite from our own visit notes. Read the full <a href="/editorial-standards/">editorial standards</a>.</p>

  <h2>How to use these collections</h2>
  <p>Each collection focuses on a single decision axis — honeymooners care about different things than families, who care about different things than business travelers. Pick the collection that matches your trip's center of gravity, then narrow by city using the per-city neighborhood guides we link from every pick. The collection page tells you "which hotel in which city for this kind of trip"; the city page tells you "which neighborhood, and what to skip."</p>
  <p>Pricing in the collection cards is the editorial "from" rate — typical lowest-double-room in the property's main season, refreshed quarterly. Live rates always rule; click through to Trip.com via any "Check rates" button to see today's price for your dates.</p>

  <h2>Frequently asked</h2>
  <h3>How often are these refreshed?</h3>
  <p>The shortlists are reviewed every six months; pricing snapshots refresh in March and September. Cities themselves are visited at least annually. If you spot a hotel that's closed or substantially changed, email the editor — we aim to correct within 7 days.</p>
  <h3>Do you take payment from any of these hotels?</h3>
  <p>No. Our affiliate revenue comes from Trip.com bookings made through the "Check rates" links — Trip.com pays a small commission on confirmed stays at no cost to you. The commission does not change which hotels we list. Every property would be on the list whether or not we earned anything.</p>
  <h3>What if my city / region isn't here?</h3>
  <p>The collections deliberately surface a small number of best-in-class options across the whole country. For comprehensive city coverage use the <a href="/#all-cities">22 city guides</a> directly. The <a href="/regions/">regional hubs</a> group cities geographically (Aegean, Mediterranean, Cappadocia, Black Sea, Eastern Anatolia) if you'd rather think by region than by theme.</p>
</section>

${leadAndEssentials()}
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

<section class="container" aria-labelledby="picks-h">
  <h2 id="picks-h" class="visually-hidden">${esc(c.title)} — verified picks</h2>
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

${leadAndEssentials()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Best of Turkey", url: `${config.siteUrl}/best-of-turkey/` },
    { name: c.title, url: canonical },
  ])];
  const ogImage = `${config.siteUrl}/assets/img/og/collection/${c.slug}.svg`;
  const html = head({ title, description, canonical, jsonld, ogImage }) + body;
  writeFile(`best-of-turkey/${c.slug}/index.html`, html);
}

// ---- Turkish localization layer (cultural concepts + microcopy + phrases) ----
const CULTURAL_CONCEPTS = (() => {
  try { return require("./data/cultural-concepts.json").concepts || []; }
  catch (e) { return []; }
})();
const TURKISH_MICROCOPY = (() => {
  try { return require("./data/turkish-microcopy.json") || {}; }
  catch (e) { return {}; }
})();
const TURKISH_LOCALIZATION = (() => {
  try { return require("./data/turkish-localization.json") || {}; }
  catch (e) { return {}; }
})();

function renderCulturalConceptsHub() {
  const canonical = `${config.siteUrl}/culture/`;
  const title = "Turkish culture — six concepts that explain everything";
  const description = "Misafirperverlik, mahalle, çay, kolay gelsin, imece, bayram. The six Turkish cultural concepts that make sense of everyday Turkey. Each in plain English with Turkish words pinned.";
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Culture</div>
    <h1>What Turkey actually means</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">Six Turkish cultural concepts that explain why Turkey feels different from any country next to it. Each page is short, written by people who know how it actually works on the street.</p>
  </div>
</div>
<section class="container" aria-labelledby="culture-h">
  <h2 id="culture-h" class="visually-hidden">Six Turkish cultural concepts</h2>
  <div class="grid grid-1 grid-2 grid-3 mt-3 showcase-grid" data-view="grid">
    ${CULTURAL_CONCEPTS.map(culturalConceptShowcaseCard).join("")}
  </div>
</section>

<section class="container container-narrow prose mt-4">
  <h2>Why these six</h2>
  <p>Turkey sits across two continents, three empires' afterlives, and a hundred regional dialects of hospitality. A short list can't capture all of that, and we won't pretend otherwise. What these six concepts <em>do</em> capture is the operating system — the daily, unspoken rules that govern how people in Turkey treat each other, and how a respectful visitor can find footing without making things weird.</p>
  <p><strong>Misafirperverlik</strong> (hospitality) is the umbrella; everything else hangs off it. <strong>Mahalle</strong> (neighborhood-as-community) is the spatial form — why a Turkish address is more than a postcode. <strong>Çay</strong> (tea) is the social glue — accepting a glass costs you nothing and signals that you're open to the conversation. <strong>Kolay gelsin</strong> ("may it come easy", said to anyone working) is the verbal grace note that locals leave on every interaction. <strong>İmece</strong> (collective work) is the cooperative ethic that built the village and now runs the apartment building. <strong>Bayram</strong> (the religious-civic festivals) is the rhythm — when shops close, families travel, and trip plans bend.</p>

  <h2>How to use this section</h2>
  <p>Each concept page is short — under 1,000 words, written by people who live with the concept rather than read about it. Read them in any order; they cross-reference each other. The Turkish words aren't quiz material — knowing them won't make you a local — but recognizing them as they appear in conversation will dramatically change what you hear. When a shopkeeper says <em>kolay gelsin</em> as you leave, the cultural register is very different from "have a nice day."</p>
  <p>If you're arriving in Turkey for the first time, read <em>misafirperverlik</em> and <em>çay</em> on the plane. If you're past the first trip, the <em>mahalle</em> piece will recolour the city you thought you knew. <em>Bayram</em> matters most around April-May (Ramazan / Ramazan Bayramı / Şeker Bayramı) and June-August (Kurban Bayramı, dates shift annually) — if your travel dates land near a bayram, read it specifically.</p>

  <h2>What's not here yet</h2>
  <p>The full picture would also include muhabbet (the long open-ended conversation that defines Turkish evenings), mahcup (the social shame that disciplines public behaviour), nazar (the evil-eye protection that hangs in every door), keyif (the slow pleasure of sitting with one's life), and the layered legacy of the Ottoman millet system. We'll add these as separate pages over time. Suggestions, corrections, or gentle disagreements: email the editor — we read everything.</p>
</section>

${leadAndEssentials()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Culture", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("culture/index.html", html);
}

function renderCulturalConcept(p) {
  const canonical = `${config.siteUrl}/culture/${p.slug}/`;
  const title = seoTitle(p.title);
  const description = (p.subtitle || p.summary || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/culture/">Culture</a> / ${esc(p.title)}</div>
</div>
<article class="container container-narrow">
  <div class="page-head" style="border-bottom:none;padding-bottom:0">
    <div class="eyebrow">Culture</div>
    <h1>${esc(p.title)}</h1>
    ${p.subtitle ? `<p class="journal-subtitle" style="font-size:1.3rem;color:var(--ink-muted);font-style:italic;margin-top:12px">${esc(p.subtitle)}</p>` : ""}
    <div class="journal-meta" style="margin-top:24px"><span>${p.readMinutes || 6} min read</span></div>
  </div>
  <div class="prose mt-4">${p.bodyHtml || `<p>${esc(p.summary || "")}</p>`}</div>
</article>
${leadAndEssentials()}
${footer()}
${tail()}`;
  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Culture", url: `${config.siteUrl}/culture/` },
      { name: p.title, url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: p.title,
      description: description,
      url: canonical,
      author: { "@type": "Organization", name: config.siteName },
    },
  ];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile(`culture/${p.slug}/index.html`, html);
}

function renderTurkishPhrases() {
  const canonical = `${config.siteUrl}/turkish-phrases/`;
  const title = "Useful Turkish phrases for travelers — with pronunciation";
  const description = "The 14 Turkish phrases worth memorizing for a Turkey trip, with phonetic pronunciation and the social context where each one actually works.";
  const phrases = (TURKISH_LOCALIZATION.useful_visitor_phrases || []);
  const blessings = (TURKISH_MICROCOPY.blessings_situations || []);
  const proverbs = (TURKISH_MICROCOPY.proverbs_atasozleri || []);
  const misunderstandings = (TURKISH_LOCALIZATION.common_misunderstandings || []);

  const phraseRows = phrases.map((p) => `<tr><td><strong lang="tr">${esc(p.tr)}</strong></td><td>${esc(p.en)}</td><td><em>${esc(p.phonetic || "")}</em></td></tr>`).join("");
  const blessingCards = blessings.map((b) => `
    <div class="card" style="padding:18px">
      <strong lang="tr" style="font-size:1.05rem">${esc(b.tr)}</strong>
      <p style="margin:6px 0;color:var(--c-text-soft)">${esc(b.en)}</p>
      <p style="margin:0;font-size:.9rem;color:var(--ink-muted);font-style:italic">${esc(b.context || "")}</p>
    </div>
  `).join("");
  const misRows = misunderstandings.map((m) => `<li><strong>${esc(m.issue)}.</strong> ${esc(m.explain)}</li>`).join("");

  const body = `
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="page-head">
    <div class="breadcrumb"><a href="/">Home</a> / Turkish phrases</div>
    <h1>Turkish phrases that actually help</h1>
    <p class="text-muted" style="font-size:1.1rem;max-width:720px">English coverage in Istanbul tourist zones is high. In neighborhood Turkey, it's low. These are the phrases worth memorizing — every one of them changes the reaction you get from the locals you'll be ordering from, riding with, or asking for directions.</p>
  </div>
</div>

<section class="container container-narrow prose">
  <h2>The essentials</h2>
  <table>
    <thead><tr><th>Turkish</th><th>English</th><th>Pronunciation</th></tr></thead>
    <tbody>${phraseRows}</tbody>
  </table>

  <h2>Blessings &amp; everyday situational phrases</h2>
  <p style="max-width:720px">These aren't survival phrases. They're the small acknowledgements that signal you're not just consuming Turkey — that you're paying attention.</p>
  <div class="grid grid-1 grid-2 mt-3">${blessingCards}</div>

  <h2>Common misunderstandings</h2>
  <ul style="max-width:720px;line-height:1.8">${misRows}</ul>

  ${proverbs.length ? `
    <h2>An old Turkish proverb</h2>
    <blockquote style="border-left:3px solid var(--c-accent);padding:16px 20px;background:var(--c-accent-soft);margin:20px 0;font-style:italic;font-size:1.1rem">
      <strong lang="tr">${esc(proverbs[0].tr)}</strong><br>
      <span style="font-style:normal;color:var(--c-text-soft);font-size:.95rem">${esc(proverbs[0].en)}</span>
    </blockquote>
  ` : ""}

  <p class="text-muted" style="margin-top:32px">Want more cultural context? See our <a href="/culture/">six cultural concept guides</a> or read about <a href="/experiences/cay-culture/">çay culture</a>.</p>
</section>

${leadAndEssentials()}
${footer()}
${tail()}`;
  const jsonld = [breadcrumbLd([
    { name: "Home", url: `${config.siteUrl}/` },
    { name: "Turkish phrases", url: canonical },
  ])];
  const html = head({ title, description, canonical, jsonld }) + body;
  writeFile("turkish-phrases/index.html", html);
}

// ---- Per-city OG image (SVG) ----
function writeCityOgImages() {
  for (const c of cities) {
    const bg1 = "#FFE4E6", bg2 = "#FEF3C7";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="g${c.slug}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g${c.slug})"/><text x="80" y="220" font-family="sans-serif" font-size="100" font-weight="800" fill="#0f172a">Where to Stay in</text><text x="80" y="340" font-family="sans-serif" font-size="140" font-weight="800" fill="#E11D48">${esc(c.name)}.</text><text x="80" y="420" font-family="sans-serif" font-size="32" fill="#6b6b6b">${esc(c.tagline).slice(0, 90)}</text><text x="1080" y="570" font-family="sans-serif" font-size="32" text-anchor="end" fill="#8a8a8a">wheretostayturkey.com</text></svg>`;
    writeFile(`assets/img/og/${c.slug}.svg`, svg);
  }
}

// Per-collection OG cards. Same template as journal but with a
// collection emoji in the corner + palette derived from the collection's
// themed showcase color (kept consistent with showcase cards).
function writeCollectionOgImages() {
  const palettes = {
    honeymoon:    { e: "💍", a: "#fbcfe8", b: "#fde68a" },
    family:       { e: "👨‍👩‍👧", a: "#dbeafe", b: "#fef3c7" },
    historic:     { e: "🏛️", a: "#fef3c7", b: "#fde68a" },
    beachfront:   { e: "🏖️", a: "#dbeafe", b: "#a7f3d0" },
    cave:         { e: "🏞️", a: "#fef3c7", b: "#fcd34d" },
    luxury:       { e: "✨", a: "#f3e8ff", b: "#fde68a" },
  };
  function pick(slug) {
    if (slug.includes("honeymoon")) return palettes.honeymoon;
    if (slug.includes("family")) return palettes.family;
    if (slug.includes("historic")) return palettes.historic;
    if (slug.includes("beach")) return palettes.beachfront;
    if (slug.includes("cave")) return palettes.cave;
    if (slug.includes("luxury") || slug.includes("5-star")) return palettes.luxury;
    return palettes.honeymoon;
  }
  function wrap(text, maxChars) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur.trim()); cur = w; }
      else cur = (cur + " " + w).trim();
      if (lines.length === 3) break;
    }
    if (cur && lines.length < 3) lines.push(cur.trim());
    return lines.slice(0, 3);
  }
  for (const c of COLLECTIONS) {
    const pal = pick(c.slug);
    const lines = wrap(c.title || c.slug, 22);
    const startY = lines.length === 1 ? 320 : lines.length === 2 ? 280 : 230;
    const tspans = lines.map((ln, i) => `<text x="80" y="${startY + i * 92}" font-family="Georgia, serif" font-size="76" font-weight="600" fill="#0f172a">${esc(ln)}</text>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="cg${esc(c.slug)}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${pal.a}"/><stop offset="1" stop-color="${pal.b}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#cg${esc(c.slug)})"/><text x="80" y="120" font-family="sans-serif" font-size="22" font-weight="600" fill="#b45309" letter-spacing="6">COLLECTION</text>${tspans}<text x="80" y="565" font-family="sans-serif" font-size="26" fill="#5e6473">${esc((c.subtitle || c.summary || "").slice(0, 80))}</text><text x="1080" y="160" font-size="120" text-anchor="end">${pal.e}</text><text x="1120" y="600" font-family="sans-serif" font-size="22" text-anchor="end" fill="#8a8a8a">wheretostayturkey.com</text></svg>`;
    writeFile(`assets/img/og/collection/${c.slug}.svg`, svg);
  }
}

// Cross-collection OG cards (turkey-luxury, turkey-couples, etc.) —
// hand-curated palette per slug since cross-collections aren't in
// COLLECTIONS data. Picture-equivalent to writeCollectionOgImages.
function writeCrossCollectionOgImages() {
  const entries = [
    { slug: "turkey-luxury",            title: "Luxury hotels in Turkey",        e: "✨", a: "#f3e8ff", b: "#fde68a" },
    { slug: "turkey-couples",           title: "Romantic stays for couples",     e: "💕", a: "#fbcfe8", b: "#fde68a" },
    { slug: "turkey-families",          title: "Family-friendly hotels",         e: "👨‍👩‍👧", a: "#dbeafe", b: "#fef3c7" },
    { slug: "turkey-off-beaten-path",   title: "Off the beaten path",            e: "🗺️", a: "#d1fae5", b: "#fef3c7" },
  ];
  function wrap(text, maxChars) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur.trim()); cur = w; }
      else cur = (cur + " " + w).trim();
      if (lines.length === 3) break;
    }
    if (cur && lines.length < 3) lines.push(cur.trim());
    return lines.slice(0, 3);
  }
  for (const x of entries) {
    const lines = wrap(x.title, 22);
    const startY = lines.length === 1 ? 320 : lines.length === 2 ? 280 : 230;
    const tspans = lines.map((ln, i) => `<text x="80" y="${startY + i * 92}" font-family="Georgia, serif" font-size="76" font-weight="600" fill="#0f172a">${esc(ln)}</text>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="xg${esc(x.slug)}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${x.a}"/><stop offset="1" stop-color="${x.b}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#xg${esc(x.slug)})"/><text x="80" y="120" font-family="sans-serif" font-size="22" font-weight="600" fill="#b45309" letter-spacing="6">CURATED</text>${tspans}<text x="1080" y="160" font-size="120" text-anchor="end">${x.e}</text><text x="1120" y="600" font-family="sans-serif" font-size="22" text-anchor="end" fill="#8a8a8a">wheretostayturkey.com</text></svg>`;
    writeFile(`assets/img/og/cross/${x.slug}.svg`, svg);
  }
}

// Per-journal-post OG cards — large title centered on themed gradient.
// Wraps title across up to 3 lines so long titles don't overflow.
function writeJournalOgImages() {
  function wrap(text, maxChars) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars && cur) {
        lines.push(cur.trim());
        cur = w;
      } else {
        cur = (cur + " " + w).trim();
      }
      if (lines.length === 3) break;
    }
    if (cur && lines.length < 3) lines.push(cur.trim());
    return lines.slice(0, 3);
  }
  for (const p of JOURNAL) {
    const lines = wrap(p.title, 28);
    const startY = lines.length === 1 ? 320 : lines.length === 2 ? 270 : 220;
    const lineSpacing = 92;
    const tspans = lines.map((ln, i) => `<text x="80" y="${startY + i * lineSpacing}" font-family="Georgia, serif" font-size="76" font-weight="600" fill="#0f172a">${esc(ln)}</text>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="jg${esc(p.slug)}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#FAF8F3"/><stop offset="1" stop-color="#F3EDE0"/></linearGradient></defs><rect width="1200" height="630" fill="url(#jg${esc(p.slug)})"/><text x="80" y="120" font-family="sans-serif" font-size="22" font-weight="600" fill="#b45309" letter-spacing="6">JOURNAL</text>${tspans}<text x="80" y="565" font-family="sans-serif" font-size="26" fill="#5e6473">${esc((p.subtitle || p.summary || "").slice(0, 80))}</text><text x="1120" y="600" font-family="sans-serif" font-size="22" text-anchor="end" fill="#8a8a8a">wheretostayturkey.com</text></svg>`;
    writeFile(`assets/img/og/journal/${p.slug}.svg`, svg);
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

  <h2>What changes between months</h2>
  <p>Three things shift when the calendar moves: <strong>price</strong> (peak July-August coastal hotels charge 2-3x off-season; flights into Istanbul are cheapest November-February); <strong>open vs closed</strong> (most beach resorts close November-March; many cave hotels in Cappadocia stay open all year; Black Sea highland village pensions close November-April); and <strong>crowd density at the major sights</strong> (Hagia Sophia queue is 15 minutes in February and 90 minutes in August at the same time of day). The trip you build should optimize for whichever of these three matters most for your priorities.</p>

  <h2>Festival timing to know</h2>
  <p>Two annual peaks affect domestic travel: <strong>Ramazan Bayramı / Şeker Bayramı</strong> (Eid al-Fitr) and <strong>Kurban Bayramı</strong> (Eid al-Adha). These are 4-9 day public holidays where many Turks travel. Coastal hotels fill, internal flights book up, and prices spike. Dates shift each year — verify against the current calendar before booking. Independence Day (October 29) and Republic Day (October 29) bring weekend-scale tourism but not full-week closures. The Istanbul Music Festival runs early June and the Antalya International Film Festival late October — both worth scheduling around if you're traveling on those dates.</p>

  <h2>Frequently asked</h2>
  <h3>What's the cheapest month for Turkey?</h3>
  <p>February. Flights are at their annual minimum, hotels in non-coastal cities offer winter rates, and the country is quiet. The trade-off: Mediterranean and Aegean coasts are largely closed, the weather in Istanbul and Cappadocia is cold (occasionally snow), and the long evenings limit outdoor exploration. Worth it for travelers who want Istanbul atmospherically without the crowds, or Cappadocia in snow.</p>
  <h3>Is Cappadocia balloon flying weather-dependent?</h3>
  <p>Yes. Roughly 85-95% of mornings fly April through October; 60-70% in November, December, and February (winter winds cancel more flights); March and January average around 70-80%. Pilots cancel in winds above ~15 knots at any altitude or in light rain. Book at least 2-3 mornings into your Cappadocia stay so you have a backup if the first morning cancels.</p>
  <h3>When is the water warmest?</h3>
  <p>Mediterranean Sea (Antalya, Bodrum, Fethiye) peaks at 27-28°C in August and stays swimmable through mid-October (still 24°C). Aegean (Izmir, Çeşme, Kuşadası) is similar but a degree or two cooler. Black Sea (Trabzon, Rize) peaks at 24°C in August — swimmable but less of the headline attraction. Sea of Marmara (Istanbul beaches) peaks at 25°C in August — locals swim, most travelers don't.</p>
</section>
${leadAndEssentials()}
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

  <h2>How nights translate to "things you'll actually see"</h2>
  <p>A useful frame: every full day in a Turkish city gives you one major sight, two meals, and one neighborhood walk. Every transfer day (flying or driving between cities) eats most of a day. So 5 nights in Turkey is really "5 days minus 2 transfer days = 3 full days of sightseeing." That's two cities, comfortably. Three cities is possible but the third gets short-changed. Four cities in 5 nights is a hostel-bracelet collection, not a trip.</p>
  <p>The corollary: long-haul travelers from North America, Asia, or Australia who fly 14+ hours each way should commit to 8-10 nights minimum. The marginal cost of a 6-night vs 8-night trip is small (two more hotel nights); the marginal experience gain is huge (a third city + recovery time + a slow morning at sunset). Travelers from Europe with a 3-hour flight can rationally do shorter — Istanbul as a long-weekend (3-4 nights) is a perfectly good trip for them, where it isn't for someone arriving from Sydney.</p>

  <h2>How season changes the math</h2>
  <p>April-May and September-October are the goldilocks months — every region works. Add a night to your plans for these months because the light and temperatures reward slow walking and long evenings. June-August: the Mediterranean coast (Antalya, Bodrum, Fethiye) and the Black Sea (Trabzon, Rize) work well; Istanbul and Cappadocia are hot but doable; Eastern Anatolia (Mardin, Şanlıurfa) is uncomfortable. December-February: Istanbul and Cappadocia work (cold but atmospheric, snow on the fairy chimneys is iconic); the Mediterranean coast is largely closed; Eastern Anatolia is harsh. Match your duration to the season, not just to your annual leave.</p>

  <h2>Frequently asked</h2>
  <h3>Is 7 nights too long for just Istanbul?</h3>
  <p>For most travelers, yes — Istanbul rewards 4-5 nights well, but day 6-7 starts to feel like extra. Better to spend day 5 onwards on a Cappadocia or Antalya add-on. Exception: Istanbul-only trips work for repeat visitors with specific deep-dive agendas (Bosphorus villages, Princes' Islands, day-trips to Bursa).</p>
  <h3>Can I do Turkey in 3 nights?</h3>
  <p>Yes — Istanbul only. Land Friday morning, two full days, Sunday afternoon flight home. You'll see Sultanahmet, Beyoğlu, the Bosphorus, and one good dinner. You won't see Cappadocia or any beach.</p>
  <h3>What about 14 nights?</h3>
  <p>Two weeks is the trip you'll wish you'd taken. Suggested: 4 Istanbul + 3 Cappadocia + 4 Mediterranean coast (Antalya or Fethiye) + 3 buffer (one of Bodrum, Pamukkale, or a flying visit to Şanlıurfa for Göbekli Tepe). Or replace the buffer with longer stays in the prior three.</p>
</section>
${leadAndEssentials()}
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
<section class="container" aria-labelledby="guides-cards-h">
  <h2 id="guides-cards-h" class="visually-hidden">Browse all guides</h2>
  <div class="grid grid-2 grid-3">
    ${cards.map((c) => `<a class="card" href="${esc(c.href)}" style="text-decoration:none;color:inherit"><h3 style="margin:0 0 6px">${esc(c.h)}</h3><p class="text-muted" style="margin:0">${esc(c.p)}</p></a>`).join("")}
  </div>
</section>
${leadAndEssentials()}
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
    <strong>Disclosure:</strong> This page contains affiliate links. If you book through them we may earn a commission at no extra cost to you — and it's how we keep the site ad-free. <a href="/about/#affiliate">Read our affiliate policy →</a>
  </div>
</div>`;
}

// Small disclaimer under hotel grids: prices are editorial estimates, not live rates.
function priceDisclaimer() {
  return `
<p class="text-soft small mt-2" style="text-align:center">
  Prices are editorial "from" estimates based on recent booking data. Always check <a rel="sponsored nofollow" target="_blank" href="${esc(bookingLink("Turkey"))}">live Trip.com rates</a> for real-time availability and current pricing.
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
    <li>Third-party embeds (Trip.com, GetYourGuide, Google Maps) may set their own cookies once you click out.</li>
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
  <p>When you click an affiliate link (Trip.com, Localrent, GetYourGuide, Welcome Pickups, Airalo, etc.), that partner may set tracking cookies to attribute a booking to us. These cookies are set by the partner, not by us, and are governed by their privacy policy. We don't receive any personally identifiable info about you from them.</p>

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
  <p>Questions? <a href="mailto:${esc(b.privacyEmail)}">${esc(b.privacyEmail)}</a>.${b.postalAddress ? ` Postal mail: ${esc(b.postalAddress)}.` : ""}</p>
</section>
${leadMagnet()}
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
  <p>We link to third-party booking platforms (Trip.com, Localrent, GetYourGuide, etc.) and earn commissions when you book through them. This has no effect on the price you pay. We disclose this on every page and in full in our <a href="/about/#affiliate">affiliate disclosure</a>.</p>

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
  <p>Third-party trademarks (Trip.com®, Localrent®, Airalo®, etc.) are property of their respective owners and used nominatively to identify the service. We claim no endorsement or partnership beyond publicly disclosed affiliate programs.</p>

  <h2>Governing law</h2>
  <p>These terms are governed by the laws of ${esc(b.jurisdiction)}. Any dispute shall be heard in the competent courts of ${esc(b.jurisdiction)}.</p>

  <h2>Changes</h2>
  <p>We may update these terms. Continued use of the site after changes constitutes acceptance.</p>

  <h2>Contact</h2>
  <p><a href="mailto:${esc(b.contactEmail)}">${esc(b.contactEmail)}</a>${b.postalAddress ? ` — ${esc(b.postalAddress)}` : ""}.</p>
</section>
${leadMagnet()}
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
  ${b.postalAddress ? `<h2>Postal</h2>
  <p>${esc(b.legalName)}<br>${esc(b.postalAddress)}</p>` : ""}
  <h2>Spotted a mistake?</h2>
  <p>If a hotel has closed, a neighborhood description is wrong, or a price range is way off — please tell us. Local knowledge is the whole point. <a href="mailto:${esc(b.contactEmail)}?subject=Correction">Send a correction →</a></p>
</section>
${leadMagnet()}
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

// 12-month climate strip per city. Colour-codes each month by season +
// marks "good", "great", "avoid" months from a heuristic combining
// c.whenToGo + per-month MONTHS array data. Pure CSS — no canvas, no
// chart library. Renders on city pages between the hero and the toc.
// Per-city monthly climate overrides. Each entry is a 12-element array
// indexed Jan..Dec. Each cell is [tier, avgHighC] — tier ∈ great/ok/avoid.
// Numbers are 30-year normals from Turkish State Meteorological Service
// (mgm.gov.tr) rounded to whole degrees. Tier is editorial — combines
// temp + rainfall + tourist crowding to give an actionable
// "should I go this month" signal.
const CITY_CLIMATE = {
  istanbul:   [["avoid",9],["avoid",10],["ok",12],["great",17],["great",22],["ok",27],["avoid",30],["avoid",30],["great",26],["great",21],["ok",16],["avoid",11]],
  cappadocia: [["avoid",4],["avoid",6],["ok",11],["great",16],["great",21],["ok",26],["avoid",30],["avoid",30],["great",25],["great",19],["ok",12],["avoid",6]],
  antalya:    [["avoid",15],["ok",16],["ok",19],["great",22],["great",26],["ok",31],["avoid",35],["avoid",35],["great",32],["great",27],["ok",22],["avoid",17]],
  bodrum:     [["avoid",15],["ok",16],["ok",18],["great",21],["great",26],["ok",30],["avoid",33],["avoid",33],["great",30],["great",25],["ok",21],["avoid",17]],
  fethiye:    [["avoid",15],["ok",16],["ok",19],["great",22],["great",26],["ok",31],["avoid",34],["avoid",35],["great",32],["great",27],["ok",22],["avoid",17]],
  izmir:      [["avoid",13],["ok",14],["ok",17],["great",22],["great",27],["ok",32],["avoid",35],["avoid",35],["great",31],["great",25],["ok",19],["avoid",14]],
  pamukkale:  [["avoid",10],["ok",12],["ok",16],["great",21],["great",26],["ok",32],["avoid",36],["avoid",35],["great",31],["great",24],["ok",17],["avoid",11]],
  marmaris:   [["avoid",15],["ok",16],["ok",18],["great",21],["great",26],["ok",30],["avoid",33],["avoid",33],["great",30],["great",25],["ok",21],["avoid",17]],
  kas:        [["avoid",14],["ok",15],["ok",17],["great",20],["great",24],["ok",28],["avoid",31],["avoid",32],["great",29],["great",24],["ok",20],["avoid",16]],
  trabzon:    [["ok",11],["ok",11],["ok",13],["great",16],["great",20],["ok",24],["ok",27],["ok",27],["great",24],["great",20],["ok",16],["ok",13]],
  alanya:     [["avoid",16],["ok",16],["ok",19],["great",22],["great",26],["ok",30],["avoid",33],["avoid",33],["great",30],["great",26],["ok",21],["avoid",17]],
  side:       [["avoid",15],["ok",16],["ok",19],["great",22],["great",26],["ok",30],["avoid",33],["avoid",33],["great",30],["great",26],["ok",21],["avoid",17]],
  kusadasi:   [["avoid",13],["ok",14],["ok",17],["great",21],["great",26],["ok",30],["avoid",33],["avoid",33],["great",30],["great",24],["ok",19],["avoid",14]],
  mersin:     [["avoid",15],["ok",16],["ok",19],["great",22],["great",26],["ok",30],["avoid",33],["avoid",34],["great",31],["great",27],["ok",22],["avoid",17]],
  rize:       [["ok",11],["ok",11],["ok",13],["great",16],["great",20],["ok",23],["ok",26],["ok",26],["great",23],["great",19],["ok",16],["ok",12]],
  ankara:     [["avoid",4],["avoid",7],["ok",12],["great",17],["great",22],["ok",27],["avoid",30],["avoid",30],["great",26],["great",20],["ok",13],["avoid",6]],
  gaziantep:  [["avoid",7],["avoid",10],["ok",14],["great",20],["great",25],["ok",31],["avoid",35],["avoid",35],["great",30],["great",23],["ok",15],["avoid",9]],
  bursa:      [["avoid",9],["avoid",11],["ok",13],["great",18],["great",23],["ok",28],["avoid",31],["avoid",31],["great",27],["great",21],["ok",16],["avoid",11]],
  konya:      [["avoid",4],["avoid",7],["ok",12],["great",18],["great",22],["ok",27],["avoid",31],["avoid",31],["great",26],["great",20],["ok",12],["avoid",6]],
  mardin:     [["avoid",8],["avoid",10],["ok",15],["great",21],["great",26],["ok",33],["avoid",37],["avoid",37],["great",31],["great",24],["ok",16],["avoid",10]],
  safranbolu: [["avoid",6],["avoid",8],["ok",13],["great",18],["great",22],["ok",26],["avoid",29],["avoid",29],["great",25],["great",19],["ok",13],["avoid",8]],
  sanliurfa:  [["avoid",10],["avoid",12],["ok",17],["great",23],["great",29],["ok",34],["avoid",39],["avoid",39],["great",34],["great",27],["ok",18],["avoid",12]],
};

function climateStrip(c) {
  const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthSlug = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const override = CITY_CLIMATE[c.slug];
  // Heuristic fallback for any city without curated data.
  const greatRegex = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/gi;
  const greatTokens = ((c.whenToGo || "").match(greatRegex) || []).map((s) => s.toLowerCase().slice(0, 3));
  const monthFlags = monthShort.map((m, i) => {
    let tier, temp = null;
    if (override) {
      tier = override[i][0];
      temp = override[i][1];
    } else {
      tier = greatTokens.includes(m.toLowerCase()) ? "great" : "ok";
    }
    return {
      name: m,
      slug: monthSlug[i],
      tier,
      temp,
      season: i < 2 || i === 11 ? "winter" : i < 5 ? "spring" : i < 8 ? "summer" : "autumn",
    };
  });
  const tierLabel = (t) => t === "great" ? "Best month" : t === "avoid" ? "Skip" : "Decent";
  return `
<section class="container container-narrow climate-strip-section" aria-labelledby="climate-h">
  <h2 id="climate-h" class="visually-hidden">When to visit ${esc(c.name)}</h2>
  <div class="climate-strip" aria-label="Best months to visit ${esc(c.name)}">
    <div class="climate-strip-label small text-soft">When to visit</div>
    <div class="climate-strip-bars">
      ${monthFlags.map((m) => `
        <a class="climate-month tier-${esc(m.tier)} season-${esc(m.season)}" href="/turkey-by-month/${esc(m.slug)}-in-turkey/" title="${esc(tierLabel(m.tier))}: ${esc(m.name)}${m.temp != null ? ` — avg high ${m.temp}°C` : ""}">
          <span class="climate-month-name">${esc(m.name)}</span>
          ${m.temp != null ? `<span class="climate-month-temp">${m.temp}°</span>` : ""}
          <span class="climate-month-bar" aria-hidden="true"></span>
        </a>`).join("")}
    </div>
    <div class="climate-strip-legend small text-soft">
      <span class="legend-item"><i class="dot tier-great"></i>Best</span>
      <span class="legend-item"><i class="dot tier-ok"></i>Decent</span>
      <span class="legend-item"><i class="dot tier-avoid"></i>Skip</span>
      ${override ? `<span class="legend-item legend-source">avg high °C — Turkish State Meteorological Service</span>` : ""}
    </div>
  </div>
</section>`;
}

// Inline cost-per-day widget per city. Pulls from CITY_COST_TABLE so the
// numbers stay in sync with the planner. Three tiers, all in USD with
// a TRY conversion. Mostly textual + emoji so it's lightweight.
const CITY_COST_TABLE = {
  istanbul:   { budget: 35, mid: 75, lux: 220 },
  cappadocia: { budget: 45, mid: 95, lux: 280 },
  antalya:    { budget: 30, mid: 70, lux: 200 },
  bodrum:     { budget: 40, mid: 90, lux: 260 },
  fethiye:    { budget: 35, mid: 80, lux: 220 },
  izmir:      { budget: 30, mid: 65, lux: 180 },
  pamukkale:  { budget: 25, mid: 60, lux: 160 },
  marmaris:   { budget: 30, mid: 70, lux: 200 },
  kas:        { budget: 35, mid: 75, lux: 200 },
  trabzon:    { budget: 30, mid: 65, lux: 170 },
  alanya:     { budget: 28, mid: 62, lux: 180 },
  side:       { budget: 30, mid: 70, lux: 190 },
  kusadasi:   { budget: 28, mid: 65, lux: 180 },
  mersin:     { budget: 25, mid: 55, lux: 150 },
  rize:       { budget: 28, mid: 60, lux: 160 },
  ankara:     { budget: 28, mid: 60, lux: 170 },
  gaziantep:  { budget: 25, mid: 55, lux: 160 },
  bursa:      { budget: 28, mid: 60, lux: 170 },
  konya:      { budget: 25, mid: 55, lux: 150 },
  mardin:     { budget: 28, mid: 60, lux: 170 },
  safranbolu: { budget: 25, mid: 55, lux: 160 },
  sanliurfa:  { budget: 25, mid: 55, lux: 150 },
};
function costPerDayWidget(c) {
  const t = CITY_COST_TABLE[c.slug];
  if (!t) return "";
  const tryRate = 34;
  const fmtTry = (usd) => `₺${(usd * tryRate).toLocaleString("tr-TR")}`;
  return `
<section class="container container-narrow cost-per-day" aria-labelledby="cost-h">
  <h2 id="cost-h" class="visually-hidden">Daily budget for ${esc(c.name)}</h2>
  <div class="cost-grid">
    <div class="cost-tier cost-budget"><div class="cost-label">Budget</div><div class="cost-amount">$${t.budget}<span class="cost-try"> ${fmtTry(t.budget)}</span></div><div class="cost-note">/ person / day</div></div>
    <div class="cost-tier cost-mid"><div class="cost-label">Mid-range</div><div class="cost-amount">$${t.mid}<span class="cost-try"> ${fmtTry(t.mid)}</span></div><div class="cost-note">/ person / day</div></div>
    <div class="cost-tier cost-lux"><div class="cost-label">Luxury</div><div class="cost-amount">$${t.lux}<span class="cost-try"> ${fmtTry(t.lux)}</span></div><div class="cost-note">/ person / day</div></div>
  </div>
  <p class="cost-disclaimer small text-soft">Includes hotel, food, local transport, and one paid attraction. Excludes flights and tours. <a href="/planner/">Calculate your full trip cost →</a></p>
</section>`;
}

// "Last on-the-ground visit" trust badge — small inline pill near hero.
function lastVisitedBadge(c) {
  const date = c.lastVerified || "April 2026";
  return `<div class="last-visited" aria-label="Last on-the-ground visit to ${esc(c.name)}: ${esc(date)}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>Visited ${esc(date)}</span></div>`;
}

// "What we'd skip" anti-recommendation. Differentiator vs every other
// hotel-aggregator — most sites recommend, we also tell you what to skip.
// Reads from c.skipNotes (string) when populated, otherwise falls back
// to a generic skipped-things note pulled from the city tagline.
function skipCallout(c) {
  const notes = c.skipNotes || `Treat any all-inclusive resort that markets to package tours, any ${c.name} restaurant on the main pedestrian strip with a host pulling tourists in, and any "Turkish Night" dinner show targeting bus groups as default-skip — they exist for the people who don't read sites like this one.`;
  return `
<section class="container container-narrow skip-callout-section" aria-labelledby="skip-h">
  <aside class="skip-callout">
    <div class="skip-eyebrow">What we'd skip</div>
    <h2 id="skip-h" class="skip-h">The honest part nobody else writes</h2>
    <p class="skip-text">${esc(notes)}</p>
    <p class="skip-meta small text-soft">If you spot something on this list that shouldn't be, tell us — <a href="mailto:${esc(config.business.editorialEmail)}">${esc(config.business.editorialEmail)}</a>.</p>
  </aside>
</section>`;
}

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
    <div class="byline-meta">Last verified <time>${esc(verified)}</time> · <a href="/about/${esc(AUTHOR.slug)}/">About ${esc(AUTHOR.name.split(" — ")[0])}</a></div>
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
      <input type="range" id="p-nights" min="1" max="21" value="5" step="1" aria-label="Number of nights">
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

${leadAndEssentials()}
</main>
${footer()}
${tail()}

<script>
const CITY_COST = ${CITY_COST};
const TRIP_ALLIANCE_ID = ${JSON.stringify(A.tripcom.allianceid || "")};
const TRIP_SID = ${JSON.stringify(A.tripcom.sid || "")};
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

  // Update book CTA: deep link to that city on Trip.com (Travelpayouts).
  var tripParams = "city=" + encodeURIComponent(c.name);
  if (TRIP_ALLIANCE_ID) tripParams += "&allianceid=" + encodeURIComponent(TRIP_ALLIANCE_ID);
  if (TRIP_SID) tripParams += "&sid=" + encodeURIComponent(TRIP_SID);
  $("p-book").href = "https://www.trip.com/hotels/list?" + tripParams;
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
  // Journal posts go first since they're the dated content. Sorted
  // newest-first using publishedAt; falls back to today's date if missing.
  const journalSorted = [...JOURNAL].sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  const journalItems = journalSorted.map((p) => {
    const pub = p.publishedAt ? new Date(p.publishedAt).toUTCString() : today;
    return `  <item>
    <title>${esc(p.title)}</title>
    <link>${config.siteUrl}/journal/${p.slug}/</link>
    <guid>${config.siteUrl}/journal/${p.slug}/</guid>
    <description>${esc(p.subtitle || p.summary || "")}</description>
    <pubDate>${pub}</pubDate>
  </item>`;
  }).join("\n");
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
${journalItems}
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
${leadAndEssentials()}
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
      "@id": `${canonical}#person`,
      name: AUTHOR.name,
      url: canonical,
      mainEntityOfPage: { "@id": canonical },
      jobTitle: "Editor",
      description: AUTHOR.credentials,
      worksFor: { "@id": `${config.siteUrl}/#organization` },
      knowsAbout: [
        "Turkey travel",
        "Istanbul neighborhoods",
        "Cappadocia",
        "Hotel reviews",
        "Mediterranean coast",
        "Aegean coast",
        "Black Sea region",
        "Ottoman architecture",
        "Turkish cuisine",
        "Editorial standards",
      ],
      knowsLanguage: ["English", "Turkish"],
      image: { "@type": "ImageObject", url: `${config.siteUrl}/assets/img/favicon.svg` },
    },
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "@id": canonical,
      url: canonical,
      name: title,
      isPartOf: { "@id": `${config.siteUrl}/#website` },
      mainEntity: { "@id": `${canonical}#person` },
      inLanguage: "en",
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
  // Tally tags so we can show only those with 2+ posts (avoids noise).
  const tagCounts = {};
  for (const p of JOURNAL) for (const t of (p.tags || [])) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const tagChips = Object.entries(tagCounts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  // Sort posts newest-first so the hub doesn't surface 4-week-old posts
  // above last-week's. Falls back to source order when dates are missing.
  const postsSorted = [...JOURNAL].sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
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
  ${tagChips.length ? `
  <div class="amenity-filter journal-tag-filter" role="group" aria-label="Filter articles by tag">
    <button class="amenity-chip" type="button" data-journal-tag="all" data-active="true">All <span class="amenity-chip-count">${JOURNAL.length}</span></button>
    ${tagChips.map(([t, n]) => `<button class="amenity-chip" type="button" data-journal-tag="${esc(t)}">${esc(t.replace(/-/g, " "))} <span class="amenity-chip-count">${n}</span></button>`).join("")}
  </div>` : ""}
  <div class="journal-list">
    ${postsSorted.map((p) => `
      <article class="journal-item" data-tags="${esc((p.tags || []).join(" "))}">
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
    <p class="journal-empty" hidden>No articles match that tag yet.</p>
  </div>
</section>
${leadAndEssentials()}
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
      blogPost: postsSorted.map((p) => ({
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
  const title = seoTitle(p.title);
  const description = (p.subtitle && p.subtitle.length >= 80 ? p.subtitle : (p.summary || p.subtitle || "")).replace(/\s+/g, " ").trim().slice(0, 160);
  // Process the article body: add anchor ids to H2s, build a TOC, and
  // mark a midpoint where a mid-article CTA can be injected.
  const processed = processArticleBody(p.bodyHtml);
  // Mid-article CTA — only injected on long posts (4+ H2s) and only
  // when we found a midpoint marker. Targets the post's first city tag.
  const midCta = (() => {
    const tagSlug = (p.tags || []).find((t) => cities.find((c) => c.slug === t.toLowerCase()));
    const targetCity = tagSlug ? cities.find((c) => c.slug === tagSlug.toLowerCase()) : null;
    if (!targetCity) return "";
    return `<aside class="mid-cta" style="margin:32px 0;padding:22px 24px;background:var(--accent-soft);border-left:3px solid var(--accent);border-radius:var(--radius)">
      <div class="eyebrow" style="margin-bottom:6px">While you're reading</div>
      <p style="margin:0 0 12px;font-family:var(--font-serif);font-size:1.1rem;color:var(--ink)">Picking where to stay in ${esc(targetCity.name)}? Our full neighborhood guide breaks it down.</p>
      <a class="btn btn-primary btn-sm" href="/${esc(targetCity.slug)}/">Open the ${esc(targetCity.name)} guide →</a>
    </aside>`;
  })();
  const articleHtml = processed.html
    ? processed.html.replace("<!--midpoint-->", midCta)
    : `<p>${esc(p.summary)}</p>
       <div class="callout-warning" style="background:var(--accent-soft);border-left:2px solid var(--accent);padding:18px 22px;margin:24px 0;font-size:0.95rem;color:var(--ink-muted)">
         <strong>Coming soon.</strong> The full ${p.readMinutes}-minute read is being written. Subscribe at the foot of any page and we'll email you when it goes live.
       </div>`;
  const body = `
<div class="reading-progress" id="reading-progress" aria-hidden="true"><div class="reading-progress-bar"></div></div>
${nav()}
${disclosureBanner()}
<div class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/journal/">Journal</a> / ${esc(p.title)}</div>
</div>
<article class="container container-narrow journal-article" id="article-body">
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

  ${processed.toc}

  <div class="prose mt-4">
    ${articleHtml}
    <p style="margin-top:32px;color:var(--ink-muted);font-size:.92rem">Tagged: ${p.tags.map((t) => `<span style="background:var(--accent-soft);padding:2px 8px;border-radius:2px;margin-right:6px">${esc(t)}</span>`).join("")}</p>
  </div>
  ${(() => {
    const tagSlug = (p.tags || []).find((t) => cities.find((c) => c.slug === t.toLowerCase()));
    const targetCity = tagSlug ? cities.find((c) => c.slug === tagSlug.toLowerCase()) : null;
    if (!targetCity) return "";
    return `<div class="card mt-4" style="padding:24px;background:var(--c-accent-soft, #f7efe2);border-left:3px solid var(--c-accent, #b45309)"><div class="eyebrow">Plan your stay</div><h3 style="margin:6px 0 8px">Where to stay in ${esc(targetCity.name)}</h3><p style="margin:0 0 14px;color:var(--c-text-soft, #5e6473)">Pick the right neighborhood and the right hotel — our full ${esc(targetCity.name)} guide breaks down every area we recommend.</p><a class="btn btn-primary" href="/${esc(targetCity.slug)}/">See ${esc(targetCity.name)} guide →</a></div>`;
  })()}

  ${(() => {
    // Tailor the inline lead magnet to the post's target city when known.
    const tagSlug = (p.tags || []).find((t) => LEAD_COPY_BY_CITY[t.toLowerCase()]);
    const copy = (tagSlug && LEAD_COPY_BY_CITY[tagSlug.toLowerCase()]) || LEAD_COPY_BY_CITY.istanbul;
    return `<div class="lead-magnet mt-4">
    <div class="eyebrow">Free, sent instantly</div>
    <h3>${esc(copy.title)} while you wait</h3>
    <p class="text-muted">${esc(copy.sub)}</p>
    <form class="lead-form" action="${esc(config.emailCaptureEndpoint)}" data-source="journal-${esc(p.slug)}">
      <input type="email" name="email" placeholder="your@email.com" required>
      <button type="submit" class="btn btn-primary">Send it</button>
    </form>
  </div>`;
  })()}
</article>

${(() => {
  // Related-articles block: rank other journal posts by tag overlap, take top 3.
  const myTags = new Set((p.tags || []).map((t) => t.toLowerCase()));
  if (myTags.size === 0) return "";
  const scored = JOURNAL
    .filter((q) => q.slug !== p.slug)
    .map((q) => {
      const qt = (q.tags || []).map((t) => t.toLowerCase());
      const shared = qt.filter((t) => myTags.has(t)).length;
      return { q, score: shared };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.q.publishedAt || "").localeCompare(a.q.publishedAt || ""))
    .slice(0, 3);
  if (!scored.length) return "";
  return `<section class="container container-narrow section-sm">
  <h2 style="font-size:1.4rem">Keep reading</h2>
  <div class="grid grid-1 grid-3 mt-3">
    ${scored.map(({ q }) => `<a class="card" href="/journal/${esc(q.slug)}/" style="text-decoration:none;color:inherit">
      <div class="eyebrow">${esc((q.tags || [])[0] || "Article")}</div>
      <h3 style="font-size:1.1rem;margin:6px 0 8px">${esc(q.title)}</h3>
      <p class="text-muted small" style="margin:0">${esc(q.subtitle || q.summary || "")}</p>
    </a>`).join("")}
  </div>
</section>`;
})()}

${(() => {
  // Author bio block — surfaces /about/{slug}/ link, gives the article
  // a face. Only on journal posts (high engagement, where bylines matter).
  return `<section class="container container-narrow section-sm">
  <div class="card" style="display:flex;gap:18px;align-items:flex-start;padding:22px">
    <div class="byline-avatar" aria-hidden="true" style="flex:0 0 auto;width:54px;height:54px;border-radius:999px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-family:var(--font-serif);font-size:1.3rem">${esc(AUTHOR.avatarInitials || AUTHOR.name.charAt(0))}</div>
    <div style="flex:1 1 auto">
      <div class="eyebrow">Written by</div>
      <div style="font-family:var(--font-serif);font-size:1.15rem;margin:2px 0 6px">${esc(AUTHOR.name)}</div>
      <p class="text-muted small" style="margin:0 0 10px">${esc(AUTHOR.shortBio || AUTHOR.credentials || "")}</p>
      <a class="small" href="/about/${esc(AUTHOR.slug)}/">More about ${esc((AUTHOR.name || "").split(" ")[0] || "the author")} →</a>
    </div>
  </div>
</section>`;
})()}

${essentialsBlock()}
${footer()}
${tail()}
<script>
// Reading progress bar — tracks scroll position across the article body
// only (not the header / nav / monetization strips). Throttled with rAF.
(function(){
  var bar = document.querySelector("#reading-progress .reading-progress-bar");
  var article = document.getElementById("article-body");
  if (!bar || !article) return;
  var pending = false;
  function update(){
    pending = false;
    var rect = article.getBoundingClientRect();
    var total = article.offsetHeight - window.innerHeight;
    var scrolled = -rect.top;
    var pct = total > 0 ? Math.max(0, Math.min(100, (scrolled / total) * 100)) : 0;
    bar.style.width = pct + "%";
  }
  function onScroll(){
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
})();
</script>`;
  // Resolve article-image candidate: use the post's image if set, else
  // the target-city hero photo if any, else the default OG.
  const articleTagSlug = (p.tags || []).find((t) => cities.find((c) => c.slug === t.toLowerCase()));
  const articleCity = articleTagSlug ? cities.find((c) => c.slug === articleTagSlug.toLowerCase()) : null;
  const articleImage = p.image || (articleCity && articleCity.heroImage) || `${config.siteUrl}/assets/img/og/journal/${p.slug}.svg`;
  const primarySection = (p.tags && p.tags[0]) ? p.tags[0] : "Travel";

  const jsonld = [
    breadcrumbLd([
      { name: "Home", url: `${config.siteUrl}/` },
      { name: "Journal", url: `${config.siteUrl}/journal/` },
      { name: p.title, url: canonical },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      headline: p.title,
      description: p.subtitle || p.summary || "",
      url: canonical,
      image: articleImage,
      datePublished: p.publishedAt,
      dateModified: p.updatedAt || p.publishedAt,
      articleSection: primarySection,
      keywords: (p.tags || []).join(", "),
      wordCount: processed.wordCount,
      timeRequired: `PT${p.readMinutes || 6}M`,
      inLanguage: "en",
      author: { "@id": `${config.siteUrl}/about/${AUTHOR.slug}/#person`, "@type": "Person", name: AUTHOR.name, url: `${config.siteUrl}/about/${AUTHOR.slug}/` },
      publisher: {
        "@type": "Organization",
        name: config.siteName,
        url: config.siteUrl,
        logo: { "@type": "ImageObject", url: `${config.siteUrl}/assets/img/favicon.svg` },
      },
    },
  ];
  const html = head({
    title,
    description,
    canonical,
    jsonld,
    ogImage: articleImage,
    ogType: "article",
    article: {
      publishedTime: p.publishedAt,
      modifiedTime: p.updatedAt || p.publishedAt,
      author: AUTHOR.name,
      section: primarySection,
      tags: p.tags || [],
    },
  }) + body;
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
${leadAndEssentials()}
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
    <p>Send us a one-paragraph note — what your property is, where it is, what makes it specific. Photos and Trip.com / Tripadvisor links help. Address it to:</p>
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
${leadMagnet()}
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
  renderEditorialStandards();
  renderAuthorPage();
  renderThankYouNew();                 // both /thank-you/ and /thank-you-combo/
  renderQuiz();
  renderSearchPage();
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
  renderCulturalConceptsHub();
  for (const _cc of CULTURAL_CONCEPTS) renderCulturalConcept(_cc);
  renderTurkishPhrases();

  for (const c of cities) {
    renderCity(c);
    renderProgrammaticForCity(c);
    renderToursPage(c);
  }

  renderAllCrossCollections();
  writeCityOgImages();
  writeJournalOgImages();
  writeCollectionOgImages();
  writeCrossCollectionOgImages();
  writeFavicon();
  writeOgImage();
  writeAppleTouchIcon();
  writeManifest();
  writeSecurityTxt();
  render404();
  renderRss();
  renderSitemap();
  renderRobots();
  renderAdsTxt();
  renderIndexNowKey();

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
