# MBA-Vault — Technical Specification

*Last updated: 2026-07-31 · reflects `main` @ `17ac617` (Next 16.2.12 security bump) plus the
in-flight `feat/mcp-phase1` branch (MCP connector Phases 1–2 built; Phase 2 not yet deployed,
`MCP_ENABLED=false` on the box). Companion docs: `MBA-Vault - Architecture.md` (original
design), `SECURITY.md` (threat model + ops runbook — §9 dependency log, §10 MCP/OAuth),
`docs/staleness-detector-loop-spec.md` (agent loop spec), `docs/phase-b-agent-line-map.md`
(gap-filler planning).*

## 1. What it is

A private, mobile-ready **PWA** over the owner's MBA + Product School coursework
(~790 documents, 17 course folders). Single user, self-hosted on a Hetzner cx23 (4 GB),
public internet behind self-managed auth. Features:

1. **Browse** — navigate and view/download the real course files by folder.
2. **Ask** — RAG: retrieve index chunks → Gemini → streamed answer with citations.
3. **Staleness Detector** — a bounded agent loop that checks key coursework concepts
   against current web sources twice a year and writes a report (never the corpus).
4. **MCP connector** *(built, not yet deployed)* — a remote MCP server exposing one
   read-only tool, `search_vault(query)`, secured by a self-built OAuth 2.1
   authorization server, so Claude.ai can connect as a custom connector.

## 2. Hard constraints (binding)

- **No Vercel.** One unified Next.js App Router server; route handlers are the backend.
- **No VPN** — public behind authentication. **No NextAuth** — hand-rolled session auth
  (and now a hand-rolled OAuth 2.1 AS) as a deliberate security-learning goal.
