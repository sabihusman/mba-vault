# MBA-Vault — Architecture

*Prepared for Sabih · 2026-06-29 · unified app on Hetzner cx23 "learn-with-sabih" (Helsinki) · public access, single user, self-managed security*

---

## 1. What MBA-Vault is

A private, mobile-ready web app over your MBA + Product School coursework. Two jobs:

1. **Browse** — your documents, organized by topic, viewable and downloadable, pointing at the **real files** (not summaries).
2. **Ask** — a question box answering things like *"Have I covered this?"*, *"What does my material say about X?"*, *"Which framework from my courses fits this situation?"* — with the **source document(s) cited** on every answer.

Job 2 is a **RAG system** (retrieval-augmented generation):

> Extract text from each document → split into chunks → embed each chunk → store in a search index → at question time, find the closest chunks → send them + your question to Gemini → it answers, citing the sources.

Standalone project, separate from your static study guide ("Learning with Sabih").

---

## 2. Non-negotiable product requirements

- **Mobile-ready from day one** — mobile-first, fully responsive on phone and laptop.
- **PWA** — installable, with an offline shell. *Honest scope:* the **browse** shell and cached documents can work offline; the **ask** feature needs the network (it calls Gemini), so Q&A won't work offline.
- **Access from anywhere** — usable from any device/browser, no VPN required.
- **Single user (you)** — everything behind authentication. **Security is owned and managed by you** (an explicit learning goal of this project).

---

## 3. What's in the corpus (measured)

| Measure | Value |
|---|---|
| Total folder | ~4.9 GB, 934 files |
| `Cleanup Review - Delete/` | ~3.3 GB (most of your 13 videos) |
| **Documents to index** (excl. cleanup + video) | **~1.66 GB, ~790 files** |
| Course/topic folders | 17 |

**Formats:** ~301 PDF · ~251 Word · ~179 PowerPoint · ~136 Excel · 13 video · a few images. Your **17 folders are the browse taxonomy**. PDF/Word parse easily; **PowerPoint/Excel are fiddly**; scanned PDFs need OCR. *v1 excludes the cleanup folder and all video.*

---

## 4. Decisions locked in

