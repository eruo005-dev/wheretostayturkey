#!/usr/bin/env node
// fetch-hotels.js
// Pull hotel candidates for a city from Google Places (New) Text Search.
// Outputs a staged JSON file that you review + merge into data/cities*.json.
//
// Usage:
//   GOOGLE_PLACES_API_KEY=... node scripts/fetch-hotels.js istanbul
//   GOOGLE_PLACES_API_KEY=... node scripts/fetch-hotels.js "Göreme Cappadocia"
//
// Output: data/_staging/{slug}-hotels.json (new file, never overwrites cities.json)
//
// WHY PLACES API ISN'T THE WHOLE ANSWER:
//   Google Places gives you name, address, rating, price_level, photos, lat/lng.
//   It does NOT give you a commissionable booking URL. Always route the
//   booking click through Booking.com / Hotels.com / Agoda with your aid.
//   This script fills in the metadata; the build.js templates handle the
//   commission-generating links.

const fs = require("fs");
const path = require("path");

const KEY = process.env.GOOGLE_PLACES_API_KEY;
const ARG = process.argv[2];

if (!KEY) {
  console.error("Missing GOOGLE_PLACES_API_KEY env var.");
  console.error("Get one at https://console.cloud.google.com (enable Places API — New).");
  process.exit(1);
}
if (!ARG) {
  console.error("Usage: node scripts/fetch-hotels.js <city-slug-or-query>");
  process.exit(1);
}

const query = /\s/.test(ARG) ? ARG : `hotels in ${ARG} Turkey`;
const slug = ARG.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const priceTier = (level) => {
  // Places price_level: 0 free, 1 inexpensive, 2 moderate, 3 expensive, 4 very expensive
  if (level == null) return "mid";
  if (level >= 3) return "luxury";
  if (level <= 1) return "budget";
  return "mid";
};

// Places API New — text search endpoint
async function searchPlaces(q, pageToken = null) {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const body = pageToken ? { pageToken } : { textQuery: q, includedType: "lodging", pageSize: 20 };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.location",
        "places.websiteUri",
        "places.types",
        "nextPageToken",
      ].join(","),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  console.log(`🔎 Searching Google Places: "${query}"`);
  const results = [];
  let token = null;
  for (let i = 0; i < 3; i++) {
    // up to ~60 results
    const data = token ? await searchPlaces(null, token) : await searchPlaces(query);
    for (const p of data.places || []) {
      results.push({
        placeId: p.id,
        name: (p.displayName && p.displayName.text) || "",
        address: p.formattedAddress || "",
        rating: p.rating || null,
        reviewCount: p.userRatingCount || 0,
        priceLevel: p.priceLevel || null,
        tier: priceTier(p.priceLevel),
        lat: p.location && p.location.latitude,
        lng: p.location && p.location.longitude,
        website: p.websiteUri || "",
      });
    }
    token = data.nextPageToken;
    if (!token) break;
    // Places API requires ~2s delay between paginated calls
    await new Promise((r) => setTimeout(r, 2200));
  }

  // Sort by review count * rating (rough quality signal)
  results.sort((a, b) => (b.rating || 0) * Math.log1p(b.reviewCount) - (a.rating || 0) * Math.log1p(a.reviewCount));

  // Skeleton cities.json hotel entries for easy manual review/merge
  const suggested = results.slice(0, 25).map((r) => ({
    name: r.name,
    area: "",                     // <-- fill in: slug of a neighborhood in data/cities*.json
    tier: r.tier,
    priceFrom: null,              // <-- fill in from live Booking.com check
    bestFor: [],                  // <-- fill in (e.g. ["couples","design"])
    whyStay: "",                  // <-- fill in (one sentence)
    _meta: {
      placeId: r.placeId,
      address: r.address,
      rating: r.rating,
      reviewCount: r.reviewCount,
      priceLevel: r.priceLevel,
      lat: r.lat,
      lng: r.lng,
      website: r.website,
    },
  }));

  const outDir = path.join(__dirname, "..", "data", "_staging");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${slug}-hotels.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify({ query, fetchedAt: new Date().toISOString(), suggested, raw: results }, null, 2)
  );

  console.log(`✓ ${results.length} hotels found, top ${suggested.length} staged`);
  console.log(`  Output: ${path.relative(process.cwd(), outFile)}`);
  console.log(`  Next: review the file, fill in area/priceFrom/bestFor/whyStay,`);
  console.log(`        then paste the entries into data/cities*.json under the correct city,`);
  console.log(`        and run  npm run build.`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
