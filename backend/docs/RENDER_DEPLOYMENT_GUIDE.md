# Deploying EventHub to Render (free tier) — a complete, click-by-click guide

This is the free-tier alternative to `DEPLOYMENT_GUIDE.md` (which covers Railway). Use this one if Railway's trial has expired on your account, or if you specifically want to stay on a free tier without adding a payment method.

Read `DEPLOYMENT_GUIDE.md`'s **Part 1** and **Part 2** first if you haven't already — pushing your code to GitHub, and what GitHub Actions actually does — none of that changes based on which hosting platform you use. This guide picks up from there and covers Render specifically.

## Render's free tier — the honest trade-offs

Before you commit to this, know what "free" actually means here (verify current details on Render's own pricing page — these change over time, this is what's generally true of Render's free tier):

- **The web service sleeps after ~15 minutes of no traffic**, and takes **30–60 seconds to wake up** on the next request. Your first request after a quiet period will be slow — this is normal, not a bug in your app.
- **The free PostgreSQL database expires after a limited period** (historically around 30 days on Render's free plan) and is then deleted unless you upgrade it. You'll get an email warning before this happens. For a portfolio/interview project you redeploy and reseed occasionally, this is a minor inconvenience, not a blocker — just know it's coming.
- No credit card is required to start.

If neither of those trade-offs work for you (e.g. you need the API always-on for a live demo), that's exactly when paying for Railway's Hobby tier (or Render's paid tier) becomes worth it — nothing about your code changes either way.

---

## Part 1 — Create your Render account

1. Go to **[render.com](https://render.com)**.
2. Click **Get Started** → sign up with **GitHub** (recommended — makes the next steps easier since Render can already see your repos).
3. Authorize Render to access your GitHub account when prompted.

## Part 2 — Create the PostgreSQL database

1. From the Render dashboard, click **New +** (top right) → **PostgreSQL**.
2. Give it a name — `eventhub-db` is fine.
3. Leave **Region** on its default, or pick one close to you.
4. Under **Instance Type**, choose **Free**.
5. Click **Create Database**.
6. Wait for it to finish provisioning (a minute or two). You'll land on its info page.
7. On that page, find and note down two connection strings — you'll need both later:
   - **Internal Database URL** — used by your API service (fast, works only between Render services in the same account).
   - **External Database URL** — used from your own laptop, e.g. to run migrations.

## Part 3 — Create the API web service

1. From the Render dashboard, click **New +** → **Web Service**.
2. Choose **Build and deploy from a Git repository**, then connect/select your `EventHub` GitHub repo. If it's not listed, click "Configure account" to grant Render access to it.
3. Fill in the setup form:
   - **Name:** `eventhub-api` (or whatever you like — this becomes part of your free URL)
   - **Root Directory:** `backend` — **this is the step most likely to be missed.** Your app lives inside `backend/`, not the repo root.
   - **Environment / Runtime:** Render should detect the Dockerfile automatically once it sees `backend/Dockerfile` (thanks to Root Directory being set correctly). If it asks you to pick a runtime explicitly, choose **Docker**.
   - **Dockerfile Path:** if it's not auto-filled, set it to `Dockerfile` (relative to the Root Directory you just set — i.e. it resolves to `backend/Dockerfile`).
   - **Instance Type:** **Free**.
4. Don't click "Create Web Service" yet — scroll down to environment variables first (next section), since you want these set before the first deploy attempt.

## Part 4 — Environment variables

Still on that same setup page (or under the service's **Environment** tab if you already created it), add:

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Exactly this string |
| `PORT` | *(leave unset)* | Render injects its own `PORT`; your app already reads whatever value is provided |
| `DATABASE_URL` | *(paste the Internal Database URL from Part 2)* | Internal is faster and free-tier-friendly since both services are on Render |
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

## Part 5 — Health check and deploy

1. Still in the service's settings, find **Health Check Path** and set it to:
   ```
   /api/v1/health
   ```
   This is deliberately the **liveness** endpoint, not `/health/ready` — so a brief database hiccup doesn't make Render think your whole app is down and restart it unnecessarily (the same reasoning documented in `railway.json` for Railway).
2. Click **Create Web Service** (or **Save, then Deploy** if you already created it).
3. Watch the build log. It runs through the same Docker build your Dockerfile defines locally — you've already seen this exact build succeed on your machine and in GitHub Actions.
4. Once deployed, Render gives you a free URL automatically, shown at the top of the service page — something like `https://eventhub-api-xxxx.onrender.com`.

## Part 6 — Apply database migrations

Your database has no tables yet. Run this once, from your laptop, in the `backend/` folder, using the **External** Database URL from Part 2:

```bash
DATABASE_URL="<paste the External Database URL here>" npx prisma migrate deploy
```

You should see it apply your one existing migration. Run this again the same way every time you add a new one (a new folder appears under `backend/prisma/migrations/`).

## Part 7 — Verify it's actually working

```bash
curl https://<your-service>.onrender.com/api/v1/health
curl https://<your-service>.onrender.com/api/v1/health/ready
```

**If the service was asleep, the first request will be slow (up to ~60s) — that's the free-tier cold start, not a failure.** Try again if the first one times out in your terminal; it'll be fast on the second request.

Both should return `{"status":"ok", ...}`. Then open `https://<your-service>.onrender.com/api/docs` in a browser to confirm Swagger is live, and try registering + logging in directly from there (click **Authorize**, paste `Bearer <token>`) to prove the whole thing works end to end.

## Ongoing workflow

Same as the Railway guide's Part 4: every `git push` to `main` triggers GitHub Actions (your tests) independently of Render automatically redeploying from the new commit. If your change included a new Prisma migration, re-run Part 6 above against the same External Database URL — Render does not run migrations for you.

## Troubleshooting

**Build fails, can't find Dockerfile:** Root Directory isn't set to `backend`, or Dockerfile Path isn't `Dockerfile` relative to it.

**`/health/ready` returns 503:** `DATABASE_URL` is wrong, or you used the External URL where the Internal one was intended (or vice versa — both actually work, Internal is just faster/free-tier-friendlier), or migrations (Part 6) were never run.

**Everything was fine, now it's not / first request is very slow:** almost certainly the free-tier sleep/cold-start behavior described at the top of this guide — not a bug.

**It's been a few weeks and the database stopped working:** check your email for Render's free-database-expiry warning (Part "Render's free tier — the honest trade-offs" above). You'll need to create a new free database (or upgrade) and re-run migrations against it.
