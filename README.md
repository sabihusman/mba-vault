# MBA-Vault

A private, mobile-ready PWA over my MBA & Product School coursework. Two jobs:

1. **Browse** — my documents, organized by the 17 course folders, viewable and downloadable (the real files).
2. **Ask** — a question box that answers from my own materials and **cites the source** (course / file / page or slide) on every answer. This is a RAG system: retrieve the closest chunks → send them + the question to Gemini → answer with citations.

One unified **Next.js (App Router) + React + TypeScript** app, run as a Node server, deployed via Docker on a Hetzner box behind authentication. Single user (me). No Vercel, no VPN, no separate backend.

## Repo layout

```
mba-vault/                 (npm workspaces root)
├── app/                   Next.js app — UI + route handlers (auth, browse, /ask)
│   ├── src/app/           App Router routes, manifest, service-worker registration
│   ├── src/lib/           shared logic (e.g. retrieval)
│   └── public/sw.js       offline browse-shell service worker
├── ingestion/             Local pipeline (runs on my laptop, not the server):
│   └── src/               extract → chunk → embed → write the vector index
├── SECURITY.md            what's hardened, why, and how to verify it
└── .github/workflows/     CI: build · lint · test · deploy
```

## Prerequisites

- **Node.js ≥ 20.9** (CI and the production image use Node 24 LTS; local dev on 20.x is fine).
- npm 10+.

## Common commands (run from the repo root)

| Command | What it does |
|---|---|
| `npm install` | Install all workspaces (single root lockfile) |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build of the app |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type-check across workspaces |
| `npm run test:unit` | Vitest unit tests (chunking + retrieval) |
| `npm run test:e2e` | Playwright E2E (incl. a mobile-viewport project) |

## Status

Early scaffold. Build order: repo/CI → server prep + HTTPS → auth (login + TOTP 2FA) → browse → local ingestion → `/ask` → LLM hardening. See `MBA-Vault - Architecture.md` for the full design and `SECURITY.md` for the security track.

## Privacy

This repo is **public** (required for branch protection on the GitHub Free tier), but it contains **code only**. The Gemini API key, the coursework documents, and the vector index are never committed — they live in CI secrets and on a mounted host volume. See `.gitignore` and `SECURITY.md`.
