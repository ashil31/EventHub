# Deploying EventHub to Render — a complete, click-by-click guide

This guide assumes you've never used Render or GitHub Actions before. It walks through everything literally: where to click, what to type, and what you should see at each step. If something on screen doesn't exactly match what's described (both GitHub and Render change their UI over time), look for the closest-named button/section — the underlying steps won't have changed.

## What you're actually building

```text
Your laptop
   │  (git push)
   ▼
GitHub (stores your code, runs automated checks)
   │
   ▼
Render (reads your code from GitHub, builds a Docker image, runs it)
 ┌─────────────────────────────┐
 │ EventHub API (your backend) │
 │ PostgreSQL (your database)  │
 └─────────────────────────────┘
```

Two separate, independent things happen when you push code to GitHub:

1. **GitHub Actions** runs your automated tests (see Part 2). It does **not** deploy anything — it only checks your code is correct. Think of it as a robot that runs `npm test` for you automatically.
2. **Render** notices your GitHub repo changed and rebuilds/redeploys your app. This happens whether or not GitHub Actions passed — the two aren't connected to each other by default.

They're two separate tools doing two separate jobs. Nothing forces you to have both, but this project already has files for both set up, so this guide covers using them together.

## Render's free tier — the honest trade-offs

Know what "free" actually means before you commit (verify current details on Render's own pricing page — these change over time, but this is what's generally true of Render's free tier):

- **The web service sleeps after ~15 minutes of no traffic**, and takes **30–60 seconds to wake up** on the next request. Your first request after a quiet period will be slow — that's normal, not a bug in your app.
- **The free PostgreSQL database expires after a limited period** (historically around 30 days on Render's free plan) and is then deleted unless you upgrade it. You'll get an email warning before this happens. For a portfolio/interview project you redeploy and reseed occasionally, this is a minor inconvenience, not a blocker — just know it's coming.
- No credit card is required to start.

---

## Prerequisites

- [ ] A GitHub account ([github.com](https://github.com) — free)
- [ ] A Render account (Part 3 covers signing up — free, no card required)
- [ ] This project on your laptop, working (you've already confirmed `npm run start:dev` and Docker both work)
- [ ] `git` installed (you already have this, since you've been committing)

---

## Part 1 — Push your code to GitHub

Right now, your project only exists on your laptop — check by running this in the `EventHub` folder (not `EventHub/backend`, the top-level one):

```bash
git remote -v
```

If that prints nothing, you have no GitHub remote yet. Here's how to create one:

1. Go to **[github.com](https://github.com)** and log in (or sign up if you don't have an account).
2. Click the **+** icon in the top-right corner → **New repository**.
3. Name it `EventHub` (or whatever you like).
4. Leave it **Private** or **Public**, your choice — either works fine for everything in this guide.
5. **Do not** check "Add a README" or "Add .gitignore" — your project already has these. Adding them on GitHub would create conflicts.
6. Click **Create repository**.
7. GitHub will show you a page with some commands. You want the ones under **"…or push an existing repository from the command line"**. It'll look like this (copy the version GitHub shows you — the URL will have *your* username in it):

```bash
git remote add origin https://github.com/<your-username>/EventHub.git
git branch -M main
git push -u origin main
```

Run those three commands from the `EventHub` folder (the top-level one, containing `backend/`, `.git`, `.github`).

8. Refresh the GitHub page — you should now see all your files (`backend/`, `.github/`, `README.md`, etc.) on GitHub.

**From now on**, whenever you make a commit and want it to reach GitHub (and trigger Actions/Render), you run:

```bash
git push
```

---

## Part 2 — What GitHub Actions actually does (and how to watch it)

Your project already has a file at `.github/workflows/ci.yml`. The moment you pushed in Part 1, GitHub automatically read that file and ran it. Here's what it does, in plain terms:

### Where to watch it run

1. Go to your repository on GitHub.
2. Click the **Actions** tab (top of the page, next to "Pull requests").
3. You'll see a list of "workflow runs" — one per push. Click the most recent one.
4. You'll see two boxes: **"Lint, build & test"** and **"Docker build & smoke test"**. Click either one to see its live/finished log, line by line.
5. A yellow dot = still running. A green check = passed. A red X = something failed — click into it and scroll to the red text to see what broke.

### What each job actually does, in plain language

**Job 1 — "Lint, build & test":**
- Spins up a fresh, temporary computer (a "runner") with nothing on it.
- Starts a temporary PostgreSQL database just for this run (thrown away afterward — never your real data).
- Installs your dependencies (`npm ci`), same as `npm install` but stricter/reproducible.
- Applies your database migrations to that temporary database.
- Runs `eslint` (code style/correctness checker) and `prettier` (formatting checker).
- Compiles your TypeScript (`npm run build`) — this also catches type errors.
- Runs all your tests: unit tests, then the full end-to-end suite (including the RSVP concurrency tests — literally firing 50+ simultaneous fake requests to prove no one can ever overbook an event).

**Job 2 — "Docker build & smoke test":**
- Builds the actual production Docker image (the same one Render will build).
- Starts another temporary database.
- Runs that Docker image for real, points it at the temp database, and hits it with real HTTP requests (register a user, log in, create an event, RSVP) to prove the built image actually works, not just that the source code compiles.
- Sends the container a shutdown signal and checks it shuts down cleanly.

**If either job goes red**, it means something is broken — a test failed, or the code doesn't compile. Fix it locally, re-run `npm test`/`npm run build` yourself to confirm, commit, and push again. A new run starts automatically.

**Important: this does not deploy anything anywhere.** It's purely a "did I break something" check. Render (Part 3 onward) is what actually puts your app online, and it doesn't wait for or care about GitHub Actions — it deploys the instant it sees a new commit, independently. Treat GitHub Actions as your own safety check: **look at the Actions tab yourself before trusting a deploy.**

---

## Part 3 — Create your Render account

1. Go to **[render.com](https://render.com)**.
2. Click **Get Started** → sign up with **GitHub** (recommended — makes the next steps easier since Render can already see your repos).
3. Authorize Render to access your GitHub account when prompted.

## Part 4 — Create the PostgreSQL database

1. From the Render dashboard, click **New +** (top right) → **PostgreSQL**.
2. Give it a name — `eventhub-db` is fine.
3. Leave **Region** on its default, or pick one close to you.
4. Under **Instance Type**, choose **Free**.
5. Click **Create Database**.
6. Wait for it to finish provisioning (a minute or two). You'll land on its info page.
7. On that page, find and note down two connection strings — you'll need both later:
   - **Internal Database URL** — used by your API service (fast, works only between Render services in the same account).
   - **External Database URL** — used from your own laptop, e.g. to run migrations.

## Part 5 — Create the API web service

1. From the Render dashboard, click **New +** → **Web Service**.
2. Choose **Build and deploy from a Git repository**, then connect/select your `EventHub` GitHub repo. If it's not listed, click "Configure account" to grant Render access to it.
3. Fill in the setup form:
   - **Name:** `eventhub-api` (or whatever you like — this becomes part of your free URL)
   - **Root Directory:** `backend` — **this is the step most likely to be missed.** Your app lives inside `backend/`, not the repo root.
   - **Environment / Runtime:** Render should detect the Dockerfile automatically once it sees `backend/Dockerfile` (thanks to Root Directory being set correctly). If it asks you to pick a runtime explicitly, choose **Docker**.
   - **Dockerfile Path:** if it's not auto-filled, set it to `Dockerfile` (relative to the Root Directory you just set — i.e. it resolves to `backend/Dockerfile`).
   - **Instance Type:** **Free**.
4. Don't click "Create Web Service" yet — scroll down to environment variables first (Part 6), since you want these set before the first deploy attempt.

## Part 6 — Environment variables

Still on that same setup page (or under the service's **Environment** tab if you already created it), add:

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Exactly this string |
| `PORT` | *(leave unset)* | Render injects its own `PORT`; your app already reads whatever value is provided |
| `DATABASE_URL` | *(paste the Internal Database URL from Part 4)* | Internal is faster and free-tier-friendly since both services are on Render |
| `JWT_SECRET` | *(a long random string — see below)* | Never the `.env.example` placeholder |
| `JWT_EXPIRES_IN` | `15m` | Or your preferred token lifetime |
| `FRONTEND_URL` | *(your frontend's URL, once it exists — leave unset for now)* | With this unset, production CORS correctly denies all cross-origin requests rather than defaulting open |
| `THROTTLE_TTL` | `60` | Optional — matches the built-in default |
| `THROTTLE_LIMIT` | `100` | Optional — default |
| `AUTH_THROTTLE_TTL` | `60` | Optional — default |
| `AUTH_THROTTLE_LIMIT` | `5` | Optional — default |

**Generate `JWT_SECRET`** by running this on your own laptop and pasting the output:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Part 7 — Health check and deploy

1. Still in the service's settings, find **Health Check Path** and set it to:
   ```
   /api/v1/health
   ```
   This is deliberately the **liveness** endpoint, not `/health/ready` — so a brief database hiccup doesn't make Render think your whole app is down and restart it unnecessarily.
2. Click **Create Web Service** (or **Save, then Deploy** if you already created it).
3. Watch the build log. It runs through the same Docker build your Dockerfile defines locally — you've already seen this exact build succeed on your machine and in GitHub Actions.
4. Once deployed, Render gives you a free URL automatically, shown at the top of the service page — something like `https://eventhub-api-xxxx.onrender.com`.

## Part 8 — Apply database migrations

Your database has no tables yet — your app's code doesn't create them automatically (deliberately — see `backend/README.md`'s "Database Migration Strategy" for why). Run this once, from your laptop, in the `backend/` folder, using the **External** Database URL from Part 4:

```bash
DATABASE_URL="<paste the External Database URL here>" npx prisma migrate deploy
```

You should see output ending in something like `1 migration found ... applied`. If it says `No pending migrations to apply` on a second run, that's also correct — it means it already worked.

**Run this again, the same way, every time you add a new migration** (i.e., every time `backend/prisma/migrations/` gets a new folder).

## Part 9 — Verify it's actually working

```bash
curl https://<your-service>.onrender.com/api/v1/health
curl https://<your-service>.onrender.com/api/v1/health/ready
```

**If the service was asleep, the first request will be slow (up to ~60s) — that's the free-tier cold start, not a failure.** Try again if the first one times out in your terminal; it'll be fast on the second request.

Both should return `{"status":"ok", ...}`. The second one additionally proves your app can reach the database.

Then open `https://<your-service>.onrender.com/api/docs` in a browser — you should see the same Swagger UI you've been using locally. Try registering a user and logging in directly from that page (click **Authorize**, paste `Bearer <your token>` after logging in) to prove the whole thing works end to end, live.

---

## Part 10 — Your ongoing workflow, from now on

Once the above is set up once, here's what happens every time you make a change:

```text
1. You edit code locally, test it (npm test / npm run start:dev)
2. git add, git commit, git push
3. GitHub Actions automatically runs your full test suite (Part 2) — check the Actions tab
4. Render automatically notices the new commit and redeploys (Part 5-7) — check the service's "Events" tab
5. If your change included a new Prisma migration, run `npx prisma migrate deploy`
   against Render's External Database URL (Part 8) — Render does NOT do this for you
```

Step 5 is the one easiest to forget — the app deploying successfully does **not** mean your migration ran. If you add a new field to the database and forget this step, the deployed app will start throwing errors the moment it tries to use that field.

---

## Troubleshooting

**Build fails, can't find Dockerfile:** Root Directory (Part 5) isn't set to `backend`, or Dockerfile Path isn't `Dockerfile` relative to it.

**`/health/ready` returns 503 / "Database unavailable":** `DATABASE_URL` is wrong, or you used the External URL where the Internal one was intended (or vice versa — both actually work, Internal is just faster/free-tier-friendlier), or migrations (Part 8) were never run.

**App won't start, logs mention `JWT_SECRET`:** Either it's missing, or it's still the literal placeholder text — the app deliberately refuses to boot in production with the `.env.example` placeholder value, on purpose (a safety check, not a bug).

**CORS errors from your frontend once you deploy it:** Set `FRONTEND_URL` (Part 6) to your frontend's actual deployed URL, then redeploy the API service for the new environment variable to take effect.

**Everything was fine, now it's not / first request is very slow:** almost certainly the free-tier sleep/cold-start behavior described at the top of this guide — not a bug.

**It's been a few weeks and the database stopped working:** check your email for Render's free-database-expiry warning. You'll need to create a new free database (or upgrade) and re-run migrations against it.

**"It worked on my laptop but not on Render":** check the service's **Logs** tab first — Render shows you the exact same structured JSON logs you've seen locally. The error is almost always visible there.
