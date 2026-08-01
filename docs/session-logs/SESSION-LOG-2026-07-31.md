# Session log — 2026-07-31

*MCP connector: Phase 3 deploy + live connect, and the file-access build. One file per
session, dated-file convention (`docs/session-logs/SESSION-LOG-YYYY-MM-DD.md`). No
secrets in these logs, ever — this repo is public.*

## VERIFIED: IP-literal HTTPS + self-hosted OAuth 2.1 work with Claude.ai custom connectors

The Phase 0 UNVERIFIED risk is closed. A custom connector at
`https://95.216.159.93/vault/api/mcp` (bare IP, no domain, Let's Encrypt IP certificate)
completed the full flow end-to-end against our hand-rolled authorization server:
discovery (401 `WWW-Authenticate` → PRM → AS metadata) → dynamic client registration →
PKCE S256 authorize → login + TOTP → consent → code → token exchange → working
`search_vault` calls in a Claude chat. The DuckDNS + standard-cert fallback is retired
unbuilt. Claude's traffic arrived from the documented `160.79.104.0/21` range.

## Trap: nginx sites-enabled held a COPY, not a symlink

Edits to the `sites-available` file did nothing after `systemctl reload nginx` — because
`/etc/nginx/sites-enabled/` contained a *copy* of the site file, not the standard
symlink, so nginx kept serving the stale enabled copy. **The copy also masked a second,
pre-existing bug**: the `sites-available` file being edited contained an invalid block —
`location /vault { ... }` with a literal `...` ellipsis (evidently from a
paste-from-docs long ago) — and `nginx -t` kept passing anyway, because `-t` validates
what nginx actually loads (`sites-enabled`), not the file being edited. Two lessons:

- Check `ls -l /etc/nginx/sites-enabled/` for symlink-ness before editing anything;
  fix with a real symlink (`ln -sf ../sites-available/<site>`).
- `nginx -t` passing proves nothing about a file that isn't linked into the live
  config. Verify what's actually loaded with `nginx -T | grep <your-change>`.

## Runbook gap: /state/mcp ownership on first write

The MCP OAuth stores are the first feature to create a NEW subdirectory under the
`/state` volume from inside the container, and the container user couldn't create
`/state/mcp/*` until ownership on the volume was fixed. Deploy runbook addition: when a
release introduces a new state subdirectory, verify container write access immediately
after deploy — `docker exec mba-vault node -e "require('fs').mkdirSync('/state/<dir>',
{recursive:true})"` — rather than waiting for the first runtime write to fail.

## Also this session

- MCP file-access build (branch `feat/mcp-file-access`): `list_files` + `get_document`
  tools, `read` scope alongside `search`, `search_vault` result-count param. Excel and
  un-OCR'd image PDFs (not in the index) get an explicit browse-only response from
  `get_document` rather than a bare error.
- Committed e2e fixture index under `app/test-fixtures/data/.index/` — four hand-written
  SYNTHETIC chunks, zero real course content (private corpus, public repo), with a
  scoped `.gitignore` negation so the blanket `.index/` exclusion stays intact.
