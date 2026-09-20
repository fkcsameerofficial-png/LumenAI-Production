# Lumen — a self-hosted AI chat assistant

Lumen is a full-stack, self-hostable AI chat web application in the spirit of Claude/ChatGPT's
web UI, built entirely with original branding, UI and code. It runs as a real responsive website
(works fine in Chrome on Android and desktop — it's just a website, not an APK), backed by a
modular Node/TypeScript API that talks to whichever AI providers you configure.

**Nothing in this codebase enforces artificial message/credit limits.** Whatever limits you hit
come from the upstream provider you configure (OpenAI-compatible API, Anthropic API, or a local
Ollama server), not from Lumen itself. Rate limiting exists only as an abuse/security safeguard
and is fully configurable (see `backend/.env`).

**Want a real public HTTPS URL, entirely from your phone, for free?** See
[`DEPLOY_RENDER.md`](./DEPLOY_RENDER.md) — deploys this exact project to Render as a single free
Web Service + free PostgreSQL database, no PC required.

---

## Features

**Chat**
- Streaming responses (Server-Sent Events) with stop-generation support
- Markdown rendering: tables, GFM, math-safe text, syntax-highlighted code blocks with a
  one-click copy button on every block
- Multi-turn conversation history, per-conversation system prompt & model selection
- Image understanding (upload an image, it's sent to vision-capable models as base64)
- General file uploads (text/code/PDF extraction happens client-side before sending as context)
- New chat / rename / delete / pin conversations
- Full-text search across all your conversations
- Export a conversation (or your whole history) to JSON; import it back in
- Light/dark theme, persisted, respects system preference by default
- Fully responsive layout — collapsible sidebar, mobile-first chat view

**Accounts & backend**
- Email + password auth (bcrypt hashing, JWT access token + rotating refresh token)
- Per-user encrypted storage of your own provider API keys (AES-256-GCM at rest)
- Modular **provider adapter** layer — add a new provider by implementing one small interface:
  - OpenAI-compatible (OpenAI itself, or any compatible endpoint: Groq, Together, OpenRouter, vLLM, etc.)
  - Anthropic (Claude models)
  - Ollama (fully local/open-source models, no API key needed)
- SQLite by default for local/self-hosted use (zero external services, one file); optional
  PostgreSQL for production (e.g. Render) via a single `DATABASE_URL` env var — same schema,
  same queries, selected automatically at startup (see `backend/src/db/index.ts`)
- Security middleware: helmet, CORS allow-list, rate limiting, input validation (zod), password
  hashing, JWT verification, per-route auth guards, file-type/size limits on uploads
- Structured logging (pino)
- Docker Compose for one-command self-hosting
- Test suite (vitest + supertest) covering auth, provider adapters and conversation CRUD

---

## Architecture

```
ai-assistant/
├── docker-compose.yml
├── backend/                  # Node.js + TypeScript API
│   ├── src/
│   │   ├── config/           # env loading & validation
│   │   ├── db/               # shared schema + async adapter (SQLite locally, Postgres in prod)
│   │   ├── middleware/       # auth, rate limiting, error handling
│   │   ├── providers/        # pluggable AI provider adapters
│   │   ├── routes/           # Express routers (auth, conversations, messages, files, models, keys)
│   │   ├── services/         # business logic (chatService orchestrates provider calls)
│   │   └── utils/            # logger, crypto helpers
│   └── tests/
└── frontend/                 # React + TypeScript + Vite + Tailwind SPA
    └── src/
        ├── api/               # typed fetch client + SSE streaming helper
        ├── context/           # Auth + Theme providers
        ├── store/             # zustand store for conversations/messages
        ├── components/        # Sidebar, ChatWindow, MarkdownRenderer, CodeBlock, modals...
        └── pages/             # Login, Register, Chat
```

The frontend never talks to AI providers directly — it always calls the Lumen backend, which
holds your encrypted API keys server-side and proxies/streams the provider response back over
SSE. This keeps your provider keys out of the browser entirely.

---

## Run it entirely in the browser — no PC/local install required

You don't need to own a computer capable of running Docker or Node — any of these give you a
full Linux dev machine inside your browser tab, for free, with everything in this repo already
wired up to auto-configure itself.

### Option A: GitHub Codespaces (recommended)

1. Push this folder to a new GitHub repository (or upload the ZIP and let GitHub create one).
2. On the repo page, click the green **Code** button → **Codespaces** tab → **Create codespace
   on main**.
3. Wait for the container to build (~1–2 min). It automatically runs `.devcontainer/setup.sh`,
   which installs both `backend/` and `frontend/` dependencies, creates the local SQLite database, and
   writes **random, secure secrets** into `backend/.env` for you (no manual editing needed).
4. In the Codespaces terminal, run:
   ```bash
   bash .devcontainer/start.sh
   ```
5. A "Ports" popup (or the **Ports** tab) will show forwarded URLs for `5173` (frontend) and
   `8787` (backend). Open the `5173` URL — that's your live Lumen website, reachable from any
   device, with a real public-ish URL Codespaces gives you (make the port **Public** in the Ports
   tab if you want to open it from your phone too).
6. Register an account in the UI, then add a provider API key under **Settings → Providers**
   (or use the Ollama provider — see below — for a fully free/local model with no key).

### Option B: Gitpod

1. Push this repo to GitHub/GitLab.
2. Visit `https://gitpod.io/#<your-repo-url>` (Gitpod's browser extension/bookmarklet does this
   for you with one click from the repo page).
3. Gitpod builds the workspace and runs the same setup + start scripts automatically
   (`.gitpod.yml`). Open the forwarded `5173` port when prompted.

### Option C: Any browser-based Linux terminal (Replit, cloud VM, etc.)

The app has no special requirements beyond Node.js 20+ and (for Docker Compose) a Docker
daemon. If your platform gives you a bash terminal:
```bash
cp backend/.env.example backend/.env   # then edit the three secrets in it
cd backend && npm install && npm run migrate && npm run dev &
cd ../frontend && npm install && npm run dev
```
Then open whatever public URL your platform maps to port `5173`.

> **Ollama / local models in the browser:** cloud dev environments (Codespaces, Gitpod) are real
> Linux VMs, so you *can* `curl -fsSL https://ollama.com/install.sh | sh && ollama serve &` and
> then `ollama pull llama3` inside the terminal to run a completely free, open-source model with
> zero API keys — Lumen's Ollama provider will pick it up automatically at
> `http://localhost:11434`.

---

## Current implementation & testing status (read this before deploying)

Every feature listed above is implemented in the code in this repository — there is no mocked or
stubbed-out functionality, and there are no artificial message/credit limits anywhere in the
app's own logic (see `backend/src/middleware/rateLimit.ts`, which is an abuse-guard only, sized
generously and fully configurable via `.env`).

**What has been verified without running the app:** every relative import across the whole
codebase was checked to resolve to a real file; every API endpoint the frontend calls was
cross-referenced against an actual matching backend route; and the backend and frontend were both
run through the TypeScript compiler to catch syntax/type errors (with expected "module not
found" noise filtered out, since dependencies aren't installed in the environment this was built
in — that environment has no network access, so `npm install` itself could not be run here).

**What has *not* been run or executed anywhere:** `npm install`, the automated test suite
(`cd backend && npm test`), either dev server, a real `docker compose up`, or an actual streamed
chat completion against a live provider. In other words: this has had a thorough static review,
not a dynamic one. The very first thing to do after setup (Option A/B/C above, or Docker Compose)
is run `cd backend && npm test` and then walk through register → new chat → add a provider key →
send a message yourself, and treat that as the real verification step. If you hit an error,
paste it back and it can be fixed directly.

---


```bash
cp .env.example .env
# edit .env: set JWT_SECRET, REFRESH_SECRET and ENCRYPTION_KEY to long random strings
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8787

On first run, register an account, then open **Settings → Providers** and paste in whichever API
keys you want (OpenAI, Anthropic, etc.) — or point the built-in Ollama provider at a local Ollama
instance (`OLLAMA_BASE_URL`, defaults to `http://ollama:11434` in Docker, or `http://localhost:11434`
for a native install) to run fully open-source local models with no key at all.

