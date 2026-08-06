# NPM Pick 'Em

Straight up picks, 7 games a week, 12 week season, Coin Flip covers anyone who misses a deadline.

## What's in here

- `public/` — the site itself (picks, standings, rules, plus `admin.html`)
- `functions/api/` — Cloudflare Pages Functions (the backend)
- `schema.sql` — the database structure
- `wrangler.toml` — tells Cloudflare Pages about the database binding

## One-time setup

Run this from inside this project folder. It installs Wrangler (Cloudflare's CLI), logs you in, creates the database, and applies the schema.

```bash
npx wrangler login && npx wrangler d1 create npm-pickem-db
```

That last command prints a `database_id`. Copy it into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_DATABASE_ID`.

Then load the schema into that database:

```bash
npx wrangler d1 execute npm-pickem-db --remote --file=schema.sql
```

## Push to GitHub and connect Cloudflare Pages

```bash
git init && git add . && git commit -m "Initial commit: NPM Pick 'Em" && git branch -M main && git remote add origin https://github.com/YOUR-USERNAME/npm-pickem.git && git push -u origin main
```

(Create the empty `npm-pickem` repo on GitHub first if it doesn't exist yet, same as your other projects.)

In the Cloudflare dashboard:
1. Pages → Create a project → connect this GitHub repo
2. Build command: leave blank. Build output directory: `public`
3. Once deployed, go to the project's **Settings → Functions → D1 database bindings**, add a binding named `DB` pointing to `npm-pickem-db`. This step has to be done in the dashboard, it's not something the repo can set for you.
4. Re-deploy once (Cloudflare → Deployments → Retry deployment) so the new binding takes effect.

## Local preview before pushing

```bash
npx wrangler pages dev public --d1=DB=npm-pickem-db
```

This runs the whole site locally, including the API and a local copy of the database, at `http://localhost:8788`.

## Weekly workflow

1. Open `/admin.html` (not linked anywhere public, bookmark it)
2. Try **Option 1: Pull games automatically** first (TheSportsDB). If it comes back empty or errors, use **Option 2: Add a game manually** instead, just type in the teams and kickoff time.
3. Set the round number, hit **Publish week**. Coin Flip's picks for the week are generated automatically.
4. After games finish, hit **Try pulling results automatically**. Anything it can't resolve (manually-entered games, or a source that's down) shows up with two buttons per game, just click the team that won.

## A couple of things to keep an eye on

- ESPN's hidden scoreboard API is confirmed blocked from Cloudflare's network (403 Forbidden, looks like anti-bot protection on ESPN's side). We've switched automatic pulls to TheSportsDB instead, a smaller free API, but that hasn't been battle-tested here yet either. If it stops working, manual entry always works, it's not a rare fallback anymore, it's a fully supported path.
- The admin page has no login wall, per your call, anyone with the URL can publish weeks and set results. Keep the link out of anywhere public.
- Ties at season end are on you to run: the app tracks who's tied by win percentage, but starting a bonus playoff round is just publishing another week and marking it as a playoff round in the admin form.
- Still to build: a way to view/add/remove players from the admin panel (noted, coming later).
