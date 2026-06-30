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

## 1. Authentication  ⬜ (Phase 3 — "Auth first")

**Why:** With the app public, a guessed/stolen credential is the whole game. So: a strong
unique password, hashed with a memory-hard algorithm; a second factor; and lockout so the
login can't be brute-forced.

**Plan:**
- Session via encrypted, **http-only, Secure, SameSite** cookie (`iron-session`). http-only
  keeps JavaScript (and XSS) from reading it; Secure keeps it off plain HTTP; SameSite blunts
  CSRF. Sensible expiry.
- Password hashed with **Argon2id** (`argon2`).
- **TOTP 2FA** (`otplib`/`otpauth`) — authenticator-app codes, low effort, high value.
- **Login rate-limiting + lockout** (`rate-limiter-flexible`, in-memory): throttle per IP
  and lock an account after N failed attempts.

**How to verify (when built):** wrong password N times → locked out; 2FA required after
password; session cookie shows `HttpOnly; Secure; SameSite` in dev tools.

---

## 2. Transport & HTTPS  ⬜ (Phase 2 — "Server prep")

**Why:** HTTPS protects the login and session in transit and is required for a PWA
(secure-context) and for service workers.

**Plan (decided: no domain → Let's Encrypt IP certificate):**
- Public HTTPS via a **Let's Encrypt IP certificate** (short-lived, ~6.7 days).
- **`lego`** issues/renews it with the `shortlived` ACME profile (Caddy can't issue certs
  for a bare IP). A **daily** systemd timer renews early (cert is too short-lived for the
  default 30-day window) and reloads the proxy.
- A **dead-man's-switch alert** fires if a renewal is missed — a silent 2-day outage already
  burns a third of the cert's life.
- The Next.js app binds to **localhost**; a reverse proxy terminates TLS and forwards to it.

**How to verify (when built):** `openssl s_client -connect <ip>:443 | openssl x509 -noout -dates`
shows a ~6-day window that keeps moving forward day to day; killing the timer triggers the alert.

---

## 3. Network & host hardening  ⬜ (Phase 2)

**Why:** Shrink the attack surface to the two ports we actually need.

**Plan:**
- Firewall: **443 + 22 only**.
- SSH: **key-based login only**, passwords disabled.
- **fail2ban** bans IPs that brute-force SSH (and, later, the app login).
- Automatic security updates.

**How to verify (when built):** `ss -tlnp` shows only 22/443 public; SSH password login refused;
`fail2ban-client status sshd` lists bans after repeated bad logins.

---

## 4. Application-level limits  ⬜ (Phase 7 — `/ask`)

**Why:** Protects both the data and the Gemini bill if the URL is discovered.

**Plan:** rate-limit the `/ask` endpoint; cap input length; Gemini key stays server-side.

---

## 5. LLM hardening  ⬜ (Phase 8)

**Why:** Keep the model on-task and limit prompt-injection blast radius (mitigated, not
eliminated — acceptable for one user over their own documents).

**Plan:** the model gets **no tools/actions**; a **system instruction** fixes its role
("answer only from the provided coursework; if it's not covered, say so"); input-length caps.

---

### Honest caveats
Public access trades the "invisible to the internet" privacy of a VPN-only design for
convenience. That's a reasonable choice here — but it is exactly why the auth + rate-limiting
above are load-bearing. Prompt injection is mitigated, not eliminated.
