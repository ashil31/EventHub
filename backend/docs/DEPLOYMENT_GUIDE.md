# Deploying EventHub — a complete, click-by-click guide

This guide assumes you've never used Railway or GitHub Actions before. It walks through everything literally: where to click, what to type, and what you should see at each step. If something on screen doesn't exactly match what's described (both GitHub and Railway change their UI over time), look for the closest-named button/section — the underlying steps won't have changed.

## What you're actually building

```text
Your laptop
   │  (git push)
   ▼
GitHub (stores your code, runs automated checks)
   │
   ▼
Railway (reads your code from GitHub, builds a Docker image, runs it)
 ┌─────────────────────────────┐
 │ EventHub API (your backend) │
 │ PostgreSQL (your database)  │
 └─────────────────────────────┘
```

Two separate, independent things happen when you push code to GitHub:

1. **GitHub Actions** runs your automated tests (see Part 2). It does **not** deploy anything — it only checks your code is correct. Think of it as a robot that runs `npm test` for you automatically.
2. **Railway** notices your GitHub repo changed and rebuilds/redeploys your app. This happens whether or not GitHub Actions passed, *unless* you explicitly connect the two (optional — see the note in Part 2).

They're two separate tools doing two separate jobs. Nothing forces you to have both, but this project already has files for both set up, so this guide covers using them together.

---

## Prerequisites

