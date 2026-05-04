<!-- The Build check workflow runs automatically on every PR. The bullets
     below are reviewer-facing — explain WHAT changed and WHY, then run
     the local pre-flight steps. -->

## What

<!-- One paragraph: what this PR changes, in plain English. Skip if it's
     a one-line typo fix. -->

## Why

<!-- The reason this change exists — bug ticket, audit finding, user
     report, performance budget breach, etc. Link issues if relevant. -->

## How (any reviewer-relevant detail)

<!-- Tradeoffs, alternatives considered, anything that would help a
     fresh reviewer make sense of the diff. Skip for trivial PRs. -->

## Pre-flight checks

Run these locally before requesting review. CI runs the same steps.

```bash
npm run build
node scripts/broken-link-check.js
node scripts/a11y-survey.js
node scripts/perf-budget.js
node scripts/seo-survey.js
```

- [ ] `npm run build` succeeds (`✓ Build complete`)
- [ ] `broken-link-check` reports `0 broken`
- [ ] `a11y-survey` reports `Severe (fail): 0`
- [ ] `perf-budget` reports `✓ All budgets met`
- [ ] `seo-survey` reviewed — any new `<100` or `>170` char meta descriptions are intentional
- [ ] If touching affiliate URLs: `grep -ro 'aid=BOOKING_AID' site/` returns 0 (no placeholder leak)
- [ ] If touching JSON data: `node -e 'JSON.parse(require("fs").readFileSync("data/<file>"))'` parses cleanly

## Screenshots

<!-- Required for any visual change — homepage, showcase cards, hero, nav, etc.
     Drag & drop into the textbox; GitHub uploads them automatically. -->
