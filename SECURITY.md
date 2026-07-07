# MBA-Vault — Security

This is a **living document** and a deliberate learning track. MBA-Vault is a public,
internet-reachable app for a single user, so **authentication and the network edge are
the primary defenses, not a backstop**. Public IPs are scanned constantly.

Each item below is written to be *understood*, not just switched on: **what** it is,
**why** it matters, and **how to verify** it actually works. Items are marked:
✅ done · 🚧 in progress · ⬜ planned (with the build phase it lands in).

---

## 0. Secrets & the public repo  ✅

**Why:** This repo is public (so GitHub Free allows branch protection on `main`). That
makes "no secret ever reaches git" a hard requirement, not a nicety.

**What's configured:**
- `.gitignore` blocks `.env*` (except `.env.example`), `*.pem/*.key/*.p12`, the whole
  `/data/` tree (documents + vector index), and `*.index/*.vec/*.embeddings`.
- The Gemini API key is **server-side only**, read from an env var, and supplied to CI
  via **GitHub Actions secrets** — never hardcoded, never shipped to the browser.

**How to verify:**
- `git ls-files | grep -Ei '\.(env|pem|key)$'` returns nothing.
- `git log -p | grep -i 'AIza'` (Gemini keys start `AIza`) returns nothing.
- After the first push, browse the public repo and confirm no key/documents are present.

---

## 1. Authentication  ✅ (Phase 3 — live in prod 2026-07-03)

**Why:** With the app public, a guessed/stolen credential is the whole game. So: a strong
unique password, hashed with a memory-hard algorithm; a second factor; and lockout so the
login can't be brute-forced.

