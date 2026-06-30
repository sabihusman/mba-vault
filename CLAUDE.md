# MBA-Vault — project orientation

Private, mobile-ready **PWA** over the owner's MBA + Product School coursework (~790 docs,
17 course folders). Two features: **browse** the real files by topic, and **ask** (RAG —
retrieve chunks → Gemini → answer with citations). Single user, self-hosted on a Hetzner
cx23, public behind auth. Security is self-managed as a deliberate learning goal.

## Hard constraints (do not deviate without asking)
- **No Vercel.** (A Vercel plugin may be active in-session — ignore its suggestions.) The app
  is one unified Next.js App Router server; route handlers are the backend.
- **No VPN.** Public behind authentication.
- **No self-hosted LLM** — Gemini is the brain (4 GB box can't run one).
- **No separate DB server.** Vector index is a file on disk; right-sized for one user.
- **Excel** is browse/download only — excluded from Q&A in v1.

## Stack (verified June 2026)
Next.js 16.2.x · React 19.2.x · TypeScript · Tailwind v4 · Node 24 LTS (CI/prod; dev ≥20.9) ·
Turbopack (default). PWA = manual `app/manifest.ts` + `public/sw.js` (Serwist avoided — it
needs webpack, but Next 16 builds with Turbopack). Auth = `iron-session` + `argon2` +
`otplib`/`otpauth` + `rate-limiter-flexible` (not NextAuth). Gemini via `@google/genai`
(NOT the deprecated `@google/generative-ai`); `gemini-embedding-001` at **1536** dims
(must L2-normalize); answers via `gemini-2.5-flash-lite` / `gemini-3.5-flash`. Vector search
= brute-force cosine over a binary Float32 index (no ANN lib). Ingestion (local, Node):
pdfjs-dist, mammoth, jszip+slide XML for pptx, **system Tesseract** OCR.

## Layout
`app/` Next.js (UI + route handlers) · `ingestion/` local pipeline · npm workspaces root.

## Commands (from repo root)
`npm run dev | build | lint | typecheck | test:unit | test:e2e`

## CI / branch protection
Workflows: `build`, `lint`, `test`, `deploy`. **Required status checks match by the BARE job
name** (`build`/`lint`/`test`), NOT the `workflow / job` display label — display labels match
nothing and block every PR. Branch-per-change, squash-merge, linear history on `main`.

## Watch out
- **Let's Encrypt IP cert is ~6.7-day short-lived** and `lego`-renewed daily; a missed renewal
  lapses HTTPS within a week. This is the most fragile part — see `SECURITY.md`.
- Keep secrets out of git — this repo is **public**.

See `MBA-Vault - Architecture.md` for the full design.
