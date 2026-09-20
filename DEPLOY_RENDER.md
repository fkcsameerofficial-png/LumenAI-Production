# Deploying LumenAI to Render — Android-phone-friendly walkthrough

This deploys LumenAI as **one** free Render Web Service (frontend + backend together) plus one
free Render PostgreSQL database for persistent storage. Everything below can be done from Chrome
on your phone — no PC, no terminal on your end (Render builds it for you from GitHub).

Total time: ~10 minutes, plus a few minutes of Render build time.

---

## Before you start

Make sure the two fixed/updated files from this pass are pushed to your GitHub repo (if you're
using the ZIP from this message, just push the whole thing — nothing to think about). The repo
needs `render.yaml` at the root, and `backend/` + `frontend/` folders as they already are.

---

## Option A — One-click Blueprint (fastest)

1. Open **render.com** in Chrome, sign in (or sign up free) with your GitHub account.
2. Tap the **New +** button (top right) → **Blueprint**.
3. Tap **Connect account** if prompted, then find and select your LumenAI repository.
4. Render reads `render.yaml` automatically and shows you a preview: one **Web Service** named
   `lumenai` and one **PostgreSQL** database named `lumenai-db`. Tap **Apply**.
5. Render creates both, generates random values for `JWT_SECRET`, `REFRESH_SECRET`, and
   `ENCRYPTION_KEY` automatically (see `generateValue: true` in `render.yaml`), wires the
   database's connection string into `DATABASE_URL` automatically, and starts the first build.
6. Skip to **"Watch the build"** below.

If Blueprint isn't available on your account/region, use Option B — it does the exact same thing
by hand.

## Option B — Manual setup (if Blueprint isn't available)

**B1. Create the database first**
1. Render dashboard → **New +** → **PostgreSQL**.
2. Name: `lumenai-db`. Plan: **Free**. Tap **Create Database**.
3. Wait ~1 minute until status is "Available". Tap into it, scroll to **Connections**, and
   copy the **Internal Database URL** (you'll paste this in step B2).

**B2. Create the web service**
1. Render dashboard → **New +** → **Web Service**.
2. Connect your GitHub account if needed, select your LumenAI repository.
3. Fill in exactly:
   - **Name:** `lumenai` (or anything — this becomes part of your URL)
   - **Root Directory:** leave **blank** (the build command below handles both subfolders)
   - **Runtime:** `Node`
   - **Build Command:**
     ```
     cd frontend && npm install && npm run build && cd ../backend && npm install && npm run build && mkdir -p dist/public && cp -r ../frontend/dist/. dist/public/
     ```
   - **Start Command:**
     ```
     cd backend && npm start
     ```
   - **Instance Type:** Free
4. Scroll to **Environment Variables** and add each of these (tap **Add Environment Variable**
   per row):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *paste the Internal Database URL from B1* |
   | `JWT_SECRET` | *any long random string, 32+ characters* |
   | `REFRESH_SECRET` | *a different long random string* |
   | `ENCRYPTION_KEY` | *a third different long random string* |
   | `CORS_ORIGIN` | `https://lumenai.onrender.com` *(update after you see your real URL — see note below)* |
   | `ALLOW_SHARED_KEYS` | `false` |
   | `RATE_LIMIT_MAX` | `120` |
   | `MAX_UPLOAD_MB` | `20` |

   Don't have a way to generate random strings on your phone? Any long mix of letters/numbers you
   type yourself works — it just needs to be unpredictable and at least ~32 characters.
5. Tap **Create Web Service**.

---

## Watch the build

Render opens the **Logs** tab automatically. The first build takes a few minutes (it's running
`npm install` twice — frontend and backend — plus a Vite production build). You're looking for:
```
Lumen backend listening on 0.0.0.0:10000 (production)
Connected to PostgreSQL (production database)
```
If you see `Connected to PostgreSQL`, the database is wired up correctly. If instead you see
`Using local SQLite database`, `DATABASE_URL` wasn't picked up — check it's set exactly as in B1
(Option B) with no extra spaces.

## Your live URL

Once the log shows the service is live, Render shows your URL at the top of the page, e.g.:
```
https://lumenai.onrender.com
```
(the exact subdomain depends on the name you picked, and Render appends `-XXXX` if that name was
taken). **Open that URL in a normal Chrome tab** — that's your live LumenAI website.

If you used Option B and set a placeholder `CORS_ORIGIN`, go back into **Environment** and update
it to your real URL now, then tap **Save Changes** (this triggers a quick redeploy). This step is
a defense-in-depth measure, not strictly required — the frontend and API share the same origin in
this deployment, so the browser never makes a cross-origin request in the first place.

---

## Test it

1. Open your URL. You should land on the **Sign in** screen.
2. Tap **Create one**, register an account (name, email, password 8+ characters).
3. You should land straight in the chat UI, logged in — this confirms **registration, login, and
   the database are all working end-to-end**.
4. Tap **+ New chat**.
5. Tap **⚙️ Settings → Providers**, paste an OpenAI or Anthropic API key, tap **Save**.
   (No key handy? Skip this — Ollama needs none, but there's no local model runtime on Render's
   free tier to point it at, so for testing on Render specifically, a provider key is the
   quickest path to a real streamed response.)
6. Back in the chat, pick that provider/model at the top, send a message, and confirm the reply
   **streams in token-by-token** rather than appearing all at once.
7. Attach a small text file or image via the 📎 button and send a message referencing it.
8. Close the tab, reopen your URL — you should still be logged in (refresh-token cookie working),
   and your conversation should still be there (Postgres persistence working).

If any step fails, open **Logs** in the Render dashboard and check what the server printed at
that moment — that's the fastest way to pin down what broke.

---

## Known limitation: uploaded files don't survive a redeploy

Render's **free** web service plan has no persistent disk. The PostgreSQL database is a separate,
genuinely persistent service, so your accounts, conversations, and messages all survive redeploys
and restarts. But files you upload are written to the container's local disk (`backend/data/
uploads`), which is wiped every time the service redeploys or restarts after being idle. This
doesn't break anything in the meantime — uploads work fine during a session — it just means a
file attached to an old message may 404 after a redeploy. Fixing this properly means adding
object storage (e.g. an S3-compatible bucket) as a new provider behind `fileService.ts`, which is
a real feature addition beyond this pass's scope; flagging it clearly here rather than leaving it
as a silent surprise.

## Free-tier behavior to expect

Render's free web services **spin down after ~15 minutes of no traffic** and take ~30-60 seconds
to wake back up on the next request — the first load after idling will feel slow once, then be
normal. This is a Render free-tier characteristic, not a Lumen bug. Nothing in Lumen's own code
imposes message/credit limits; usage is bounded only by whichever AI provider key you connect.
