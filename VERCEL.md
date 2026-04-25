# Deploying to Vercel via GitHub

The clean, low-config path. Vercel's Git integration handles everything; you
push to GitHub, Vercel rebuilds and redeploys automatically.

**Total time: 10 minutes for first deploy, then it's automatic forever.**

---

## Prerequisites

- A GitHub account (free)
- A Vercel account (free for hobby projects — sign up at [vercel.com](https://vercel.com) using your GitHub account, it auto-links)
- Git installed locally — check with `git --version`

---

## Step 1: Initialize the repo locally (3 minutes)

Open a terminal in your project folder.

```bash
cd "C:\Users\eruo0\Documents\Claude\Projects\wheretostayturkey.com"

git init
git add .
git commit -m "Initial commit"
```

If git asks who you are first time:
```bash
git config --global user.email "your@email.com"
git config --global user.name "Your Name"
```

Then re-run the commit.

---

## Step 2: Create the GitHub repo (2 minutes)

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `wheretostayturkey` (or whatever you want — doesn't matter)
3. Visibility: **Private** is fine. Public is also fine. Vercel works with both.
4. **Do NOT** check "Add a README" or "Add .gitignore" — we already have those
5. Click "Create repository"
6. GitHub shows you a "push existing repository" command box. Copy and run those two lines locally:

```bash
git remote add origin https://github.com/YOUR_USERNAME/wheretostayturkey.git
git branch -M main
git push -u origin main
```

If GitHub asks for a password and rejects yours: it now requires a Personal Access Token instead. Generate one at [github.com/settings/tokens](https://github.com/settings/tokens) (classic, with `repo` scope), use that as the password.

---

## Step 3: Import to Vercel (3 minutes)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click "Import Git Repository"
3. Select your `wheretostayturkey` repo from the list
4. Vercel detects settings automatically from `vercel.json`. You should see:
   - Build Command: `node build.js`
   - Output Directory: `site`
   - Framework Preset: Other
5. Leave everything else default. Click **Deploy**.
6. ~60 seconds later: live URL like `wheretostayturkey-xxxxx.vercel.app`. Click it. Site loads.

You're live.

---

## Step 4: Connect your domain (2 minutes)

1. In your Vercel project: Settings → Domains
2. Type your domain: `wheretostayturkey.com`
3. Vercel shows you DNS records to configure. Two options:
   - **If your domain is registered with Vercel**: One click, automatic
   - **If your domain is at another registrar** (Namecheap, GoDaddy, Cloudflare Registrar, etc.): Vercel gives you an A record (`76.76.21.21`) or CNAME — paste it into your registrar's DNS panel
4. SSL provisions automatically within 1–10 minutes
5. Add `www.wheretostayturkey.com` as a redirect to the apex domain (Vercel does this automatically when you click "Add www variant")

---

## How redeploys work

After step 3, **Vercel watches your GitHub repo**. Any time you `git push`:

```bash
git add .
git commit -m "Updated Istanbul hotels"
git push
```

Vercel detects the push, runs `node build.js`, deploys the new `site/` folder. Live in ~60 seconds. **No manual upload, no dashboard clicks, no CLI needed.**

You also get:
- **Preview URLs for branches**: every non-main branch gets its own preview URL (`wheretostayturkey-feature-foo.vercel.app`) — useful for testing changes
- **Pull request previews**: open a PR and Vercel posts the preview URL as a comment automatically
- **Build check**: GitHub Actions runs `.github/workflows/build-check.yml` to validate the build on every PR — catches broken JSON before it goes live

---

## What's in `vercel.json`

The config file at the project root tells Vercel:

```json
{
  "buildCommand": "node build.js",     // run our generator
  "outputDirectory": "site",           // serve from /site
  "framework": null,                   // not Next/Astro/etc — pure static
  "headers": [...],                     // CDN cache + security headers
  "redirects": [...]                    // /home → /, /index → /
}
```

The cache headers tell Vercel's CDN:
- Hash-named assets (CSS/JS at fixed paths) cache for 1 year (`immutable`)
- Images cache for 30 days
- HTML pages don't cache (Vercel handles HTML caching dynamically)

Security headers enforce:
- `X-Content-Type-Options: nosniff` (prevents MIME confusion attacks)
- `X-Frame-Options: SAMEORIGIN` (your site can't be iframed by other domains)
- `Referrer-Policy: strict-origin-when-cross-origin` (privacy-respecting referrer)
- `Permissions-Policy: interest-cohort=()` (opts out of Google FLoC ad targeting)

---

## Updating the site after launch

| Task | What to do |
|---|---|
| Change a hotel | Edit `data/cities*.json`, commit, push. Live in 60s. |
| Add a city | Add to `data/cities-extras-2.json` or new file `cities-extras-3.json`, commit, push. |
| Update affiliate IDs | Edit `site.config.js`, commit, push. |
| Test before launch | Push to a branch other than main → Vercel makes preview URL. |
| Roll back | Vercel project → Deployments → click any older deployment → "Promote to Production" |

---

## Free-tier limits (hobby plan)

Vercel's free tier covers basically everything for this site:
- **100 GB bandwidth / month** — enough for ~500k page views
- **Unlimited deployments**
- **Custom domains**
- **Automatic SSL**
- **Preview URLs**

You only need to upgrade when bandwidth exceeds 100 GB or you want priority support.

---

## Troubleshooting

**Build fails on Vercel.** Check the build logs in Vercel dashboard → Deployments → failed build → "Building" log. Most common causes:
- Syntax error in `data/cities*.json` → run locally: `node -e "JSON.parse(require('fs').readFileSync('data/cities.json'))"`
- Build error in `build.js` → run locally: `node --check build.js && node build.js`

**Domain not connecting.** DNS propagation can take up to 24 hours but is usually 10 min. Check with `dig wheretostayturkey.com +short` or [whatsmydns.net](https://whatsmydns.net).

**SSL not working.** Vercel auto-provisions Let's Encrypt SSL within ~10 min of DNS pointing correctly. If still missing after 1 hour, contact Vercel support.

**Want to redeploy without changes.** Push an empty commit:
```bash
git commit --allow-empty -m "Redeploy"
git push
```

---

## Why Vercel over Cloudflare Pages or Netlify

All three are fine. Vercel's edges:

- **Best-in-class Git integration** — preview URLs for every branch, PR comments
- **Faster cold-start CDN** — useful when traffic spikes from a viral TikTok
- **Cleaner dashboard** for someone not used to AWS-style infra
- **Better free tier than Netlify** for traffic spikes (100 GB vs Netlify's 100 GB but stricter compute)

Cloudflare Pages has the edge if you want unlimited bandwidth + want to consolidate domain + DNS + CDN in one tool. Both work; Vercel is the friendlier first choice.

---

**That's it. Push to GitHub → Vercel deploys → done.**
