# Session log — 2026-08-05

*Vault cleanup pass (Plan B work order): Task 0 verification, Task 1 moves/deletions,
Task 2 duplicate report, local↔box reconciliation, box→local restores, B3 prep.
No secrets in these logs — public repo.*

## Findings that changed the plan

- **Incremental re-indexing is built and default-on** — the architecture doc's "later"
  claim was stale (corrected in PR #48). Reuse is content-hash + chunk-id
  (`ingestion/src/incremental.ts:46-48`); chunk ids embed the relative path
  (`ingestion/src/document-chunker.ts:9`), so **moved files re-embed even if unchanged**.
- **Byte-hash duplicate detection finds nothing here.** SHA-256 over all 821 corpus files:
  zero identical pairs. The real duplicates differ in container metadata while the
  *extracted text* is identical — the sweep that works hashes extracted text (26 exact
  groups, 59 near-duplicate pairs at Jaccard ≥ 0.90).
- **Local is NOT automatically the master.** Reconciliation (full file listing both sides)
  found 14 real coursework files that existed only on the box — local had lost them
  (OneDrive and/or manual cleanup since the last push). All 14 were restored box→local,
  byte-verified, before any push planning. A `--delete` push without this check would have
  destroyed them silently.
- **Two corrupt pptx** (unreadable zip, truncated at exact-KiB sizes — sync artifacts)
  had intact local siblings under different names; recovered by rename, nothing lost.
  The box copies were equally corrupt, so the box was no rescue there.

## Operational landmines (will bite again)

- **UFW `22 LIMIT` throttles rapid successive SSH connections** (~6 per 30 s per IP,
  SECURITY.md §3). A per-file `scp` loop got the laptop IP temporarily blocked after
  5 files — it looks like "connection timed out", not an auth error, and it is NOT
  fail2ban (no auth failures involved; recovers in under a minute of backing off).
- **Standing pattern for batch remote work: one connection.** Bundle N files into a
  single stream: `tar -czf - <files> | ssh … "tar -xzf - -C <dest>"`, or for
  PowerShell-mediated transfers where binary pipes mangle, `ssh … "tar -czf - … | base64 -w0"`
  and decode locally. Both directions verified today (14-file restore, corpus upload).
- **Windows quoting for remote paths:** through PowerShell→ssh, inner single quotes
  survive; inner double quotes are stripped unless written as `\"`. Windows `scp` (sftp
  mode) takes the remote path literally — plain spaces inside one quoted argument, no
  backslash escapes. Git Bash's own `ssh` has no usable key; the Windows OpenSSH binary
  (`/c/Windows/System32/OpenSSH/ssh.exe`) works from Git Bash and holds the agent key.
- **This laptop has no rsync** (absent from Git Bash; WSL broken). B3 sync therefore
  stages the corpus via tar-over-ssh and runs real `rsync --delete` ON the box, with a
  dry-run reviewed first. First-ever `--delete` run is preceded by a tarball snapshot at
  `/root/data-snapshot-2026-08-05.tar.gz` (1.67 GB, off `/data`, verified listable).
- **Quarantine over hard-delete** for corpus removals: everything dropped today went to a
  path-mirrored `_removed-2026-08-03` folder outside the corpus root. Caveat observed: a
  quarantined `.acsm` DRM stub vanished on its own shortly after the move (not by any
  command run in-session; OneDrive/Defender suspected) — quarantine is not archival-safe
  for oddball filetypes.

## State after this session

- 12 misfile moves + 1 rename executed (all content-verified by extraction before moving),
  26 duplicate copies + 2 corrupt pptx quarantined, 14 box-only files restored,
  5 project meta-files evicted from the corpus root (3 into `docs/`, PR #48).
- Local corpus: 802 files / ~1.72 GB, 17 course folders. Box untouched except the snapshot.
- OCR backlog re-sized: 26 image-only PDFs (330 pages) + 7 docx + 1 xlsx extract almost
  no text (was scoped as ~27).
- Held/pending: B3 dry-run review, then push; OCR (Plan A1) and Excel indexing (Plan A2)
  remain out of scope.