## Manual / local dev setup (no Docker)

Requirements: Node.js 20+.

```bash
# Backend
cd backend
cp .env.example .env      # fill in secrets
npm install
npm run migrate           # creates the SQLite database + schema
npm run dev                # http://localhost:8787

# Frontend (separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

Run tests: `cd backend && npm test`

## Configuring providers

Each user manages their own provider keys from **Settings → Providers** in the UI (stored
encrypted server-side, never sent back to the browser in plaintext). Administrators can also set
fallback/shared keys via backend environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) —
if a user hasn't supplied their own key, requests fall back to the shared key when
`ALLOW_SHARED_KEYS=true`.

Adding a new provider: implement `ChatProvider` in `backend/src/providers/<name>Provider.ts`
(see `providers/base.ts` for the interface) and register it in `providers/index.ts`. No other
code changes are required — it will automatically appear in the model selector.

## Security notes for self-hosters

- Always change `JWT_SECRET`, `REFRESH_SECRET`, and `ENCRYPTION_KEY` in `.env` before deploying.
- Put Lumen behind HTTPS (a reverse proxy like Caddy/nginx/Traefik) in production; cookies and
  the CSP are written assuming TLS termination in front of the app.
- `CORS_ORIGIN` in `.env` should be locked to your actual frontend origin in production.
- If you set `DATABASE_URL` to use PostgreSQL, never commit it — it contains a password. Keep it
  only in your platform's environment variable settings (see `DEPLOY_RENDER.md` for the Render
  case, where the platform generates and injects it for you).
- Uploaded files are stored under `backend/data/uploads` (a Docker volume) and are only served to
  the authenticated owner of the conversation they belong to.

## License

MIT — for your own original deployment. Original branding ("Lumen") and UI; no proprietary
Anthropic/OpenAI source code, assets, or trademarks are used anywhere in this repo.
