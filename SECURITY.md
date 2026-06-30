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
- Public HTTPS via a **Let's Encrypt IP certificate** (short-lived, ~6.7 days), issued for the
  box's bare public IP under the `shortlived` ACME profile.
- **`lego`** issues/renews it using the **http-01 challenge in webroot mode**: nginx stays up
  permanently and serves the validation file `lego` writes under the ACME webroot
  (`/.well-known/acme-challenge/`). No port juggling, no renewal downtime.
  - *Why http-01 and not the alternatives:* **tls-alpn-01** runs over 443 — which nginx already
    owns — so it would force either daily nginx downtime or fragile ALPN routing; **dns-01**
    can't be used for a bare IP (nothing to put in DNS). **Caddy** is not used to *issue* the
    cert either: it can't issue Let's Encrypt certs for a bare IP.
  - This is **why port 80 must be open** (see §3). It serves only the ACME challenge and an
    http→https redirect.
- A **daily** systemd timer renews early — the cert is far too short-lived for `lego`'s default
  30-day renewal window, so we force renewal while several days of life remain — and reloads nginx.
- A **dead-man's-switch alert** fires if a renewal is missed — a silent 2-day outage already
  burns a third of the cert's life.
- The Next.js app binds to **localhost**; nginx terminates TLS on 443 and forwards to it.

**Before writing the renewal script (implementation-time check):** re-confirm against current
Let's Encrypt docs that **http-01 is accepted for a bare-IP identifier under the `shortlived`
profile**, plus the exact `lego` webroot flags. (Prior research: http-01 and tls-alpn-01 are
supported for IP certs and dns-01 is not — but verify before relying on it.)

**How to verify (when built):** `openssl s_client -connect <ip>:443 | openssl x509 -noout -dates`
shows a ~6-day window that keeps moving forward day to day; `curl -sI http://<ip>/` returns a 301
to https; killing the timer triggers the dead-man's-switch alert.

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