- **No self-hosted LLM** (box is 4 GB); Gemini is the brain.
- **No database server.** Vector index is a binary file; app state is JSON files on a
  Docker volume. (`node:sqlite` rejected — unavailable on the dev machine's Node.)
- **Excel** files are browse/download only — excluded from Q&A.
- Repo is **public**: no secrets in git, ever.
- Staleness loop is **report-only**; the MCP endpoint is **retrieval-only** — no code
  path behind either can write to `/data/docs` or the index.
- The MCP endpoint must never be publicly reachable without working auth — enforced
  structurally (kill switch + gate in the proxy), not by discipline.

## 3. Stack (verified versions, from the manifests)

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router, Turbopack, `basePath: /vault` | **16.2.12** (security bump 2026-07-30, see §10) |
| UI | React | 19.2.4 |
| Styling | Tailwind CSS | v4 |
| Language | TypeScript (strict) | ^5 (app) / ^6 (ingestion) |
| Runtime | Node | 24 LTS (CI/prod); dev ≥20.9 |
| LLM SDK | `@google/genai` (NOT deprecated `@google/generative-ai`) | ^2.10.0 |
| MCP | `@modelcontextprotocol/server` (v2, web-standard transport) + `zod` | 2.0.0 / ^4 |
| Auth | `iron-session` 8.0.4 + `@node-rs/argon2` 2.0.2 + `otpauth` 9.5.1 (TOTP) | — |
| Rate limiting | `rate-limiter-flexible` | 11.2.0 |
| Unit tests | vitest | ^4.1.9 |
| E2E | Playwright (desktop Chrome + Pixel 5 projects) | ^1.61.1 |
| Ingestion parsing | pdfjs-dist ^6.1.200, mammoth ^1.12.0 (docx), jszip + fast-xml-parser (pptx), system Tesseract (OCR) | — |

Gemini models: `gemini-embedding-001` at **1536 dims (must L2-normalize)** for embeddings;
answer models per architecture doc; `gemini-3.1-flash-lite` with the `googleSearch`
grounding tool for the Staleness loop. The OAuth server is hand-rolled on `node:crypto`
(the MCP SDK's own AS helpers are deprecated in v2) — zero dependencies beyond the table.

PWA is manual: `app/manifest.ts` + hand-written `public/sw.js` (Serwist avoided — needs
webpack; Next 16 builds with Turbopack).

## 4. Repository layout

npm workspaces monorepo:

```
app/                  Next.js app — UI + route handlers (the deployed unit)
  src/app/            pages: /browse, /ask, /staleness, /login, /offline,
                      /oauth/authorize (consent)
  src/app/api/        route handlers (see §7)
  src/lib/            auth/, ask/, health/, history/, staleness/, mcp/, oauth/
  src/proxy.ts        the auth gate (Next 16 "proxy", formerly middleware)
  scripts/            dev-only CLIs: provision-auth, staleness-bootstrap, staleness-run
  e2e/                Playwright specs
ingestion/            local pipeline (laptop only, never deployed):
                      discover → extract → chunk → embed → binary vector index
config/               phase-b-sources.json (Phase B Tier-1 whitelist, planning)
docs/                 specs & planning artifacts
docker-compose.yml    the box's runtime definition
.github/workflows/    build / lint / test / deploy
```

## 5. Data & state

- **`/data` (read-only volume)**: course documents + the vector index built locally by
  the ingestion pipeline and uploaded. Index = brute-force cosine over a binary Float32
  file (no ANN library — right-sized for ~790 docs / one user).
- **`/state` (named Docker volume `mba_vault_state`, writable)**: small JSON state, all
  containment-guarded against the env-provided state dir:
  - `history.jsonl` — Ask history (the "resume" card).
  - `staleness/concepts.json` — concept check-list (`pending`/`active`/`rejected`;
    review = editing the status field; stable ids survive re-bootstrap).
  - `staleness/reports/<runId>.json` — full dated `StalenessReport` history.
  - `staleness/run-status.json` — small `RunStatus` read by the health panel.
  - `mcp/clients.json` — OAuth dynamic-client registrations (capped at 20, oldest
    evicted; public metadata only, no secrets).
  - `mcp/tokens.json` — access/refresh token records, **SHA-256 digests only** (raw
    tokens are never written anywhere).
- Authorization codes are **in-memory only** (60 s, single-use) — deliberately not state.
- OAuth store writes are serialized through an in-process queue (`lib/oauth/serialize.ts`)
  — read-modify-write on whole JSON files must not interleave (lost-update race, caught
  by e2e).
- runIds are fixed-width ISO-derived stamps, so lexicographic sort = chronological.

## 6. Auth & security model

Three disjoint auth planes, all decided in `src/proxy.ts` (fails closed):

1. **Human (session)**: `iron-session` sealed cookie (`HttpOnly; Secure; SameSite=Lax;
   Path=/vault`, 7-day TTL); login = username + argon2 + TOTP in one step, dual
   rate-limited with lockout. Login supports a validated `?next=` return path
   (app-internal only — no open redirects), used by the OAuth consent flow.
2. **Cron (staleness timer)**: `X-Cron-Secret` vs `STALENESS_CRON_SECRET`, scoped to
   exactly `POST /api/staleness/run`, constant-time, never falls open.
3. **Machine (MCP)**: kill switch first — `/api/mcp` is **404 unless `MCP_ENABLED=true`**
   (endpoint structurally absent otherwise) — then OAuth 2.1 bearer verification against
   the hashed token store (401s carry the `WWW-Authenticate` discovery challenge), then a
   per-token rate limit (30 requests / 5 min → 429). Session cookies are NOT accepted on
   the MCP path, and an MCP token opens no other path.

**OAuth 2.1 authorization server** (SECURITY.md §10 explains each part in plain language):
RFC 9728 + 8414 metadata; RFC 7591 DCR with a hard redirect-URI allowlist (only the
documented Claude callbacks: `https://claude.ai/api/mcp/auth_callback` exact, plus Claude
Code loopback `/callback` port-agnostic per RFC 8252 §7.3); consent = the existing
login+TOTP session (CSRF-covered by the SameSite=Lax cookie); PKCE S256 mandatory;
single-use 60 s codes; opaque tokens hashed at rest (1 h access / 30 d refresh) with
OAuth 2.1 refresh rotation (`invalid_grant` on replay). Issuer/URLs derive from
`PUBLIC_ORIGIN` so a future domain move is one env change.

**Transport**: nginx terminates TLS; app binds to 127.0.0.1. Let's Encrypt **IP cert,
~6.7-day short-lived**, `lego`-renewed daily — the most fragile piece. Deploy key is
forced-command-pinned (redeploy only). Anything model- or web-derived renders as plain
text; the staleness loop treats fetched web content as data, not instructions.

## 7. HTTP surface (all under `/vault`)

**Pages** (session-gated except login/offline): `/browse/[[...path]]`, `/ask` (`?q=`),
`/staleness` (`?run=<runId>`), `/oauth/authorize` (consent), `/login` (`?next=`),
`/offline`. Navigation: Browse · Ask · Report tabs + the header health pill.

**API route handlers**:

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/login`, `/api/logout` | POST | public / session | session lifecycle |
| `/api/files/[...path]` | GET | session | serve a course file (`?download=1`) |
| `/api/ask` | POST | session | RAG answer, streamed, rate-limited |
| `/api/health` | GET | public | container liveness |
| `/api/status` | GET | session | aggregate health report |
| `/api/staleness/run` | POST | session or cron secret | start a staleness run |
| `/api/staleness/status` | GET | session | `{running, currentRunId}` |
| `/api/mcp` | POST/GET/DELETE | kill switch + OAuth bearer | MCP streamable HTTP (`search_vault`) |
| `/api/oauth/protected-resource-metadata` | GET | public (RFC 9728) | PRM; also advertised via MCP 401 header |
| `/api/oauth/authorization-server-metadata` | GET | public (RFC 8414) | AS metadata (S256, public client, grants) |
| `/api/oauth/register` | POST | public + 5/hr/IP | DCR, redirect-URI allowlist |
| `/api/oauth/token` | POST | public + 20/hr/IP | code exchange (PKCE) + refresh rotation; form-urlencoded |
| `/api/oauth/decision` | POST | session (CSRF via SameSite=Lax) | consent Approve/Deny → auth code |

Deploy-time nginx addition (prepared, not yet applied): map root `/.well-known/oauth-*`
probe paths onto the two metadata routes (the primary discovery is the 401 header, which
may point anywhere HTTPS — Claude docs).

## 8. Features beyond Browse/Ask

### Staleness Detector (complete, Phases 1–6)
Bounded, report-only loop; two triggers (health-panel button + systemd timer via cron
secret), one in-process guard. Per active concept: grounded Gemini comparison with
self-validation (a `current`/`stale` verdict with zero API grounding sources downgrades
to `couldnt_verify`, enforced in code). Hard caps: cost ($1, `STALENESS_COST_CAP_USD`),
steps (50, `STALENESS_STEP_CAP`) — NaN-guarded env overrides — plus a 3-consecutive-error
breaker. Health panel row is machinery-only (findings structurally cannot affect the
color); the **Report tab** (`/staleness`) renders report JSON read directly from the
store, worst-first accordion, distinct "ungrounded" vs "no external match" badges.
Known API trap: `googleSearch` + `responseSchema` silently stops grounding — the loop
parses delimited text instead.

### MCP connector (Phases 1–2 built; Phases 3–4 pending)
`search_vault(query)`: embed → cosine over the existing index → top-8 chunks with
`Course / file (p. N | slide N)` citations. Reuses Ask's retrieval verbatim; **no Gemini
answer step**. Served via `createMcpHandler` (v2 SDK, stateless per-request, web-standard
`fetch(Request) → Response` in a three-line route handler; the SDK does no token
verification — ours lives in the proxy). Auth as in §6. Phase 1's `static_headers` smoke
test was unavailable on the owner's claude.ai plan, so the **IP-literal connector URL
question is still UNVERIFIED** — it resolves at the first live OAuth connect (Phase 3);
fallback if rejected: free DuckDNS subdomain + standard Let's Encrypt cert via the
existing lego pipeline (decided, unbuilt).

## 9. CI/CD & environments

- Workflows `build` / `lint` / `test` / `deploy`; required checks match the **bare job
  name**. Branch-per-change, squash-merge, linear history.
- `deploy.yml`: PRs build-only (no registry login/push; deploy job structurally skipped);
  merges to `main` push to GHCR then SSH-redeploy via the forced-command key.
- Box runtime: docker compose, loopback bind, `env_file: .env`, `/data:ro` +
  `mba_vault_state` volumes. Traps: `docker compose up -d --force-recreate app` to
  reread `.env`; single-quote env values containing `$`; the standalone image has no
  flat requirable `node_modules`.

## 10. Dependency security (see SECURITY.md §9)

2026-07-30: Next 16.2.9 → **16.2.12** — GHSA-6gpp-xcg3-4w24 (middleware/proxy auth
bypass, CVSS 8.3; our single-locale-i18n precondition did NOT apply — no `i18n` block —
but bumped regardless) plus eight further Next advisories. `fast-xml-parser` DoS fixed.
Deliberately unfixed (breaking or nonsense force-fixes, documented with exposure notes):
eslint-chain `brace-expansion`, `postcss`/`sharp` nested inside Next itself. The MCP
SDK and zod arrived audit-clean.

## 11. Testing

- **272 unit** (app 240-in-35-files + ingestion 32) and **62 e2e** (31 × 2 viewports),
  including a full OAuth flow over real HTTP (register → consent → code → PKCE exchange
  → authenticated MCP `initialize` → refresh rotation → replay/wrong-verifier failures)
  and unit proof that raw tokens never reach disk. Conventions that bite:
  - vitest has **no `@/` alias** — testable files use relative imports.
  - Direct-constructed `NextRequest`s must use basePath-stripped URLs (no `/vault`).
  - Direct-to-dev-server e2e calls share one `"unknown"` rate-limit bucket — every
    rate-limited call gets a synthetic `x-real-ip` (TEST-NET).
  - Playwright sometimes auto-patches `package-lock.json` on Windows — check and revert.
  - Don't edit spec files via PowerShell `Get-Content`/`Set-Content` — PS 5.1 mangles
    BOM-less UTF-8 (mojibake broke real assertions once; use proper editor tooling).
  - Shared e2e `STATE_DIR`: don't write `run-status.json`, don't delete seeded dirs.

## 12. Environment variables (production)

| Var | Purpose |
|---|---|
| `SESSION_SECRET`, auth credential vars | session sealing + login (SECURITY.md §1) |
| `GEMINI_API_KEY` | Ask + Staleness + MCP query embedding |
| `DATA_DIR` / `STATE_DIR` | volume paths (default `/data`, `/state`) |
| `STALENESS_CRON_SECRET` | timer auth for the staleness run endpoint |
| `STALENESS_COST_CAP_USD`, `STALENESS_STEP_CAP` | optional cap overrides ($1 / 50) |
| `STALENESS_OVERDUE_DAYS` | health amber threshold (default 200) |
| `MCP_ENABLED` | MCP kill switch — 404 unless exactly `true` (**currently `false` on the box**) |
| `PUBLIC_ORIGIN` | OAuth issuer/metadata origin (e.g. `https://95.216.159.93`; dev default `http://localhost:3000`) |

Removed: `MCP_STATIC_TOKEN` (Phase 1 scaffolding, deleted with the OAuth switch).

## 13. Roadmap

- **MCP Phase 3 — deploy + connect**: nginx `.well-known` mapping, `PUBLIC_ORIGIN` +
  `MCP_ENABLED=true` on the box, live claude.ai OAuth connect (which finally answers the
  IP-literal question; DuckDNS fallback ready if it fails).
- **MCP Phase 4 — harden + document**: token expiry/revocation review, DCR abuse
  surface, logging with **no chunk content in logs**, session log.
- **LangSmith tracing** for the staleness loop — researched and planned (metadata-only
  spans, `langsmith@^0.8.7`, off by default); awaiting go-ahead.
- **Phase B — gap-filler/tutor loop** (planning): human-in-the-loop line map + Tier-1
  source whitelist committed; agent gets no write tool; `/supplementary/` only.
- **Phase C**: critic subagent for draft quality.
- Loop-spec §7 leftovers: seeded-stale eval, per-day cost cap.