- [ ] A GitHub account ([github.com](https://github.com) — free)
- [ ] A Railway account (Part 3 covers signing up — Railway's free tier is usage-limited, not unlimited; see the note at the end of Part 3)
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

**From now on**, whenever you make a commit and want it to reach GitHub (and trigger Actions/Railway), you run:

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
- Builds the actual production Docker image (the same one Railway will build).
- Starts another temporary database.
- Runs that Docker image for real, points it at the temp database, and hits it with real HTTP requests (register a user, log in, create an event, RSVP) to prove the built image actually works, not just that the source code compiles.
- Sends the container a shutdown signal and checks it shuts down cleanly.

**If either job goes red**, it means something is broken — a test failed, or the code doesn't compile. Fix it locally, re-run `npm test`/`npm run build` yourself to confirm, commit, and push again. A new run starts automatically.

**Important: this does not deploy anything anywhere.** It's purely a "did I break something" check. Railway (Part 3) is what actually puts your app online, and it doesn't wait for or care about GitHub Actions unless you set that up yourself (optional, see below).

### Optional: making Railway wait for GitHub Actions to pass

Out of the box, Railway deploys the instant it sees a new commit — even if GitHub Actions is still running or has failed. If you'd rather Railway only deploy after tests pass, that's a setting inside Railway's service configuration (something like "Wait for CI" under deploy triggers) — not covered step-by-step here since it's optional and Railway's exact wording for this changes over time. For now, treat GitHub Actions as your own safety check: **look at the Actions tab yourself before trusting a deploy**, especially early on.

---

## Part 3 — Deploying to Railway

### 3.1 — Create your account

1. Go to **[railway.app](https://railway.app)**.
2. Click **Login** (top right) → sign up with GitHub (recommended — it makes Part 3.3 easier since Railway can already see your repos).
3. You may be asked to verify your email and/or add a payment method to unlock the usage tier that lets your app run continuously. Railway's exact free-usage terms change over time — check whatever it shows you on screen; you don't need to pay anything to follow the rest of this guide, but a stopped/sleeping app due to hitting a usage limit is a billing question, not a bug in your code.

### 3.2 — Create a new project

1. From your Railway dashboard, click **New Project**.
2. Choose **Empty Project** (not a template).
3. You'll land on an empty project canvas. This project will hold both your database and your API as two separate "services" inside it.

### 3.3 — Add PostgreSQL

1. Inside your new project, click **+ New** (or **Create**, depending on the UI you see) → **Database** → **Add PostgreSQL**.
2. Railway provisions a Postgres database for you automatically — no configuration needed. A new box/card appears on your project canvas labeled something like "Postgres".
3. Click into that Postgres service. Look for a **"Variables"** or **"Connect"** tab — you'll see connection details including a `DATABASE_URL`. You don't need to copy anything yet; just know it's there. Other services *inside the same Railway project* can reference it automatically.

### 3.4 — Add your API service, from GitHub

1. Back on the project canvas, click **+ New** again → **GitHub Repo**.
2. If this is your first time, Railway will ask permission to access your GitHub account — approve it, then select the `EventHub` repository you pushed in Part 1.
3. Railway creates a new service and starts trying to build it immediately. **It will likely fail the first time** — that's expected, because by default Railway assumes your app lives at the repo root, but yours lives inside `backend/`. Fix that next.
4. Click into the new service → go to its **Settings** tab.
5. Find **"Root Directory"** (usually under a "Source" or "Build" section) and set it to:
   ```
   backend
   ```
6. Save. Railway should now find `backend/Dockerfile` and `backend/railway.json` and know how to build your app correctly (it detects the Dockerfile automatically — you don't need to configure a build command).

### 3.5 — Set environment variables

Still inside your API service, go to its **Variables** tab. Add each of the following (click "New Variable" for each one, or use Railway's "Raw Editor" to paste several at once):

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Exactly this string |
| `DATABASE_URL` | *(reference your Postgres service)* | See below — don't hardcode this |
| `JWT_SECRET` | *(a long random string — see below)* | Never reuse the placeholder from `.env.example` |
| `JWT_EXPIRES_IN` | `15m` | Or your preferred token lifetime |
| `FRONTEND_URL` | *(your frontend's URL, once it exists)* | Leave unset for now if you have no frontend deployed yet — see note below |
| `THROTTLE_TTL` | `60` | Optional — this is the default anyway |
| `THROTTLE_LIMIT` | `100` | Optional — default |
| `AUTH_THROTTLE_TTL` | `60` | Optional — default |
| `AUTH_THROTTLE_LIMIT` | `5` | Optional — default |

**`DATABASE_URL` — don't type this by hand.** Railway lets you reference another service's variable directly, so it always stays correct even if the database's credentials ever change. In the Variables tab, when adding `DATABASE_URL`, look for a way to reference it as `${{Postgres.DATABASE_URL}}` (Railway usually offers this as an autocomplete/suggestion when you start typing `$` or `{{` in the value field — the exact interaction depends on Railway's current UI, but the goal is: don't paste a literal connection string here, reference the Postgres service's own `DATABASE_URL` variable).

**`JWT_SECRET` — generate a real one.** Don't make one up by hand. Run this on your own laptop:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the long hex string it prints and paste that in as the value.

**`FRONTEND_URL` — leave it unset for now if you don't have a deployed frontend yet.** The app is coded to safely deny all cross-origin requests in production when this is unset, rather than default to allowing everything — that's correct and expected. Come back and set it once your frontend has a real URL.

**Do not set `PORT`.** Railway injects its own `PORT` value automatically, and your app is already coded to read and use whatever value Railway provides.

### 3.6 — Apply database migrations

Your database exists on Railway but has no tables yet — your app's code doesn't create them automatically (deliberately — see `backend/README.md`'s "Database Migration Strategy" for why). You need to run migrations **once**, from your own laptop, pointed at Railway's database:

1. In Railway, click into your **Postgres** service → find the **"Connect"** tab.
2. You'll see one or more connection strings. If there are two (an internal/private one and a public one), use the **public** one — you're connecting from your laptop, not from inside Railway's network. It looks like `postgresql://postgres:<password>@<host>.proxy.rlwy.net:<port>/railway`.
3. Copy that full string.
4. On your laptop, in the `backend/` folder, run:

```bash
DATABASE_URL="<paste the public connection string here>" npx prisma migrate deploy
```

5. You should see output ending in something like `1 migration found ... applied`. If it says `No pending migrations to apply` on a second run, that's also correct — it means it already worked.

**Run this again, the same way, every time you add a new migration** (i.e., every time `backend/prisma/migrations/` gets a new folder) — before or after redeploying, doesn't matter which, as long as you do it before the new code that depends on the schema change actually needs to run.

### 3.7 — Trigger a deploy (if it hasn't already)

If you already fixed the Root Directory in 3.4, Railway may have redeployed automatically. If not, go to the service's **Deployments** tab and click **Deploy** (or **Redeploy** on the latest one). Watch the build log — it runs through the same Docker build stages you've already seen locally (`deps` → `build` → `prod-deps` → `runtime`).

### 3.8 — Get your URL and verify everything

1. In your API service, go to **Settings** → look for **"Networking"** or **"Domains"**.
2. Click **Generate Domain** (Railway gives you a free `*.up.railway.app` URL — no custom domain needed).
3. Copy that URL. Now verify, either by pasting these into a browser or using `curl`:

```bash
curl https://<your-app>.up.railway.app/api/v1/health
curl https://<your-app>.up.railway.app/api/v1/health/ready
```

Both should return `{"status":"ok", ...}`. The second one additionally proves your app can reach the Railway database.

4. Open `https://<your-app>.up.railway.app/api/docs` in a browser — you should see the same Swagger UI you've been using locally. Try registering a user and logging in directly from that page (click **Authorize**, paste `Bearer <your token>` after logging in) to prove the whole thing works end to end, live.

---

## Part 4 — Your ongoing workflow, from now on

Once the above is set up once, here's what happens every time you make a change:

```text
1. You edit code locally, test it (npm test / npm run start:dev)
2. git add, git commit, git push
3. GitHub Actions automatically runs your full test suite (Part 2) — check the Actions tab
4. Railway automatically notices the new commit and redeploys (Part 3) — check the Deployments tab
5. If your change included a new Prisma migration, run `npx prisma migrate deploy`
   against Railway's public DATABASE_URL (Part 3.6) — Railway does NOT do this for you
```

Step 5 is the one easiest to forget — the app deploying successfully does **not** mean your migration ran. If you add a new field to the database and forget this step, the deployed app will start throwing errors the moment it tries to use that field.

---

## Troubleshooting

**Build fails on Railway with something like "Dockerfile not found":** Root Directory (3.4) isn't set to `backend`, or was set with a typo/leading slash. It should be exactly `backend`, no leading `/`.

**App deploys but `/health/ready` returns 503 / "Database unavailable":** `DATABASE_URL` isn't set correctly, or is pointing at the wrong (e.g. internal-only) connection string for a context that needs the public one, or migrations were never run (3.6).

**App won't start, logs mention `JWT_SECRET`:** Either it's missing, or it's still the literal placeholder text — the app deliberately refuses to boot in production with the `.env.example` placeholder value, on purpose (a safety check, not a bug).

**CORS errors from your frontend once you deploy it:** Set `FRONTEND_URL` (3.5) to your frontend's actual deployed URL, then redeploy the API service for the new environment variable to take effect.

**"It worked on my laptop but not on Railway":** Check the Deployments tab's build/runtime logs first — Railway shows you the exact same structured JSON logs you've seen locally. The error is almost always visible there.
