# Changelog

This file records every PR merged to `main`. Newer entries on top.

## Unreleased

- Operator self-maintenance pack: GitHub Actions IndexNow auto-ping on push-to-main, `.nvmrc` pin, Dependabot config, full operator manual at [docs/MAINTENANCE.md](docs/MAINTENANCE.md).

## 2026-05-04

- **PR #11** — Schema enrichment: Place + GeoCoordinates + GeoShape + PostalAddress on every city page, Person + ProfilePage with `knowsAbout` / `knowsLanguage` / `jobTitle` on author. Footer column titles `<h4>` → `<h3 class="footer-col-h">` (closes a homepage h2 → h4 skip).
- **PR #10** — Real `/search/` page with 103-entry client-side index across cities / journal / collections / regions / experiences / culture / months / guides. Wires the WebSite SearchAction `urlTemplate` to actual `?q=` deep links. New nav search icon. A11y heading-skip cleanup round 2 (41 → 15 soft warnings).
- **PR #9** — CI safety nets. `build-check.yml` now runs `broken-link-check.js`, `a11y-survey.js`, `perf-budget.js`, `seo-survey.js` and an inline `ads.txt` format guard on every PR. New `.github/PULL_REQUEST_TEMPLATE.md`.
- **PR #8** — A11y WCAG 2.2 AA pass. Severe violations 23 → 0. Strong `:focus-visible`, 44×44 tap targets, `prefers-reduced-motion`, `.visually-hidden` helper, heading-hierarchy fixes across programmatic/collection/day-trips/tours pages, disclosure banner anchor text. Plus the AdSense `ads.txt` Unauthorized fix (strip `ca-` prefix).
- **PR #7** — Core Web Vitals deep pass. Font fallback `@font-face` with `size-adjust` (CLS=0 swap), Speculation Rules API for prerender-on-hover, `content-visibility: auto` on below-fold sections, `contain: layout style` on cookie banner, Vercel `Link:` early-hints + HSTS, `scripts/perf-budget.js` enforcement.

## 2026-05-03

- **PR #6** — 10-phase SEO hardening. `seoTitle()` + `seoDescription()` helpers (titles 156 → 182 ideal, descriptions 46 → 1 too-short). Homepage knowledge graph (WebSite + Organization + ItemList + SiteNavigationElement, all `@id`-linked). FAQPage on 22 cities, HowTo on visa + eSIM, image sitemap (122 entries). Default WebPage JSON-LD fallback. New `/editorial-standards/` E-E-A-T page. IndexNow protocol wired with `scripts/indexnow-ping.js`.
- **PR #5** — Showcase grid extended to `/experiences/`, `/culture/`, `/turkey-by-month/` (12 monthly cards, season-grouped palettes). Plus auto-wire local hero photos: drop a JPG at `assets/img/heroes/{slug}.{ext}` and the build picks it up across the city hub AND every showcase card. New `resolveHeroImage()` resolver.
- **PR #4** — Travelpayouts affiliate wire-up. Pulled real campaign IDs from the operator's TP dashboard via Chrome MCP. Klook (campaign 137 / partner 4110), Kiwitaxi (1 / 647), Localrent (87 / 2043) now ship with full TP attribution. 16 more programs configured with campaign_id (waiting for partner_id). 198 `marker=722878` references in built site (was 22 before).
- **PR #3** — Showcase grid on `/best-of-turkey/` + `/regions/` hubs. Per-collection emoji + palette (💍 honeymoon, 👨‍👩‍👧 family, 🏛️ historic, 🏖️ beachfront, 🏞️ cave, ✨ luxury). Per-region emoji + palette (🌊 Aegean, ⛱️ Mediterranean, 🎈 Cappadocia, 🌲 Black Sea, 🕌 Eastern Anatolia). Generalized `showcaseCard()` helper.
- **PR #2** — Homepage destinations grid rebuilt as Guide-to-Europe-style showcase: photo or themed-art card with country chip, editor's-pick badge, "See more →" CTA, plus left-sidebar destination filter (search + checkboxes + grid/list toggle + sort).

## 2026-05-02

- **PR #1** — Initial audit fixes. Booking AID `BOOKING_AID` placeholder leak fixed across 903 affiliate URLs in 127 pages. 13 broken internal links repaired. Vercel redirects added for legacy URLs. apple-touch-icon naming fix. Google Fonts deferred. HTML minification. Removed dead AdSense config code, moved 11 unused research JSON files to `data/_research/`, fixed cookie-banner duplication on `/planner/`. Showcase grid setup begun.

---

## Format note

Each entry should describe **what shipped** and **why it matters**, not the diff. The session that produced these PRs added a complete content site to a previously-empty repo skeleton — broken-link-free, schema-rich, performance-budgeted, accessibility-clean, and continuously CI-checked.
