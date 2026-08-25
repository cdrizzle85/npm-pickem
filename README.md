# NPM Pick 'Em

Straight up picks, 7 games a week, 12 week season, missing a week costs 2 grace points instead of a real score.

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

## One-time schedule import

Real NFL and college football matchups/dates are known months ahead, so instead of pulling them live every week (which several free APIs have failed to reliably support from Cloudflare's network), we load the whole season in once. Run this from your machine, not Cloudflare's:

```bash
node scripts/import-schedule.mjs
```

This writes `schedule_seed.sql`. Load it into your database:

```bash
npx wrangler d1 execute npm-pickem-db --remote --file=schedule_seed.sql
```

You'll also need to run `migration_002_schedule_table.sql` once first (creates the table this depends on):

```bash
npx wrangler d1 execute npm-pickem-db --remote --file=migration_002_schedule_table.sql
```

If NFL flex-schedules a game to a new time later in the season, or a college football kickoff time that was TBD gets announced, use the **Edit time** button next to that game in the admin panel, no need to re-run the import.

## Weekly workflow

1. Open `/admin.html` (not linked anywhere public, bookmark it)
2. **Option 1: Browse the pre-loaded schedule** — pick a sport and date range, check the games you want. Fix any wrong or TBD kickoff times with **Edit time** first.
3. **Option 2: Add a game manually** — for anything not in the pre-loaded schedule (FCS opponents, etc.), just type it in.
4. Set the round number, hit **Publish week**.
5. After games finish, click the **team that won** next to each game, that's it. There's no reliable automatic scoring source right now (see below), so this is the real, supported way to score a week.
6. Once a week's deadline (kickoff of its first game) passes, anyone who never submitted automatically gets credited 2 wins and the rest as losses for that week, no action needed on your end.

## A couple of things to keep an eye on

- Three different free live-data sources (ESPN, TheSportsDB, Sleeper's undocumented endpoint) all turned out to be unreliable or blocked from Cloudflare's network, or in Sleeper's case, don't cover college football at all. The pre-loaded schedule solves game *selection*, but final scores still need a human, either you clicking the winner each week, or a paid sports data API with a real SLA if this ever needs to run unattended.
- The admin page has no login wall, per your call, anyone with the URL can publish weeks and set results. Keep the link out of anywhere public.
- Ties at season end are on you to run: the app tracks who's tied by win percentage, but starting a bonus playoff round is just publishing another week and marking it as a playoff round in the admin form.
- Run `migration_005_grace_credits.sql` once to add grace credit support and remove the old Coin Flip test account.
- Still to build: none currently, player management, team standings, and schedule browsing are all in.

## Accounts and passwords

People now register with name, email, team, and a real password, and log in with email + password on any new device (no more relying on browser storage alone). Run this once to add password support and wipe the test accounts you've been using:

```bash
npx wrangler d1 execute npm-pickem-db --remote --file=migration_004_add_passwords.sql
```

**Forgotten passwords:** there's no automated "reset link" email, since this app doesn't send email at all, you do that manually. Use the **Reset password** button next to a player in the admin panel's Players section, it sets a temporary password that you then tell them yourself (text, Slack, however you reach people).

**A security note, plainly stated:** passwords are hashed, never stored as plain text, but I used a lighter hashing setting than typical best practice specifically because Cloudflare's free Workers tier has tight CPU-time limits per request, and a heavier hash risks a login request timing out. This is a reasonable tradeoff for an internal pick'em pool, not something I'd consider acceptable for anything handling sensitive personal or financial data.

## Teams

Run `migration_003_teams.sql` once to add team support:

```bash
npx wrangler d1 execute npm-pickem-db --remote --file=migration_003_teams.sql
```

Then add your teams from the admin panel's **Teams** section before sharing the link, that's what populates the dropdown people see when they register. Standings shows a team leaderboard (ranked by combined total wins) plus a filter so anyone can switch between overall standings and just their own team, with a note showing their rank within that team.
