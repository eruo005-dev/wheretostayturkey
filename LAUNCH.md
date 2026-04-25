# Launch — single source of truth

Everything you need to flip the site live. Read top-to-bottom; do them in order.

The site already builds clean (121 pages, 0 errors, certified). What's left is
operational: real account credentials, a deploy, and DNS.

---

## ⏱ 30 minutes total — site goes live with revenue active

### 1. Apply for Booking.com Partner — 10 minutes
[partner.booking.com](https://partner.booking.com) → Sign up → Submit your domain
(yes, you can submit before the domain has a site live). Approval is usually
same-day for legitimate-looking sites. They send you an `aid` (a 6-8 digit number).

→ Open `site.config.js`, replace `"BOOKING_AID"` with your number.

### 2. Create a Formspree form — 2 minutes
[formspree.io](https://formspree.io) → New Form. Free tier is 50 submissions/month
(plenty for v1). Copy the endpoint URL.

→ In `site.config.js`, replace `"https://formspree.io/f/YOUR_FORM_ID"` with the URL.

### 3. Fill in your business info — 5 minutes
In `site.config.js → business`:
- `legalName` — your name or company name
- `contactEmail`, `supportEmail`, `privacyEmail` — three real addresses (can
  forward to one inbox)
- `postalAddress` — a real mailing address. **Don't use your home.** Spend $10/mo on
  [iPostal1](https://ipostal1.com) for a virtual mailbox.

### 4. Rebuild — 30 seconds
```bash
cd C:\Users\eruo0\Documents\Claude\Projects\wheretostayturkey.com
npm run build
```

### 5. Deploy to Cloudflare Pages — 5 minutes
1. [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) — sign up free
2. Workers & Pages → Create application → Pages → **Upload assets**
3. Project name: `wheretostayturkey`
4. Drag the `site/` folder onto the upload zone
5. Click Deploy
6. You get a `wheretostayturkey-xxx.pages.dev` URL in 60 seconds

### 6. Connect your domain — 5 minutes
- In your Pages project: **Custom domains** → Set up custom domain → enter `wheretostayturkey.com`
- If your domain is on Cloudflare: one click, SSL provisions automatically
- If it's elsewhere: Cloudflare gives you DNS records to paste at your registrar

**You're live.**

---

## 📅 Week 1 — More revenue channels

The site renders 22 affiliate partners' modules but only earns commission on the
ones with real IDs. Add these in priority order. Each one is 5 minutes.

| Priority | Partner | Apply at | Field in `site.config.js` |
|---|---|---|---|
| 1 | GetYourGuide (tours) | partner.getyourguide.com | `getYourGuide.partnerId` |
| 2 | Welcome Pickups (transfers) | welcomepickups.com/partner | `welcomePickups.ref` |
| 3 | Airalo (eSIM) | partners.airalo.com | `airalo.ref` |
| 4 | Hotels.com (via Expedia) | expediagroup.com/partner-solutions | `hotelsCom.camref` |
| 5 | Discover Cars | discovercars.com/affiliate | `discoverCars.aAid` |
| 6 | Agoda | partners.agoda.com | `agoda.cid` |
| 7 | SafetyWing (insurance) | safetywing.com/affiliates | `safetywing.ref` |

After each application gets approved: paste the ID, run `npm run build`, redeploy.

---

## 📅 Week 1 — Search visibility

### Google Search Console
1. [search.google.com/search-console](https://search.google.com/search-console) → Add property
2. Verify via DNS TXT record (Cloudflare: 2 clicks)
3. Submit sitemap: `https://wheretostayturkey.com/sitemap.xml`

### Bing Webmaster Tools
[bing.com/webmasters](https://www.bing.com/webmasters) — same flow. Bing/Yahoo combined
are ~5% of search traffic; worth the 3 minutes.

### Internet Archive
Submit the homepage to [web.archive.org](https://web.archive.org) so there's a
permanent record. Helps with E-E-A-T over time.

---

## 📅 Week 1-2 — Content polish

Open `PHOTOS.md` for the photo-adding workflow. Do Istanbul + Cappadocia + Antalya
first (your top SEO pages). Plan: one photo per day for 2-3 weeks.

Open `emails/drip-sequence.md` and paste the 7 emails into your mail tool of
choice. Beehiiv free tier (up to 2,500 subscribers) is the easiest start.

---

## 📅 Month 1 — Distribution

The site is structurally ready for organic search but Google takes 3-6 months
to start ranking new domains. While you wait:

- **TikTok / Instagram:** Screenshot a city page's comparison table → add a
  voiceover ("Where to stay in Istanbul: a 30-second decision"). The tables
  were designed for exactly this. Post one per week.
- **Reddit:** r/TurkeyTravel, r/solotravel, r/travel. Find threads asking
  "where should I stay in [city]" — answer helpfully, link only when genuinely
  relevant (Reddit hates promo).
- **Pinterest:** Each city's Open Graph image works as a Pin. Submit cities
  + collections (luxury, family, off-beaten-path) to Pinterest with optimized
  alt text.

---

## 🛠 Operating the site after launch

### Adding a new city
1. Open the relevant `data/cities-extras-*.json` file (or create a new
   `data/cities-extras-3.json` — the build merges all `cities*.json` files)
2. Copy an existing city block, change slug, name, areas, hotels
3. `npm run build`, redeploy

### Finding hotels for a new city
```bash
GOOGLE_PLACES_API_KEY=AIza... node scripts/fetch-hotels.js mardin
```
Outputs to `data/_staging/{slug}-hotels.json`. Hand-pick the best, paste into
the city's `hotels` array.

### Updating prices / hotel list
Edit `data/cities*.json` directly, rebuild, redeploy. Update the city's
`lastVerified` date when you do.

### Adding restaurants per neighborhood
Each area in `cities.json` accepts an optional `restaurants` array (component
not yet rendering — easy to wire when you're ready to populate). Until then,
restaurants live in lead-magnet itinerary content.

---

## 🚨 Things you must NOT skip before going live

1. ❌ Promote the site to anyone before steps 1-6 above are done
2. ❌ Send marketing email until your real `postalAddress` is in the privacy
   policy and the unsubscribe footer (CAN-SPAM, $51,744/violation)
3. ❌ Use `apple-touch-icon.png.svg` as your final touch icon — convert to
   real 180x180 PNG and replace the file. iOS won't recognize SVG.
4. ❌ Forget to flip `Plausible` or `gaMeasurementId` on after you have
   traffic — you can't measure what you don't track

---

## 📊 What success looks like

| Month | Realistic |
|---|---|
| 1 | 100-500 organic visits / month, $0-10 revenue |
| 3 | 1k-5k visits, $20-100 revenue |
| 6 | 10k-50k visits, $200-1500 revenue |
| 12 | 50k-200k visits, $1500-8000 revenue |

These ranges assume you do the content/distribution work. Sites that just
deploy and wait earn nothing. Sites that post consistent content and get
backlinks compound.

---

## 🆘 If something breaks

```bash
# Check build
node --check build.js && node build.js

# Check JSON
node -e "JSON.parse(require('fs').readFileSync('data/cities.json','utf8'))"

# Verify config
node -e "console.log(require('./site.config').business)"

# Local preview
npm run dev   # http://localhost:4000
```

If the build hangs, the most common cause is a JSON syntax error in
`data/cities*.json`. Each file must end with `}`. The `data/` folder shouldn't
have stray characters. Sentry of "duplicate slug" warnings just means a city
appears in multiple files — harmless but worth cleaning up.

---

**Built it. Now ship it.**