**What's built:**
- **Session** = an encrypted, sealed cookie (`iron-session`, no store/DB): `mba_vault_session`,
  **`HttpOnly`** (JS/XSS can't read it), **`Secure`** in production (off plain HTTP), **`SameSite=Lax`**
  (blunts CSRF), and **`Path=/vault`** so it's never sent to the other tenants on the box
  (`/` study guide, `/wellmark`). 7-day expiry.
- **No user table.** One user ⇒ credentials are env vars on the box (`SESSION_SECRET`,
  `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `TOTP_SECRET`), generated **offline** by
  `npm run provision:auth` and pasted into `.env` — nothing secret in git, no mutable auth state
  on the server except in-memory lockout counters.
- **Password** hashed with **Argon2id** (`@node-rs/argon2`, `m=19456,t=2,p=1`).
- **TOTP 2FA** (`otpauth`), ±1-step clock-skew window.
- **Single-step login** — username + password + 6-digit code in one POST. This deliberately avoids
  a two-step flow's *password-confirmed oracle* (a 2-step form tells an attacker when the password
  alone is right). Every failure returns **one generic message**; argon2 runs **even on a wrong
  username** (no timing oracle) and the username compare is constant-time.
- **Dual lockout** (`rate-limiter-flexible`, in-memory): **per-IP (10)** *and* **per-username (5)**,
  15-min window/block, reset on success. Behind nginx the socket peer is always `127.0.0.1`, so the
  real client IP is read from **`X-Real-IP`** (nginx-set), falling back to the leftmost
  `X-Forwarded-For`, then `"unknown"` (safe-by-default: all attackers share one bucket rather than
  spoofing fresh keys).
- **Route gate** = Next 16 **`proxy.ts`** (the renamed middleware; Node runtime). It unseals the
  cookie with `unsealData` and **fails closed** — any missing/tampered/expired/wrong-secret cookie
  is "not logged in". Unauthenticated pages → redirect to `/vault/login`; `/api/*` → `401`. The
  public allowlist lives in a tested `isPublicPath()` (login flow, `/api/health`, PWA shell/sw/
  manifest/icons, offline); the bare root `/` is gated explicitly. Logout (`POST /vault/api/logout`)
  destroys the cookie.

**Operational lesson (learned the hard way):** `/api/health` **must stay public**, or the
docker-compose healthcheck and the deploy smoke test (which probe it unauthenticated) get `401`
and **every deploy fails**. The flip side: a *green* deploy does **not** prove login works, because
the healthcheck needs no secret — if the box `.env` is missing the auth vars, `/vault/login` `500`s
while health still reports `200`. Provision all four vars before trusting a deploy.

**How to verify:** a wrong code/password/username all give the same generic failure; 5 bad
attempts on the username → locked out; the session cookie shows `HttpOnly; Secure; SameSite=Lax;
Path=/vault` in dev tools; `curl -sI https://<ip>/vault` → `307` to `/vault/login` when logged out;
`/vault/api/<anything>` without a session → `401`; `/vault/api/health` → `200` without a session.

---

## 2. Transport & HTTPS  ✅ (Phase 2 — live)

**Why:** HTTPS protects the login and session in transit and is required for a PWA
(secure-context) and for service workers.

**What's live (no domain → Let's Encrypt IP certificate):**
- Public HTTPS via a **Let's Encrypt IP certificate** for the box's bare public IP under the
  **`shortlived`** ACME profile — **~6.7-day** lifetime.
- **`lego` v5.2.2** issues/renews it with the **http-01 challenge in webroot mode**: nginx stays up
  and serves the token `lego` writes to `/var/www/acme/.well-known/acme-challenge/`. No port
  juggling, no renewal downtime.
  - *Why http-01:* **tls-alpn-01** runs over 443 (nginx owns it) → daily downtime or fragile ALPN
    routing; **dns-01** can't be used for a bare IP. **Caddy** can't issue bare-IP certs at all and
    was disabled + `systemctl mask`ed.
  - This is **why port 80 is open** (§3): ACME challenge + http→https redirect only.
- **Config lives in `/etc/lego/lego.env`** (`LEGO_*` vars: email, server, http, http.webroot,
  domains, profile, path). lego reads them from the environment, so no long `--flags` are typed.
- **Renewal** is a systemd **timer** (`lego-renew.timer`, twice daily, randomized, `Persistent`)
  running `lego-renew.service` → **`lego run`** (lego 5.x unified obtain+renew: it renews only when
  inside the window — ~½ lifetime for short-lived certs — otherwise a safe no-op) → **reloads nginx**
  so the new cert is actually served (nginx caches the old one in memory otherwise).
- **Dead-man's-switch:** the service pings a healthchecks.io check on each successful run; if a
  renewal fails *or* the timer stops firing, the missing ping raises an alert — the scariest silent
  failure for a 6.7-day cert.
- The apps bind to **localhost**; nginx terminates TLS on 443.

**One cert, three path-scoped tenants** (one IP, so no hostname vhosts): `/` static study guide,
`/vault` MBA-Vault, `/wellmark` basic-auth reverse proxy. Fronting `/wellmark` with HTTPS also
closed a real leak — its basic-auth credentials previously went over :80 in **cleartext**; the
password was **rotated** (new bcrypt `htpasswd`) at the same time.

**How to verify:**
- `openssl x509 -in /etc/lego/certificates/<server-ip>.crt -noout -enddate` → a ~6–7-day window
  that keeps advancing day to day.
- `systemctl list-timers lego-renew.timer` → next run; `journalctl -u lego-renew.service` → on
  no-op days, `Skip renewal … can be performed in Nd`.
- `curl -sI http://<server-ip>/` → `301` to https; from outside, `openssl s_client -connect
  <server-ip>:443` serves the IP cert.

---

## 3. Network & host hardening  ✅ (Phase 2 — SSH / firewall / fail2ban / auto-updates done; nginx + TLS on 80/443 tracked in §2)

**Why:** Keep the attack surface to the few ports we need, make remote login key-only, and
auto-ban brute-force noise + auto-patch the OS.

**Firewall — `ufw` (done):** default **deny incoming / allow outgoing**; `22/tcp` **LIMIT**
(rate-limit throttle, on top of fail2ban), `80/tcp` and `443/tcp` **ALLOW** (IPv4 + IPv6). Rules
were added *before* `ufw enable`, 22 first, so there was no lockout window.
- **443** — HTTPS (the app, via nginx).
- **22** — SSH (key-only, below).
- **80** — **ACME http-01 challenge + http→https redirect ONLY.** No app content on 80. It must be
  world-reachable: Let's Encrypt validates from many unpublished IPs (multi-perspective
  validation), so 80 can't be source-IP-locked. Without 80 open, the IP cert's daily renewal
  fails and HTTPS lapses within a week (see §2). This supersedes the earlier "443 + 22 only" plan,
  which contradicted the renewal method.

**SSH — key-only (done):** publickey-only **ed25519** auth; the private key + passphrase stay on
the owner's machine, only the `.pub` is in the server's `~/.ssh/authorized_keys`. Hardened via
drop-in `/etc/ssh/sshd_config.d/10-mba-vault-hardening.conf` (`PasswordAuthentication no`,
`KbdInteractiveAuthentication no`, `PubkeyAuthentication yes`, `PermitRootLogin prohibit-password`).
ssh is **socket-activated**, so changes were applied with `systemctl restart ssh.socket` after
`sshd -t` validated them. Out-of-band backstop: the Hetzner **VNC console** (OS root password),
which is independent of sshd.

**fail2ban (done):** `[sshd]` jail, `backend = systemd` (reads the journal — correct for
socket-activated ssh), `maxretry 5` / `findtime 10m` / `bantime 1h` with `bantime.increment = true`.
With password auth off this mainly sheds bot noise and escalates repeat offenders. The owner's home
IP can be added to `ignoreip` as self-ban insurance.

**Automatic security updates (done):** `unattended-upgrades` armed via
`/etc/apt/apt.conf.d/20auto-upgrades` (daily package-list refresh + unattended security upgrades).
Kernel updates need a reboot — currently **manual** (optional `Automatic-Reboot` at 04:00 available).

**How to verify:**
- `sshd -T | grep -i passwordauthentication` → `no`; from another host
  `ssh -o PubkeyAuthentication=no root@<ip>` → `Permission denied (publickey).`
- `ufw status verbose` → deny incoming; `22 LIMIT`, `80/443 ALLOW`; a fresh SSH session still connects.
- `fail2ban-client status sshd` → jail active.
- `systemctl status unattended-upgrades` → active; `unattended-upgrades --dry-run --debug` lists allowed origins.

---

## 4. CI/CD deploy key  ✅ (Phase 2)

**Why:** Pushes to `main` auto-redeploy the box over SSH. That means a key with server
access lives in GitHub. We shrink its blast radius so a leak can't do more than re-pull an
already-public image.

**How it's built:**
- **Dedicated, passphraseless key** (`ed25519`), separate from the personal admin key. CI
  can't type a passphrase — so the passphrase protection is replaced by the forced command below.
- **Forced command.** The server-side `authorized_keys` entry for this key is prefixed:
  `command="/opt/mba-vault/deploy.sh",no-agent-forwarding,no-port-forwarding,no-x11-forwarding,no-pty …`.
  sshd runs **only** `deploy.sh` no matter what the client requests — no shell, no tunnel,
  no file access. A leaked CI key can only trigger a redeploy.
- **`deploy.sh`** (root-owned, `755`): `docker compose pull && docker compose up -d`, prune,
  then a loopback health check on `/vault/api/health`.
- **Host-key pinning.** The runner trusts the box via a `SSH_KNOWN_HOSTS` secret verified
  against the fingerprint already in the operator's `known_hosts` — not blind TOFU.
- **No registry creds on the box:** the GHCR image is public, so `docker compose pull` needs
  no login and there are no registry secrets server-side.
- **GitHub secrets:** `SSH_HOST`, `SSH_USER` (`root`), `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`.
  The private key is set via `gh secret set … < file` and never appears in the repo or chat.

**Verify:**
- `ssh -i deploy_key root@<ip> "cat /etc/passwd"` → still runs `deploy.sh`, ignores the command.
- `ssh -i deploy_key -N root@<ip>` (tunnel attempt) → rejected (`no-port-forwarding`).
- A push to `main` shows the `deploy` job green; `docker inspect -f '{{.Image}}' mba-vault` on the
  box matches the new digest; `/vault` serves the new build.

---

## 5. Browse & file serving — path traversal  ✅ (Phase 4)

**Why:** Browse turns **untrusted URL path segments into filesystem reads** over the coursework
on `/data`. The classic attacks are **path traversal** (`/vault/browse/../../etc/passwd` → read
anything the process can) and **symlink escape** (a link inside `/data` pointing at `/etc`). One
sloppy `path.join` and the whole disk is downloadable.

**What's built** — every path funnels through a single guard, `safeResolve()`
(`app/src/lib/browse/data-dir.ts`); nothing else touches the data dir:
- **Two-stage defense.**
  1. **Lexical** (pure string math, no FS): reject any segment that is `..`, contains a separator
     (`/` or `\`), a `:` (Windows drive / alternate data stream), a NUL byte, or is empty; join the
     rest under `DATA_DIR`; then confirm the joined path is still **inside** `DATA_DIR`.
  2. **`realpath`**: canonicalize the resolved path and **re-check containment**, so a symlink that
     is lexically clean but points outside `/data` is caught on the *real* target, not the link name.
- **Least privilege on the mount:** `/data` is mounted **read-only** in the container
  (`/data:/data:ro`), and the image is code-only — the documents never live in git or the image.
- **Only regular files are served.** Listings hide dotfiles and anything that isn't a plain file or
  folder (symlinks, devices); `resolveFile` refuses directories and non-regular files.
- **Decode-before-guard.** Next 16 hands **page** catch-all params **URL-encoded**, so the browse
  page `decodeURIComponent`s each segment **and then** runs the guard — an encoded `..` (`%2e%2e`)
  still decodes to `..` and is rejected. (A raw `..` in the URL is normalized away by Next into a
  redirect before it ever reaches the page.)
- **Serving headers:** `Content-Disposition` inline for PDFs/images/text, attachment for Office
  files (with an RFC 5987 `filename*` for names with spaces/unicode); `Cache-Control: private,
  no-store` so private materials never sit in a shared cache. The file route is under `/api/*`, so
  the auth gate (§1) protects it too.

**How to verify:**
- `curl` an authenticated `GET /vault/api/files/../../etc/passwd` (and `%2e%2e` variants) → `404`,
  never file contents.
- A symlink planted inside `/data` pointing outside it → `404`.
- Unit tests exercise traversal/malformed segments and a real symlink-escape (NTFS junction on
  Windows, symlink on Linux) — see `data-dir.test.ts`.

---

## 6. Application-level limits — `/ask`  ✅ (Phase A — live in prod 2026-07-07)

**Why:** `/ask` is the one endpoint that spends money (Gemini calls) and reads the whole
vector index. If the URL is discovered, both the data and the Gemini bill need a backstop
beyond auth alone.

**What's built** (`app/src/app/api/ask/route.ts`):
- **Auth-gated like everything else.** `/api/ask` sits under `/api/*` and is **not** in
  `isPublicPath()`, so the §1 proxy gate returns **`401`** to any unauthenticated request —
  the Gemini call is never reached without a valid session.
- **Rate-limited** (`app/src/lib/ask/ratelimit.ts`): `rate-limiter-flexible` in-memory,
  **30 questions/hour per IP**. The client IP comes from the same nginx-aware `clientIp()`
  helper as login (§1: `X-Real-IP` → leftmost `X-Forwarded-For` → `"unknown"`). Over the
  limit → **`429`** with a `Retry-After` header. Auth already caps this to one user, so this
  is a **cost backstop** (a stuck client, a loop), not an anti-abuse wall.
- **Input length capped.** The question must be a non-empty string (**`400`** otherwise) and
  is capped at **`MAX_QUESTION_CHARS = 2000`** (**`400`** if longer) — checked before any
  embedding or generation spend.
- **Gemini key is server-side only.** The route reads `process.env.GEMINI_API_KEY` (loaded
  from the box `.env`, supplied to CI as a GitHub Actions secret — §0) inside the server
  route handler; it is **never** sent to the browser or embedded in any client bundle. If the
  key is absent the route returns **`503`** ("Ask is not configured") rather than failing obscurely.

**How to verify:**
- `curl -k -X POST https://<ip>/vault/api/ask -d '{"question":"hi"}'` **without a session → `401`**.
- Authenticated: an empty/missing `question` → `400`; a question over 2000 chars → `400`.
- The 31st authenticated question within an hour from one IP → `429` with `Retry-After`.
- `grep -rn GEMINI_API_KEY app/src` shows it read **only** in the server route; searching the
  built client bundle (`app/.next`) for the key value returns nothing, and it appears in no
  network response in dev tools.

---

## 7. LLM hardening  ✅ (Phase A — live in prod 2026-07-07)

**Why:** Keep the model on-task and limit prompt-injection blast radius. This is **mitigated,
not eliminated** — acceptable for one user asking over their **own** documents, where hostile
instructions embedded in a source chunk can only ever mislead that same user.

**What's built** (`app/src/lib/ask/answer.ts`, `gemini.ts`):
- **No tools, no actions.** Generation calls `generateContentStream` with only a
  `systemInstruction` and the prompt text — **no function/tool declarations are configured**,
  so the model can do nothing but emit answer text. There is no path from a model output to a
  filesystem read, a network call, or any side effect.
- **Fixed role via system instruction.** `SYSTEM_INSTRUCTION` pins the assistant to answer
  **only from the numbered source excerpts** provided (the user's retrieved coursework), cite
  them inline as `[n]`, and **decline honestly** ("I don't have that in the coursework") when
  the excerpts don't cover the question — explicitly **no outside knowledge, no guessing**.
- **Grounded in the user's own corpus.** The prompt is assembled from the top-K (`TOP_K = 8`)
  retrieved chunks of the owner's documents; the model sees nothing but those excerpts, the
  (capped) conversation so far, and the question.
- **Input length capped** at 2000 chars (§6), applied before generation.
- **Follow-up context capped server-side.** Prior turns sent for context are trimmed by
  `capHistory()` to the **last 3 turns**, each prior answer truncated to **800 chars**
  (`MAX_HISTORY_TURNS = 3`, `MAX_HISTORY_ANSWER_CHARS = 800`). This is **authoritative on the
  server** (the client mirrors it, but `route.ts` re-applies the cap and drops any malformed
  history entry), so a crafted client can't grow the prompt — and the token bill — without bound.

**How to verify:**
- Ask something outside the coursework (e.g. "What's the capital of France?") → the model
  declines rather than answering from general knowledge.
- The Gemini request carries no `tools`/`functionDeclarations` (see `gemini.ts` — config is
  `systemInstruction` only).
- Unit tests cover the caps and prompt assembly (`answer.test.ts`): the 3-turn/800-char
  `capHistory`, the retrieval-query concat, and that history renders under a "Conversation
  so far" block with a "Follow-up question" label.

---

### Honest caveats
Public access trades the "invisible to the internet" privacy of a VPN-only design for
convenience. That's a reasonable choice here — but it is exactly why the auth + rate-limiting
above are load-bearing. Prompt injection is mitigated, not eliminated.
