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

## 5. Application-level limits  ⬜ (Phase 7 — `/ask`)

**Why:** Protects both the data and the Gemini bill if the URL is discovered.

**Plan:** rate-limit the `/ask` endpoint; cap input length; Gemini key stays server-side.

---

## 6. LLM hardening  ⬜ (Phase 8)

**Why:** Keep the model on-task and limit prompt-injection blast radius (mitigated, not
eliminated — acceptable for one user over their own documents).

**Plan:** the model gets **no tools/actions**; a **system instruction** fixes its role
("answer only from the provided coursework; if it's not covered, say so"); input-length caps.

---

### Honest caveats
Public access trades the "invisible to the internet" privacy of a VPN-only design for
convenience. That's a reasonable choice here — but it is exactly why the auth + rate-limiting
above are load-bearing. Prompt injection is mitigated, not eliminated.
