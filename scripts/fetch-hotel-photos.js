#!/usr/bin/env node
/**
 * Populate `bookingPhotoId` on each hotel by scraping the hotel's public
 * Booking.com listing page for its primary photo hash.
 *
 * Why scrape and not the Booking affiliate API: the affiliate API requires
 * Connectivity-level approval (separate from the AID partner program).
 * Most affiliates don't have it. The public listing page exposes the
 * photo hash in plain HTML, and using it from a static site is consistent
 * with the affiliate terms (we link to Booking; the photo URL points at
 * Booking's CDN).
 *
 * Usage:
 *   node scripts/fetch-hotel-photos.js                  # all cities
 *   node scripts/fetch-hotel-photos.js istanbul         # one city
 *   node scripts/fetch-hotel-photos.js --dry-run        # preview only
 *
 * Writes back to data/cities*.json. Re-run safe (idempotent — only
 * fetches hotels that don't already have a bookingPhotoId).
 *
 * Rate-limited to one request every ~1.5s to be polite. ~30s per city.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const DATA_DIR = path.join(__dirname, "..", "data");
const cityFilter = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]);
const dryRun = process.argv.includes("--dry-run");

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; wheretostayturkey-photo-fetcher/1.0)",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // follow redirect once
        return resolve(fetchHtml(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("timeout")));
  });
}

// Pull the first hotel CDN hash from the listing-page HTML. Booking embeds
// many of these — we want the primary (largest, photo_id = 1 typically).
function extractPhotoId(html) {
  // Pattern: cf.bstatic.com/xdata/images/hotel/(max1024|max500|square240)/<hash>.jpg
  const m = html.match(/cf\.bstatic\.com\/xdata\/images\/hotel\/(?:max\d+|square\d+)\/(\d+)\.jpg/);
  return m ? m[1] : null;
}

// Pull a Booking-style 1-10 rating + review count from the search result
// HTML. Booking renders these as text in attribute values like
// data-testid="review-score" and "X reviews". Several patterns exist; we
// try a few in order. Returns { rating, reviewCount } or nulls.
function extractRating(html) {
  const ratingMatch = html.match(/data-testid="review-score"[^>]*>[\s\S]*?(\d(?:[.,]\d)?)\s*(?:Wonderful|Excellent|Very good|Good|Fabulous|Superb|Exceptional)?/i)
    || html.match(/"reviewScore"\s*:\s*(\d+(?:\.\d+)?)/);
  const countMatch = html.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*reviews/i)
    || html.match(/"reviewCount"\s*:\s*(\d+)/);
  const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(",", ".")) : null;
  const count = countMatch ? parseInt(countMatch[1].replace(/[.,]/g, ""), 10) : null;
  return {
    rating: (rating && rating >= 1 && rating <= 10) ? rating : null,
    reviewCount: (count && count > 0) ? count : null,
  };
}

async function searchAndExtract(query) {
  // Booking lets unsigned-in users search; the first result usually contains
  // the property's gallery photos in HTML. We use the search URL since not
  // every hotel has a slugged /hotel/<id>/ permalink we know up front.
  const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(query)}&group_adults=2&no_rooms=1`;
  const html = await fetchHtml(searchUrl);
  return {
    photoId: extractPhotoId(html),
    ...extractRating(html),
  };
}

async function processCityFile(file) {
  const full = path.join(DATA_DIR, file);
  const doc = JSON.parse(fs.readFileSync(full, "utf8"));
  if (!doc.cities) return;
  let dirty = false;
  for (const city of doc.cities) {
    if (cityFilter && city.slug !== cityFilter) continue;
    console.log(`\n# ${city.name} (${city.hotels.length} hotels)`);
    for (const hotel of city.hotels) {
      const hasImage = hotel.bookingPhotoId || hotel.image;
      const hasRating = hotel.rating && hotel.reviewCount;
      if (hasImage && hasRating) {
        console.log(`  · ${hotel.name} — already has image+rating, skip`);
        continue;
      }
      const query = `${hotel.name} ${city.name}`;
      try {
        const result = await searchAndExtract(query);
        const updates = [];
        if (!hasImage && result.photoId) {
          if (!dryRun) hotel.bookingPhotoId = result.photoId;
          updates.push(`photo=${result.photoId}`);
          dirty = true;
        }
        if (!hasRating && result.rating && result.reviewCount) {
          if (!dryRun) {
            hotel.rating = result.rating;
            hotel.reviewCount = result.reviewCount;
          }
          updates.push(`rating=${result.rating}/${result.reviewCount}`);
          dirty = true;
        }
        if (updates.length) console.log(`  ✓ ${hotel.name} → ${updates.join(", ")}`);
        else console.log(`  ✗ ${hotel.name} — no usable data found`);
      } catch (e) {
        console.log(`  ! ${hotel.name} — ${e.message}`);
      }
      // Be polite — Booking will rate-limit aggressive scrapers.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (dirty) {
    fs.writeFileSync(full, JSON.stringify(doc, null, 2) + "\n", "utf8");
    console.log(`\nWrote ${file}`);
  }
}

async function main() {
  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => /^cities.*\.json$/.test(f))
    .sort();
  for (const f of files) await processCityFile(f);
  console.log("\nDone. Run `npm run build` to regenerate /site with photos.");
}

main().catch((e) => { console.error(e); process.exit(1); });
