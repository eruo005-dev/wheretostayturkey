# Maintenance manual

Everything that exists, where it is, what to do when it breaks.

This is the full operator's reference for `wheretostayturkey.com` — the static site, the build, the CI checks, the affiliate plumbing, the recurring tasks. It's deliberately long. Use the table of contents.

---

## Table of contents

1. [Quick reference](#quick-reference)
2. [Daily commands](#daily-commands)
3. [Configuration](#configuration)
4. [Affiliate plumbing](#affiliate-plumbing)
5. [Hero photos](#hero-photos)
6. [Build pipeline](#build-pipeline)
7. [CI checks](#ci-checks)
8. [Audit scripts](#audit-scripts)
9. [SEO infrastructure](#seo-infrastructure)
10. [Search engines & indexing](#search-engines--indexing)
11. [Performance budgets](#performance-budgets)
12. [Recurring tasks](#recurring-tasks)
13. [Common breakages and fixes](#common-breakages-and-fixes)
14. [Adding new content](#adding-new-content)
15. [Where things live](#where-things-live)

---

## Quick reference

| What | Where |
|---|---|
| Live site | https://wheretostayturkey.com |
| Repo | https://github.com/eruo005-dev/wheretostayturkey |
| Hosting | Vercel — auto-deploys from `main` |
| Build | `node build.js` (no bundler, no framework) |
| Output | `site/` |
| Node version | `.nvmrc` → 20 |
| All affiliate IDs | `site.config.js` |
| All city data | `data/cities*.json` |
| All journal posts | `data/journal-posts.json` |

---

## Daily commands

```bash
# Pull, build, view
git pull origin main
npm run build
npx serve site            # quick local preview at http://localhost:3000

# Run all 4 audits locally
node scripts/broken-link-check.js
node scripts/a11y-survey.js
node scripts/perf-budget.js
node scripts/seo-survey.js

# Push search-engine pings to Bing/Yandex/Seznam/Naver after deploy
# (also auto-runs on every push to main via .github/workflows/indexnow.yml)
node scripts/indexnow-ping.js
```

---

## Configuration

### `site.config.js`

Single source of truth. Edit nothing else for affiliate / brand changes.

| Key | What it does |
|---|---|
| `siteUrl` | Canonical origin used everywhere — change ONCE here, never hard-code |
| `siteName`, `siteTagline`, `siteDescription` | Brand metadata, surfaced in `<title>`/OG/JSON-LD |
| `business.*` | Legal entity info, contact emails (used in About, Privacy, Terms, schemas) |
| `affiliates.*` | Partner credentials, see [Affiliate plumbing](#affiliate-plumbing) |
| `tp.marker`, `tp.trs` | Travelpayouts account ID + source. **DO NOT change these — they identify your account.** |
| `tpPrograms.*` | Per-program `campaignId` + `partnerId`. Fill in `partnerId` when ready (more programs = more revenue). |
| `useHeroPhotos` | `false` by default. Flip to `true` when real photos exist; cards auto-upgrade. |
| `adsense.clientId` | `ca-pub-XXXXXXXXXXXXXXXX` form. The build strips `ca-` for ads.txt automatically. |
| `gaMeasurementId`, `plausibleDomain` | Analytics — set one, both, or neither. Both are gated. |
| `emailCaptureEndpoint` | MailerLite form-action URL. |
| `indexnowKey` | 32-char hex. Verifies ownership for Bing/Yandex submissions. Don't lose this — it's tied to your IndexNow registration. |
| `verificationScripts` | Array of `<script>` snippets injected into `<head>` site-wide. Use for Search Console / Bing Webmaster verification. |

---

## Affiliate plumbing

### Travelpayouts (the umbrella)

The TP account `722878` (source `523094`, "Wheretostayturkey") is connected to 37 programs. Of these, **3 are fully wired** (campaign_id + partner_id both set) and **16 are half-wired** (campaign_id only — links fall through to bare partner URLs without TP attribution).

#### Fully wired (earning)

| Program | campaign_id | partner_id |
|---|---|---|
| Klook | 137 | 4110 |
| Kiwitaxi | 1 | 647 |
| Localrent | 87 | 2043 |
| Trip.com | n/a | uses native Allianceid `8157710` / SID `308782349` |

#### To fully wire the rest

For each program in `tpPrograms` where `partnerId: ""`:

1. Open https://app.travelpayouts.com/tools/links/recent → click "Create link"
2. Pick the program from the dropdown, paste any destination URL
3. Toggle "Show full link"
4. Copy the value of the `p=` parameter from the displayed `tp.media/r?...` URL
5. Paste into `tpPrograms.{program}.partnerId` in `site.config.js`
6. Push — the TP wrapper auto-flips on for that program

Programs waiting to be filled (in order of likely revenue): Tiqets, Airalo, Welcome Pickups, Kiwi.com, Yesim, GetTransfer, VisitorsCoverage, Insubuy, AirHelp, AutoEurope, GigSky, Saily, NordVPN, QEEQ, Eatwith, Ticketmaster.

### Direct (non-TP) affiliates

These are direct partners — apply individually at the partner's affiliate program, paste the credential into the matching `affiliates.{name}` block:

- Booking.com (`affiliates.booking.aid`) — **highest revenue priority**, apply at https://partner.booking.com
- Hotels.com (`hotelsCom.camref`)
- Agoda (`agoda.cid`)
- GetYourGuide (`getYourGuide.partnerId`) — second-highest priority, https://partner.getyourguide.com
- Viator, Civitatis, DiscoverCars, Rentalcars, Holafly, SafetyWing, WorldNomads, Wise, WayAway

Each link builder in `build.js` auto-routes through tp.media when the program has full TP creds; otherwise falls back to direct, unattributed URL. **Empty config never breaks the build** — affiliate URLs just become unattributed links.

### How to verify a wire works

```bash
node -e 'console.log(require("./build.js"))' 2>/dev/null  # builds the link helpers
# OR rebuild and curl-trace the URL
npm run build
grep -oE 'tp\.media/r\?[^"]+' site/istanbul/index.html | head -1
# Then HEAD-trace it to confirm it resolves to the partner with marker preserved
```

---

## Hero photos

Drop a curated photo at `assets/img/heroes/{slug}.{ext}` (jpg / png / webp / avif / svg) and the build picks it up automatically. **No JSON edit, no config flip.**

Filename → entity mapping in [`assets/img/heroes/README.md`](../assets/img/heroes/README.md).

Resolution rule (in `resolveHeroImage()` in `build.js`):

1. Local file in `assets/img/heroes/` — always wins
2. Data-supplied URL when `useHeroPhotos: true`
3. Themed gradient + emoji watermark — current default

Recommended weights: city heroes 1600px ≤ 400KB; showcase cards 1200px ≤ 250KB.

---

## Build pipeline

Single file: `build.js` (~5500 lines). Pure Node, no bundler, no transpiler.

```text
build.js
├── Load + merge data/cities*.json
├── Load journal-posts, collections, regions, experiences, etc.
├── Scan assets/img/heroes/ for local photos
├── Render every page type (homepage, city, programmatic, hub, journal,
│                         collection, region, month, experience, culture,
│                         search, planner, quiz, compare, about, etc.)
├── Generate sitemap.xml (with image entries)
├── Generate robots.txt, ads.txt, IndexNow key file, RSS feed, manifest
├── Copy assets/ → site/assets/
└── Minify HTML (preserves <pre>/<script>/<style>)
```

Adding a new render function:

1. Write `renderFooBar()` that calls `writeFile("foobar/index.html", html)`
2. Wire it into `run()` at the bottom of `build.js`
3. Add it to `renderSitemap()` so it's discoverable
4. Add to `scripts/perf-budget.js` exemption list if it might exceed 160KB

---

## CI checks

`.github/workflows/build-check.yml` — runs on every push + PR. The required steps are:

| Step | Fails on |
|---|---|
| Validate config | Missing `business` or `affiliates` blocks |
| Validate JSON | Any `data/cities*.json` or `data/lead-magnet-*.json` parse error |
| Build site | `node build.js` non-zero exit |
| Verify expected pages | < 200 HTML files OR missing critical pages (homepage, sitemap, 404, etc.) |
| ads.txt format check | `ca-pub-` prefix slipped into ads.txt (the original AdSense Unauthorized bug) |
| Broken links | Any internal href that doesn't resolve |
| Severe a11y | Missing alt, missing input label, weak anchor text, etc. |
| Perf budget | HTML > 160KB / CSS > 70KB / JS > 60KB / render-blocking head scripts |
| SEO survey | Informational-only — emits `::warning::` annotations |

`.github/workflows/indexnow.yml` — fires after every push to `main`, submits sitemap to Bing/Yandex/Seznam/Naver.

`.github/dependabot.yml` — weekly npm + monthly GitHub Actions update PRs.

---

## Audit scripts

All four live in `scripts/`. Each exits 1 on failure (CI uses this) or 0 on pass. Run anytime locally.

| Script | What it checks |
|---|---|
| [`broken-link-check.js`](../scripts/broken-link-check.js) | Every internal `href` in `site/*.html` resolves to a real file or directory |
| [`a11y-survey.js`](../scripts/a11y-survey.js) | WCAG 2.2 AA — missing alt, missing input label, weak anchor text, heading-order skips |
| [`perf-budget.js`](../scripts/perf-budget.js) | HTML / CSS / JS bytes per page + total |
| [`seo-survey.js`](../scripts/seo-survey.js) | Title length 30-70, meta-desc 100-170, JSON-LD presence, og:image presence |

Output styles:

- `broken-link`, `a11y`, `perf-budget` exit `1` on failure → CI fails the build.
- `seo-survey` is informational only → CI emits `::warning::` annotations but doesn't fail.

Plus there are some **one-shot migration scripts** in `scripts/` (fix-broken-links, fix-h4-closers, etc.) that ran during prior cleanups. Safe to delete if you don't want them in the repo, but harmless to keep.

---

## SEO infrastructure

### Structured data (JSON-LD) — every page emits at least one

| Page type | Schema |
|---|---|
| Homepage | WebSite (with SearchAction) + Organization + ItemList(destinations) + SiteNavigationElement |
| City | TouristDestination + Place + GeoCoordinates + GeoShape + PostalAddress + LodgingBusiness × hotels + FAQPage + BreadcrumbList |
| Journal post | BlogPosting + BreadcrumbList |
| Procedural guide (visa, eSIM) | HowTo + BreadcrumbList |
| Collection | ItemList + BreadcrumbList |
| Region | Place (region) + BreadcrumbList |
| About | AboutPage |
| Author | Person + ProfilePage |
| Search | SearchResultsPage |
| Other | WebPage (default fallback) |

The graph is connected via `@id` references — search engines can traverse from any page back to `#website` and `#organization`.

### Sitemap

`site/sitemap.xml` — all 226+ URLs with priority, changefreq, lastmod, and `<image:image>` entries for 122+ pages.

### robots.txt

Allows everything except `/thank-you/` and `/thank-you-combo/` (conversion-confirmation pages, dilute analytics if crawled).

### ads.txt

Auto-generated from `adsense.clientId`. Format: `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`. **The CI guard ensures `ca-pub-` never slips back in.**

### Editorial standards page

`/editorial-standards/` — the methodology page. E-E-A-T trust signal.

---

## Search engines & indexing

### Google

- Verify in Google Search Console at https://search.google.com/search-console — add `wheretostayturkey.com` as a property.
- Submit `/sitemap.xml` once verified.
- Add the verification meta tag (or HTML file) by pasting it into `verificationScripts` in `site.config.js`.

### Bing / Yandex / Seznam / Naver (IndexNow)

Already wired. The IndexNow key file at `https://wheretostayturkey.com/{key}.txt` proves ownership; the GitHub Actions workflow fires `scripts/indexnow-ping.js` after every merge to main, submitting the entire sitemap.

To trigger manually:

```bash
node scripts/indexnow-ping.js
node scripts/indexnow-ping.js --dry-run    # preview without sending
```

### Bing Webmaster Tools

Verify at https://www.bing.com/webmasters — add the verification script to `verificationScripts` in `site.config.js`. (IndexNow is preferred but Bing Webmaster also reports indexing health, search-impressions, etc.)

---

## Performance budgets

Defined in `scripts/perf-budget.js`:

```
HTML page  ≤ 160 KB     (heaviest currently 148.2 KB — `/turkey-couples/`)
CSS total  ≤  70 KB     (currently 63.1 KB)
JS total   ≤  60 KB     (currently 11.5 KB)
0 render-blocking external scripts in <head>
```

Median page weight: ~21 KB. Median is what most users see, not the heaviest.

To bump budgets: edit `BUDGETS` at the top of `scripts/perf-budget.js`. Each bump should be a deliberate trade — write a comment.

---

## Recurring tasks

### Every push to main (automated)

1. **Vercel** rebuilds and deploys
2. **Build check** workflow runs all 4 audits + ads.txt format guard
3. **IndexNow** workflow pings Bing/Yandex/Seznam/Naver

### Weekly (automated)

- **Remote prod-health agent** (configured via Claude Routines) crawls live site, reports regressions / Lighthouse / AID-placeholder reappearance / new partner wirings. Trigger ID: `trig_013p3rWBmc855e1vwYnq3wLr`.
- **Dependabot** opens PRs for npm patches/minors.

### Quarterly (manual)

- **Refresh hotel pricing** — listed prices are quarterly snapshots (March / June / September / December). Update in `data/cities*.json` after rechecking on Booking.com.
- **Refresh visa info** — `build.js` `renderVisa()` text and HowTo schema. Visa rules change.
- **Refresh exchange rates** — `currencyWidget()` in `build.js` uses hardcoded rates with an "as of" date. Update when the date is older than 90 days.
- **Run `node scripts/fetch-hotel-photos.js`** — scrapes Booking listings for any hotels added since last run, populates `bookingPhotoId` and `rating` / `reviewCount`. Idempotent.

### Annually (manual)

- **Re-verify city pages** — re-walk neighborhoods, refresh "last verified" dates.
- **Domain renewal** — check the domain registrar.

### When you have real photos

```bash
# Drop the file:
cp <photo>.jpg assets/img/heroes/cappadocia.jpg

# Push:
git add assets/img/heroes/cappadocia.jpg
git commit -m "Add Cappadocia hero photo"
git push

# Both /cappadocia/ hero AND the Cappadocia card on the homepage
# auto-upgrade. No code edit required.
```

---

## Common breakages and fixes

| Symptom | Cause | Fix |
|---|---|---|
| AdSense flags `ads.txt` as Unauthorized | `ca-pub-` slipped into `adsense.clientId` (somehow) and the format guard hasn't caught it | The CI guard fails the build now. Check the latest workflow run. Strip `ca-` from `adsense.clientId`. |
| 404s on a recently-renamed page | Stale internal hrefs in JSON content | Run `node scripts/broken-link-check.js` locally to find them. Add a redirect to `vercel.json` for old → new URL. |
| Hotel cards lose their booking attribution | Booking AID got cleared or replaced with the placeholder | `grep -ro 'aid=BOOKING_AID' site/` should be 0. The `bookingLink()` helper in `build.js` strips placeholder values. |
| New page > 160KB | Grew too much content or a duplicate `essentialsBlock()` snuck in | Run `node scripts/perf-budget.js` to identify. Either trim content or bump the budget with a deliberate comment. |
| CLS regression on heading swap | Font fallback CSS removed | `@font-face Fraunces Fallback` block in `build.js` `head()`. Don't delete. |
| Speculation Rules causing bandwidth spikes | Too-eager prerender on slow connections | Change `eagerness: "moderate"` → `"conservative"` in the speculationrules `<script>` in `tail()`. |
| TP marker missing from any built URL | The link builder fell through to the direct partner URL because `partnerId` is empty | Either fill the partnerId in `tpPrograms.{name}.partnerId` (preferred) or accept that traffic is unattributed for that partner. |

---

## Adding new content

### Add a city

1. Add city object to one of `data/cities*.json` (or create a new `cities-extras-N.json`).
2. Required fields: `slug`, `name`, `emoji`, `tagline`, `summary`, `bestFor`, `idealNights`, `whenToGo`, `mapQuery`, `mapEmbed`, `heroSearch`, `areas`, `hotels`, `faqs`.
3. Optional: `heroImage`, `lastVerified`.
4. Add geo coordinates to `CITY_GEO` in `build.js` — lat/lng + region (Marmara / Aegean / Mediterranean / Black Sea / Central Anatolia / Southeastern Anatolia).
5. Add palette to `CITY_PALETTES` in `build.js` (two hex colors + theme name).
6. Run `npm run build`. The new city auto-appears on the homepage grid, gets its own `/{slug}/` page, gets all programmatic `/{slug}/families/`, `/{slug}/couples/`, etc.

### Add a journal post

1. Add to `data/journal-posts.json` `posts` array.
2. Required: `slug`, `title`, `subtitle`, `summary`, `tags`, `publishedAt`, `bodyHtml`, `readMinutes`.
3. `bodyHtml` should start with an `<h2>` heading (a11y). Use `<h3>` for subsections.
4. If the post targets a city, include the city slug in `tags` — the build auto-injects a related-city CTA + city-tailored lead magnet.

### Add a collection

1. Add to `data/collections.json`.
2. Required: `slug`, `title`, `subtitle`, `intro`, `picks` (array of `{ city, hotelName, area, tier, priceFrom, whyForThisList }`).
3. Optional: `criteria`, `verdict`.
4. Add to `COLLECTION_THEME` in `build.js` (emoji + palette).

---

## Where things live

```
.
├── build.js                       # The whole build pipeline
├── site.config.js                 # Single source of truth for config
├── package.json                   # `npm run build` runs build.js
├── vercel.json                    # Hosting config: redirects, headers, HSTS, Link
├── .nvmrc                         # Node version pin
├── data/
│   ├── cities.json                # First batch of cities
│   ├── cities-extras-*.json       # Subsequent batches (build merges all)
│   ├── journal-posts.json         # All journal articles
│   ├── collections.json           # Themed hotel collections
│   ├── regions.json               # 5 Turkish regions
│   ├── experiences.json           # 6 cultural experiences
│   ├── cultural-concepts.json     # 6 cultural concepts
│   ├── months.json                # 12 monthly guides
│   ├── day-trips.json             # Per-city day trips
│   ├── city-theme-intros.json     # Long-form intros per city/theme
│   ├── lead-magnet-*.json         # Itinerary content for /thank-you/
│   ├── turkish-localization.json  # Phrase data for /turkish-phrases/
│   ├── turkish-microcopy.json     # Inline UI Turkish phrases
│   └── _research/                 # Working notes, not built
├── assets/
│   ├── css/                       # Source CSS (not minified)
│   ├── js/                        # main.js, filters.js (deferred)
│   └── img/heroes/                # Drop hero photos here, README.md inside
├── scripts/                       # Audit + migration scripts
├── docs/
│   └── MAINTENANCE.md             # This file
├── emails/                        # Email autoresponder templates
├── .github/
│   ├── workflows/
│   │   ├── build-check.yml        # CI: build + 4 audits
│   │   ├── indexnow.yml           # CI: ping Bing/Yandex on push to main
│   │   └── deploy.yml             # Cloudflare Pages deploy (legacy alt)
│   ├── PULL_REQUEST_TEMPLATE.md   # Required PR description fields
│   └── dependabot.yml             # Weekly npm + monthly Actions updates
├── site/                          # Build output. .gitignore'd. Vercel deploys this.
└── README.md                      # Public-facing entry point
```

---

## Contact

Anything in this manual is wrong, stale, or unclear: open a PR or email `editorial@wheretostayturkey.com`.