| Topic | Decision |
|---|---|
| Name | **MBA-Vault** |
| App | **One unified Next.js (App Router) + React + TypeScript app**, running as a Node server on Hetzner. Frontend + backend in one codebase; Next.js **route handlers are the backend** (`/ask`, browse/serve, auth). |
| UI | Mobile-first, fully responsive, **PWA** (manifest + service worker) |
| LLM (answers) | Gemini API, server-side |
| Embeddings | Gemini `gemini-embedding-001`, truncated to **768 or 1536** dims |
| Vector index | File-based / embedded, on the box (no separate DB server) |
| Ingestion pipeline | Runs **locally**, ships the finished index up |
| Hosting | All on Hetzner cx23 (2 vCPU / 4 GB / 40 GB) — **unified, no Vercel** |
| Domain | **None** — backend served over a Let's Encrypt **IP certificate** |
| Transport | **HTTPS** (Let's Encrypt IP cert; satisfies the PWA secure context) |
| Access | **Public**, from any device, behind authentication |
| Security | **Self-managed** — auth + 2FA + rate-limiting + firewall + hardening (a deliberate learning objective) |
| Deploy | Docker on Hetzner; documents + index on a mounted volume (never baked into the image) |
| Repo / CI | GitHub, branch protection on `main`, CI test suites (build/lint/test incl. mobile-viewport E2E) |

---

## 5. Architecture at a glance

One box, one app. The only external call is to Gemini.

```
  ANY DEVICE (phone, laptop)              HETZNER cx23 (public IP, HTTPS)
 ┌──────────────────────┐        ┌──────────────────────────────────────────────┐
 │ browser / installed   │ HTTPS  │ reverse proxy (TLS: Let's Encrypt IP cert)    │
 │ PWA  ─────────────────┼────────┼──▶ Next.js app (Node, bound to localhost)      │
 └──────────────────────┘        │      • auth (login + 2FA)  • rate-limiting     │
                                  │      • browse/serve docs   • /ask              │
                                  │      • holds Gemini key                        │
                                  │              │                                 │
                                  │  /data/docs   +   vector index (files on disk) │
                                  │              │                                 │
                                  │  firewall: 443 + 22 only       ▼               │
                                  │                        ┌──────────────┐        │
                                  │                        │  Gemini API  │ external│
                                  │                        └──────────────┘        │
                                  └──────────────────────────────────────────────┘
```

Single origin → no CORS, one deploy, one codebase. The Gemini key and your documents never leave the box.

---

## 6. Components

| Layer | Component | What it does | Where |
|---|---|---|---|
| UI | Next.js frontend (PWA) | Responsive browse UI + question box; installable; offline shell | Hetzner (served to browser) |
| App | Next.js route handlers | Auth, browse/serve docs, `/ask`, retrieval; holds Gemini key | Hetzner (Node, localhost) |
| Edge | Reverse proxy | Terminates HTTPS (IP cert), forwards to the app | Hetzner |
| Storage | Files on disk | Source of truth; served (authenticated) for browse/download | Hetzner `/data/docs` |
| Ingestion | Extractor + chunker + embedder | Text out of 4 formats, OCR scans, embed via Gemini | Run **locally** |
| Search | Vector index | Stores embeddings; returns closest chunks | Hetzner (file on disk) |
| Brain | Gemini API | Writes the answer from sent chunks | External (Google) |

At your scale (~790 docs, one user) you need **no separate database server** and **no self-hosted LLM** — both wrong for a 4 GB box. Because it's one unified Next.js app, the route handlers serve as the backend; no separate API service or cross-origin glue.

---

## 7. Embeddings & chunking

**Model:** `gemini-embedding-001`. Default 3072 dims; supports truncating to **768 or 1536** with little quality loss — use one of those. *(Verify the output-dimensionality setting name in current Gemini docs before coding.)*

**Storage is trivial:** ~790 docs likely yield ~10,000–40,000 chunks (rough); even 40k × 1536 dims is a few hundred MB; at 768 dims ~120 MB.

**Chunking — structure-aware, per format:**

- **PowerPoint** → ~one chunk per slide (title + body).
- **Word / PDF** → split on headings/sections, fall back to paragraph groups; target **~300–600 words**, **~10–15% overlap**.
- **Excel** → browsable/downloadable, but **exclude from Q&A in v1**.
- **Hard limit:** keep each chunk well under the model's ~2048-token input cap.

**Tag every chunk** with course folder, filename, page/slide, and a link to the original — that metadata is what lets answers cite *"Marketing, slide 14"* and open the real file.

---

## 8. Storage, build & deployment

**Separate code from data.** The Docker image holds **app code only** — documents and the index live in a host folder **mounted as a volume**.

**Route — build the index locally, ship it up:**

1. **Locally:** run ingestion (extract → OCR → chunk → embed via Gemini). Heavy parsing/OCR runs on your machine, not the cx23.
2. Output the **vector index as a file**.
3. Package the **app** as a Docker image (code only).
4. **On Hetzner:** `rsync` `data/docs` + the index into a host folder; run the container (via `docker-compose`) with that folder mounted and the Gemini key as an env var; the reverse proxy fronts it with the IP cert.
5. **Updates:** add files locally → re-run ingestion → rsync new docs + updated index up.

---

## 9. Security (public, single user, self-managed — your learning track)

Going public means **authentication is the primary defense**, not a backstop. Public IPs are scanned constantly. This is the deliberate learning area of the project; treat each item below as something to understand, not just switch on.

**Authentication (now critical):**
- Strong, unique password; **rate-limit + lockout** on failed logins.
- **TOTP 2FA** — low effort, high value for a public personal app.
- Sessions over HTTPS only; secure, http-only cookies; sensible session expiry.

**Transport & network:**
- Public **HTTPS via a Let's Encrypt IP certificate** (the ~6-day, auto-renewing kind, GA Jan 2026). **Renewal must be automated** or the site's cert lapses within a week. *(Optional: a cheap domain gives a long-lived cert and a clean URL.)*
- App bound to **`localhost`**, fronted by the reverse proxy.
- Firewall: **443 + 22 only**. SSH keys, no passwords. Automatic security updates. A brute-force guard (fail2ban-style) on SSH and the login.

**App level:**
- **Rate-limit the `/ask` endpoint** — protects both your data and your Gemini bill if discovered.
- **Gemini key server-side only**, from an env var, never shipped to the browser.

**LLM hardening (apply, don't over-invest):** the model gets **no tools/actions**; use Gemini's **system-instruction** to fix its role ("answer only from the provided coursework; if not covered, say so"); cap input length.

**Honest caveats:**
- Public access trades the "invisible to the internet" privacy of a VPN-only design for convenience. Reasonable choice — but it makes the auth + rate-limiting above genuinely load-bearing.
- Prompt injection is **mitigated, not eliminated**; risk stays modest (your own documents, one user).

---

## 10. Repo, CI/CD & quality gates

A **GitHub repo** (monorepo: `/app`, `/ingestion`).

- Branch-per-change, squash-merge to `main`.
- **Branch protection ruleset on `main`** with required status checks. **Critical lesson from your study guide: required checks match by check-run NAME (the job id), not the `workflow / job` display label** — display labels match nothing and block every PR. Use bare job names (`build`, `lint`, `test`).
- **CI workflows (required):**
  - `build` — app builds cleanly.
  - `lint` — ESLint + type-check.
  - `test` — Playwright E2E **including a mobile-viewport project** (responsiveness tested from day one) + unit tests for chunking/retrieval logic.
- **Deploy:** GitHub Actions workflow on push to `main` → build image, deploy to Hetzner over SSH, restart the container.
- Keep any extra analysis (SonarCloud-style) **non-required** so it can't block merges.

---

## 11. Tricky parts

| Risk | Why | Mitigation |
|---|---|---|
| **PowerPoint (179)** | Text scattered across shapes | Test extraction early; chunk per slide |
| **Excel (136)** | Tables embed poorly | Browsable/downloadable; exclude from Q&A in v1 |
| **Scanned PDFs** | No text without OCR | OCR pass during ingestion (open-source, or iLoveAPI) |
| **Public exposure** | Internet-reachable box | Strong auth + 2FA + rate-limiting + firewall (§9) |
| **IP-cert renewal** | 6-day cert lapses if unautomated | Automate renewal; alert on failure (or use a domain) |
| **Videos (13)** | Need transcription; heavy | Out of scope for v1 |

iLoveAPI's only role: optional **pre-processor** (format conversion + OCR) — not the search/Q&A engine.

---

## 12. Build sequence

1. **Scaffold app + repo.** Next.js (TS, App Router), PWA manifest + service worker, mobile-first layout; GitHub repo with branch protection + CI suites.
2. **Prep server.** Docker, reverse proxy, Let's Encrypt IP cert (auto-renew), firewall 443+22, SSH-key login, app bound to localhost.
3. **Auth first.** Login + TOTP 2FA + rate-limiting/lockout — stand this up early since everything sits behind it.
4. **Upload documents.** `rsync` ~1.66 GB (skip video + cleanup) to `/data/docs`.
5. **Browse layer.** Authenticated listing of the 17 courses + files, rendered responsively; installable PWA. *Already meets "a readily accessible space to pull up my material by topic" on any device.*
6. **Ingestion pipeline (local).** Extract → chunk → embed → write index. Test on a few PPTX + scanned PDFs **before** the full batch.
7. **Add `/ask`.** Retrieval → Gemini → answer-with-sources; rate-limited; key server-side.
8. **LLM hardening** (§9).
9. **Verify.** 10–15 known-answer questions (right citations, honest "not covered"); PWA install + offline shell on your phone; login lockout + 2FA actually work; cert auto-renews.
10. **(Later)** videos, Excel-in-Q&A, smarter ranking.

> **Correction (2026-08-05):** incremental re-indexing is **built and is the default**, not a
> "later" item. `ingestion/scripts/ingest.ts:36-37` loads the prior index and re-embeds only
> new/changed files (content-hash + chunk-id reuse, `ingestion/src/incremental.ts:46-48`);
> `--full` (`ingest.ts:17`) forces a full rebuild. Caveat: chunk ids embed the relative path
> (`ingestion/src/document-chunker.ts:9`), so moved/renamed files re-embed even if unchanged.

---

## 13. Rough cost

> ⚠️ **Verify current AI pricing before relying on it** — model names/prices change and newer Gemini tiers exist beyond the knowledge cutoff. Ballpark only.

| Item | Cost | Notes |
|---|---|---|
| Hetzner cx23 | **€4.99/mo** | Already on your console |
| Domain / HTTPS | **€0** | No domain; Let's Encrypt IP cert. (Optional cheap domain ~€1/mo for a long-lived cert + clean URL.) |
| Gemini — answers | **likely < $5/mo** | Single-user. Flash tier ~**$0.30/1M input**, ~**$2.50/1M output** tokens — *approximate, confirm*. Free/Lite tiers exist. |
| Gemini — embeddings | **~$0–few cents, one-off** | Embedding ~790 docs is a small one-time job |

**All-in: roughly €5–10/month**, dominated by the server you already pay for.

---

## 14. Remaining open decisions

1. **Ingestion language** — Node keeps one language and one CI; Python has richer document-parsing/OCR. Default: **start in Node; if OCR on scanned PDFs is weak, swap that step to a Python tool or iLoveAPI.**
2. **OCR route** — open-source vs. iLoveAPI.
3. **Cheap domain?** — optional; removes the 6-day IP-cert renewal churn and gives a clean URL.
4. **Excel in Q&A later?** — browse-only is the v1 default.
