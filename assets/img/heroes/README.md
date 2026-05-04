# Hero photos

Drop a curated photo here named after the slug — the build picks it up automatically.

## Filename → entity

| Filename                                   | What it overrides                        |
|--------------------------------------------|-------------------------------------------|
| `istanbul.jpg`                             | City hero on `/istanbul/` + showcase card |
| `cappadocia.jpg`                           | City hero on `/cappadocia/` + showcase    |
| `cave-hotels-cappadocia.jpg`               | Collection card on `/best-of-turkey/`     |
| `aegean-coast.jpg`                         | Region card on `/regions/`                |
| `april-in-turkey.jpg`                      | Month card on `/turkey-by-month/`         |
| `cay-culture.jpg`                          | Experience card on `/experiences/`        |
| `misafirperverlik-turkish-hospitality.jpg` | Culture card on `/culture/`               |

City slugs match `data/cities*.json[*].slug`. Collection / region / month / experience / culture slugs match the corresponding JSON files.

## Accepted extensions

`jpg`, `jpeg`, `png`, `webp`, `avif`, `svg` — first match wins.

## Aspect ratio

Cards crop to `16:10` (object-fit: cover). City hero crops to `60vh × 100vw`. Anything reasonably landscape works; **1600×1000+** is comfortable on retina.

## Resolution / weight

- Showcase cards: 1200px wide is plenty (CSS caps at ~600px column).
- City hero: 1600px wide for retina.
- Aim for **150–400 KB** per JPG. Heavy images blow LCP.

## Override priority

1. Local file in this folder — always wins.
2. Data-supplied `heroImage` URL (in `data/cities*.json` etc.) — used when `useHeroPhotos: true` in `site.config.js`.
3. Themed gradient + emoji — fallback when neither exists.

## License

Whatever you drop here ships with the site. Use:

- Photos you took yourself.
- Stock you bought (Adobe Stock, iStock, Shutterstock).
- CC-BY / CC-BY-SA images **with attribution added to `/about/#photo-credits`** in `build.js`.
- Public domain (CC0, USGov-PD, etc.) — no attribution required but credit is polite.

Do **not** drop in random Google Images results — those are almost always copyrighted.
