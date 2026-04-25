# Where to Stay in Turkey

A static, affiliate-driven decision engine for Turkey hotel bookings. 116 pages, 22 monetization partners wired, zero backend. Deploys free to Cloudflare Pages / Netlify / Vercel.

## What's in the box

**116 pages generated from data:**

- 1 homepage
- 18 city hubs (Istanbul, Cappadocia, Antalya, Bodrum, Fethiye, Izmir, Pamukkale, Marmaris, Kaş, Trabzon, Alanya, Side, Kuşadası, Mersin, Rize, Ankara, Gaziantep, Bursa)
- 65 programmatic SEO pages (luxury / budget / families / couples per city)
- 18 per-city tour pages (targeting "things to do in X" queries)
- 4 cross-city collection pages (luxury / families / couples / off-beaten-path)
- 4 planning guides (visa, safety, transport Istanbul↔Cappadocia, best time to visit, how many nights)
- 1 interactive decision quiz
- 1 guides hub
- 2 lead-magnet pages (3-day Istanbul + 5-day Istanbul/Cappadocia combo)
- About page

**22 monetization partners wired**, each one flipped on/off by whether you've pasted its ID into `site.config.js`:

- Hotels: Booking.com, Hotels.com, Agoda, Trip.com, Hostelworld, Vrbo
- Tours: GetYourGuide, Viator, Klook, Tiqets, Civitatis
- Transfers & car rental: Welcome Pickups, Kiwitaxi, Discover Cars, Rentalcars.com
- Essentials: Airalo, Holafly, SafetyWing, World Nomads, Wise
- Flights: Kiwi.com, WayAway

**SEO & infrastructure:**
- JSON-LD structured data on every page (BreadcrumbList, TouristDestination, FAQPage, ItemList, Organization, WebSite)
- Auto-generated sitemap.xml with 114 indexable URLs
- robots.txt disallowing /thank-you/ conversion pages
- Per-city OG images (1200×630 SVG)
- Google Places fetcher for auto-discovery of new hotels (`scripts/fetch-hotels.js`)
- GitHub Actions workflow for Cloudflare Pages deploy
- 7-email drip sequence ready to paste into ConvertKit/Mailchimp
- Print-optimized CSS so the itinerary pages double as PDFs

**Conversion layer:**
- Mobile sticky CTA
- Exit-intent modal for email capture
- Redirect-to-/thank-you/ post-capture for immediate upsell
- Per-hotel "Compare: Hotels.com · Agoda" rows (auto-enable when you paste IDs)
- Inline affiliate strips on every city page: Experiences, Getting around, Essentials
- Interactive decision quiz at /quiz/

## 10-minute launch checklist

1. Apply for Booking.com Partner at [partner.booking.com](https://partner.booking.com). Your `aid` is the minimum to earn revenue.
2. Open `site.config.js`. Fill in IDs you already have — blank fields simply hide those modules. At minimum set `affiliates.booking.aid`, `siteUrl`, and `emailCaptureEndpoint` (free via [Formspree](https://formspree.io)).
3. `npm run build`.
4. Deploy `/site`:
   - **Cloudflare Pages** (recommended): add secrets (`CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_PROJECT_NAME`) to the GitHub repo, then every push deploys automatically via `.github/workflows/deploy.yml`.
   - **Netlify**: drag the `site/` folder into the dashboard.
   - **Vercel**: `vercel --prod` with output dir `site`.
5. Point your domain, enable SSL, you're live.

## Stacking affiliate revenue

The site was built so you can progressively turn on more revenue channels without touching templates. Recommended priority:

1. **Week 1 — Booking.com.** Primary hotel revenue.
2. **Week 1 — GetYourGuide.** Tours convert unusually well — Cappadocia balloons, Bosphorus cruises. Higher commission % than hotels.
3. **Week 2 — Welcome Pickups + Discover Cars.** Transfer/car rental modules already render; just need the ref param.
4. **Week 3 — Hotels.com + Agoda.** Adds "Compare: Hotels.com · Agoda" rows under every hotel card. Free uplift.
5. **Week 4 — Airalo + SafetyWing.** High-intent visitors — one-click affiliate wins.
6. **Month 2+ — Flights (Kiwi/WayAway), AdSense once you have traffic.**

## Running the build

```bash
npm run build   # regenerate /site
npm run dev     # build + serve at http://localhost:4000

# Fetch new hotel candidates from Google Places
GOOGLE_PLACES_API_KEY=AIza... node scripts/fetch-hotels.js istanbul
```

## Adding a city manually

1. Open any `data/cities*.json` — files are split so none gets too large.
2. Copy an existing city block, change slug/name/emoji/areas/hotels.
3. `npm run build`. Pages, internal links, sitemap, and structured data all regenerate.

## File layout

```
wheretostayturkey.com/
├── site.config.js                       ← 22 affiliate partners config
├── data/
│   ├── cities.json                      ← first 10 cities
│   ├── cities-extras-1.json             ← Alanya, Side, Kuşadası, Mersin
│   ├── cities-extras-2.json             ← Rize, Ankara, Gaziantep, Bursa
│   ├── lead-magnet-istanbul.json        ← 3-day itinerary content
│   ├── lead-magnet-combo.json           ← 5-day Istanbul+Cappadocia content
│   └── _staging/                        ← Places API output awaiting review
├── scripts/
│   └── fetch-hotels.js                  ← Google Places discovery
├── emails/
│   └── drip-sequence.md                 ← 7-email autoresponder templates
├── .github/workflows/
│   └── deploy.yml                       ← Cloudflare Pages deploy
├── build.js                             ← generator
├── assets/ (css, js, img)
├── site/                                ← build output (DEPLOY THIS)
├── package.json
└── README.md
```

## Conversion design decisions

- Every hotel card has a primary Booking CTA plus (when configured) a `Compare: Hotels.com · Agoda · Trip.com` row.
- Three monetization strips (**Experiences** / **Getting around** / **Essentials**) on every city page capture visitors not booking a hotel today.
- Mobile sticky CTA makes booking one tap.
- Top-of-page comparison table on every city lets scanners pick an area instantly.
- Programmatic pages target long-tail intent ("Luxury hotels in Cappadocia", "Best hotels in Istanbul for families").
- Lead magnets (Istanbul 3-day + combo 5-day) capture emails from visitors not ready to book, routed into a 7-email drip.
- /quiz/ turns undecided visitors into committed city-pickers in 60 seconds — shareable as TikTok content.
- /thank-you/ and /thank-you-combo/ are the site's highest-converting pages: users arrive having just handed over an email and immediately see 3 pre-booking CTAs (eSIM, transfer, tours).

## What to do next

1. **Get a Booking.com aid, a GetYourGuide partner ID, and a Formspree endpoint.** That's the minimum viable revenue stack. 30 minutes of applications.
2. **Wire the GitHub Actions deploy** (5 min after creating a Cloudflare Pages project).
3. **Paste the email drip sequence** into a mailing tool (Beehiiv free tier works).
4. **Start a TikTok.** Every city page has a screenshot-friendly comparison table. Post one per week.
5. **Run the Places fetcher** on the 18 cities to discover 5–10 more hotels each that you can add to `cities*.json` over time.

## License

Code: MIT. Content: © the operator, not redistributable without permission.
