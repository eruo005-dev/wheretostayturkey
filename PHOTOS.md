# Photo workflow

The site is wired to use real photography per city. When `cities.json` has a
`heroImage` field on a city, the build:

1. Renders a real photo as the city hero (with dark gradient overlay so headlines stay readable)
2. Replaces the city card on the homepage with the same photo (subtle zoom-on-hover)
3. Replaces the per-city Open Graph image so social previews show real photography

When `heroImage` is missing, the build silently falls back to the SVG illustration.
You can roll photography out one city at a time without breaking anything.

## How to add a photo (5 minutes per city)

1. Open the Unsplash search URL for the city (links below). All of these are free
   and use the Unsplash license — no attribution legally required, but you can
   credit the photographer if you want to.
2. Click a photo you like.
3. Click the green **Download free** arrow next to the button → choose **Original Size**.
   This copies the direct image URL to your clipboard.
4. Open `data/cities.json` (or `cities-extras-1.json` / `cities-extras-2.json`
   depending on which file holds the city — see "Where each city lives" below).
5. Add a `"heroImage": "PASTE_URL"` line. Keep the existing fields; just add this one.
6. Run `npm run build`.
7. Drag the rebuilt `site/` folder back to Cloudflare Pages.

## Search URLs per city

Each link is a curated Unsplash search you can browse and pick from:

### Tier 1 — your highest-traffic pages (do these first)
- Istanbul — https://unsplash.com/s/photos/istanbul-turkey
- Cappadocia — https://unsplash.com/s/photos/cappadocia
- Antalya — https://unsplash.com/s/photos/antalya

### Tier 2 — coastal cities
- Bodrum — https://unsplash.com/s/photos/bodrum-turkey
- Fethiye — https://unsplash.com/s/photos/fethiye-oludeniz
- Marmaris — https://unsplash.com/s/photos/marmaris
- Kaş — https://unsplash.com/s/photos/kas-turkey
- Side — https://unsplash.com/s/photos/side-turkey
- Alanya — https://unsplash.com/s/photos/alanya
- Kuşadası — https://unsplash.com/s/photos/kusadasi

### Tier 3 — Aegean & inland
- Izmir — https://unsplash.com/s/photos/izmir-turkey
- Pamukkale — https://unsplash.com/s/photos/pamukkale
- Bursa — https://unsplash.com/s/photos/bursa-turkey
- Ankara — https://unsplash.com/s/photos/ankara-turkey

### Tier 4 — Black Sea & southeast
- Trabzon — https://unsplash.com/s/photos/trabzon
- Rize — https://unsplash.com/s/photos/rize-turkey-ayder
- Mersin — https://unsplash.com/s/photos/mersin-turkey-mediterranean
- Gaziantep — https://unsplash.com/s/photos/gaziantep

## What makes a good hero photo

- **Landscape orientation, 1600px+ wide.** Portrait photos crop badly.
- **Identifiable subject.** Hagia Sophia from outside, Cappadocia balloons at
  sunrise, Antalya's old harbor — visitors should recognize what they're seeing.
- **Some sky or negative space at the top.** The site overlays a dark gradient
  for text legibility; busy compositions throughout the frame don't work.
- **Avoid people as the focal point.** Privacy edge cases + faces age fast.
- **Avoid heavy filtering.** A neutral, properly-exposed photo always beats a
  saturated Instagram filter.

## URL format

Always use the `?w=1600&q=80&auto=format&fit=crop` querystring at the end. This
makes Unsplash's CDN serve the right size at the right quality automatically:

```
https://images.unsplash.com/photo-XXXXXXXXXX?w=1600&q=80&auto=format&fit=crop
```

## Where each city lives

| File | Cities |
|---|---|
| `data/cities.json` | Istanbul, Cappadocia, Antalya, Bodrum, Fethiye, Izmir, Pamukkale, Marmaris, Kaş, Trabzon |
| `data/cities-extras-1.json` | Alanya, Side, Kuşadası, Mersin |
| `data/cities-extras-2.json` | Rize, Ankara, Gaziantep, Bursa |

## Optional: credit the photographer

If you want a small credit line at the bottom of the hero, add `heroImageCredit`:

```json
"heroImage": "https://images.unsplash.com/photo-...?w=1600&q=80",
"heroImageCredit": { "name": "Photographer Name", "url": "https://unsplash.com/@theirhandle" }
```

(Credit rendering is wired but optional.)

## Backup plan: AI illustration

If you can't find a good photo for a smaller city (Mersin, Rize, etc.), the
SVG illustration that's already there is a deliberate stylistic choice. Don't
substitute a wrong-city photo or an AI-generated photoreal image — both hurt
trust more than the SVG ever could.

For larger illustration-style imagery (clearly artwork, never photos), Midjourney
v6.1 with `--style raw --stylize 50 --ar 16:9` and prompts ending
`"watercolor illustration, editorial, soft palette"` produces good results.
Save as PNG, drop in `site/assets/img/cities/`, point `heroImage` at the local path.
