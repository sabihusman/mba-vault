# MBA-Vault — Claude Code Kickoff Prompt

*Paste the block below into Claude Code from an empty project directory. First, drop `MBA-Vault - Architecture.md` into that directory so Claude Code can read the full spec.*

---

We're starting **MBA-Vault**, a private, mobile-ready PWA over my MBA + Product School coursework. The full design is in `MBA-Vault - Architecture.md` in this directory — **read it first** and treat it as the source of truth. This prompt is the initiation brief.

## How I want you to work

- **Plan before you build.** Start with a short scoping pass: confirm the stack, list the libraries you intend to use with their current versions, and lay out a phased plan. **Wait for my go-ahead before scaffolding.**
- **Verify, don't assume.** This is critical: do **not** invent package names, API methods, or versions. Before using any library or external API (the Gemini SDK, the embedding model, any vector store, the PWA/service-worker tooling, the ACME/Let's Encrypt IP-cert client), **check its current, real documentation** and tell me what you found. Flag anything you can't verify.
- **Use simple language** when you explain technical choices to me.
- **Teach the security parts.** I'm doing this partly to learn server/web security — when you set up auth, HTTPS, the firewall, rate-limiting, etc., explain *why*, and leave short notes in the repo (a `SECURITY.md`) documenting what's configured and how to verify it.

## What to build

A **single unified Next.js (App Router) + React + TypeScript app**, run as a Node server, deployed via Docker on my Hetzner box. Next.js route handlers are the backend — no separate backend service, no Vercel, no VPN. It must be **mobile-first, fully responsive, and an installable PWA** (manifest + service worker; offline browse shell — note the Q&A feature needs the network and won't work offline).

Core features (build in this order — see the architecture doc's build sequence):

1. **Repo + CI/CD scaffolding** (details below).
2. **Auth first** — login + TOTP 2FA + login rate-limiting/lockout. Everything sits behind this, so stand it up early.
3. **Browse layer** — authenticated, responsive listing of my 17 course folders and their files, with view/download, served from `/data/docs`.
4. **Ingestion pipeline** (runs locally, not on the server) — extract text from PDF/Word/PowerPoint/Excel, OCR scanned PDFs, chunk (structure-aware, per the doc), embed with `gemini-embedding-001` at 768 or 1536 dims, and write a **file-based vector index**. Test extraction on a few PowerPoint decks and a scanned PDF *before* running the full batch.
5. **`/ask` endpoint** — embed the question, retrieve closest chunks, send chunks + question to Gemini, return an answer **with source citations** (course / filename / page or slide, linking the real file). Rate-limit this endpoint. Gemini key server-side only.
6. **LLM hardening** — no tools/actions for the model; a system instruction fixing its role ("answer only from the provided coursework; if not covered, say so"); input-length caps.

## Repo, CI/CD & branch protection

Set up a **GitHub repo** (use the `gh` CLI). Monorepo layout: `/app` (the Next.js app), `/ingestion` (the local pipeline).

- Initialize git, sensible `.gitignore` (never commit the Gemini key, documents, or the index), an initial commit, and push.
- **Branch protection ruleset on `main`** requiring status checks before merge, plus require-PR and linear history.
  - **Important, learned the hard way on a previous project:** required status checks are matched by the **bare check-run name (the job id)** — e.g. `build`, `lint`, `test` — **not** the `workflow / job` display label. Listing the display labels matches nothing and blocks every PR. Use the bare job names.
- **GitHub Actions workflows:**
  - `build` — the app builds cleanly.
  - `lint` — ESLint + TypeScript type-check.
  - `test` — Playwright E2E **including a mobile-viewport project** (so responsiveness is tested from day one), plus unit tests for the chunking and retrieval logic.
  - `deploy` (on push to `main`) — build the Docker image and deploy to Hetzner over SSH (rebuild/restart via docker-compose). Use repo secrets for SSH and the Gemini key; never hardcode.
- Workflow: branch per change, squash-merge, merge only when required checks are green.

## Deployment & data model

- **Docker image holds code only.** Documents (`/data/docs`) and the vector index live in a host folder **mounted as a volume** — never baked into the image. Use `docker-compose` to wire the app + volume + env vars.
- The app binds to **localhost**, fronted by a **reverse proxy** that terminates HTTPS using a **Let's Encrypt IP certificate** (the short-lived, auto-renewing kind — **automate renewal** and verify it works). No domain.
- Firewall: **443 + 22 only**. SSH-key login. Document all of this in `SECURITY.md`.

## Hard constraints (do not deviate without asking)

- **No self-hosted LLM** — the cx23 (2 vCPU / 4 GB) can't run one. Gemini is the brain.
- **No Vercel, no VPN-only model** — both were considered and dropped; the app is unified on Hetzner and public behind auth.
- Keep everything **right-sized for one user and ~790 documents** — no enterprise-scale infrastructure, no separate database server.
- **Excel** files: browsable/downloadable but **excluded from Q&A in v1**.

Start with the scoping pass and your proposed library list (with verified current versions). Don't scaffold until I confirm.
