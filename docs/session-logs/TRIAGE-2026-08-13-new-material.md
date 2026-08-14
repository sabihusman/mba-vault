# Triage — New Material (Step 1)

**Date:** 2026-08-13
**Scope:** Read-only. No ingestion run, no index change, no file moves, no commits. This report is the only file created.
**Machine:** local Windows laptop only. No SSH to the box was performed.
**Target:**

- `C:\Users\sabih\OneDrive\Documents\MBA Coursework\Reference & Papers`
- `C:\Users\sabih\OneDrive\Documents\MBA Coursework\School & Coursework`

**Status:** §1–§3 complete. **§4 not run** — gated on explicit approval.

---

## 1. Numbers

Explorer's figures treated as a claim and checked independently.

| Metric | Explorer claim | Verified | Verdict |
|---|---|---|---|
| Files | 1,219 | **1,219** | match |
| Folders | 451 | **449** | gap of 2, explained below |
| Size | 1.05 GB | **1,128,529,854 B** = 1.0510 GiB | match |

Per-folder breakdown:

| Folder | Files | Folders | Bytes |
|---|---|---|---|
| Reference & Papers | 1,082 | 440 | 713,970,727 |
| School & Coursework | 137 | 9 | 414,559,127 |
| **Total** | **1,219** | **449** | **1,128,529,854** |

**The 2-folder gap.** `files_all` equals `files_visible` in both trees — there are no hidden or system entries anywhere in the target set (no `desktop.ini`), so the gap is *not* a hidden-file artifact. The remaining explanation is that a multi-selection Properties dialog counts the two selected root folders themselves in its "Folders" total: 449 descendants + 2 roots = 451. This is arithmetic consistency, not an observation — see UNVERIFIED #2.

**Size units.** Explorer's "GB" is GiB. 1,128,529,854 / 1024³ = 1.0510 GiB, which rounds to the displayed 1.05 GB. In decimal units the same figure is 1.129 GB.

**These files are not in the current index.** The existing `ingestion/.index/manifest.json` holds 651 file entries across 19 top-level segments; **zero** of them fall under either target folder. This was checked directly rather than assumed, because `discoverFiles()` walks the entire corpus root and both target folders sit inside it, so prior ingestion runs should structurally have seen them.

```
Reference & Papers   -> manifest entries: 0
School & Coursework  -> manifest entries: 0
total manifest entries: 651
```

Manifest top-level segments (none is a target folder): Data and Decisions, Dynamics of Negotiation, Investments, Leadership and Personal Development, MIT Courses, Managerial Economics, Managerial Finance, Marketing, Maximizing Team Performance, Operations and Supply Chain Management, Product Experimentation, Product Management, Project Management, Strategic Brand Positioning, Strategic Mgmt of Tech and Innovation, Strategy, Strategy In Action, `Study Guide MBA.docx`, `The Comprehensive MBA Concepts Master Study Guide.docx`.

The *cause* of the absence is not established — see UNVERIFIED #8.

---

## 2. OneDrive placeholder status

**Result: no cloud-only files. Nothing will hydrate. §4 is not blocked by §1.**

Detection was verified before being relied on, via two independent methods.

### Method 1 — attribute flags (metadata only)

`Get-ChildItem` reads directory entries and never opens a data stream, so it cannot trigger recall. Five Files-On-Demand attribute bits were counted separately rather than assuming which one this machine uses:

| Flag | bit | count in target set | count in all of `C:\Users\sabih\OneDrive` |
|---|---|---|---|
| `FILE_ATTRIBUTE_OFFLINE` | `0x1000` | 0 | 0 |
| `FILE_ATTRIBUTE_RECALL_ON_OPEN` | `0x40000` | 0 | 0 |
| `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS` | `0x400000` | 0 | 0 |
| `FILE_ATTRIBUTE_PINNED` | `0x80000` | 0 | 1 |
| `FILE_ATTRIBUTE_UNPINNED` | `0x100000` | 0 | 1 |
| `FILE_ATTRIBUTE_REPARSE_POINT` | `0x400` | 0 | 0 |

The whole-OneDrive scan covered **352,816 files**. The single PINNED and single UNPINNED hit are the same file — `C:\Users\sabih\OneDrive\.849C9593-D756-4E56-8D6E-42412F2A707B`, 63 B, attributes `0x180026` (Hidden+System+Archive+Pinned+Unpinned). That is OneDrive's own sync-root marker file, not a user document, so it is weak evidence that the engine stamps user files.

The load-bearing result here is instead **zero reparse points across all 352,816 files**. A dehydrated OneDrive placeholder is necessarily a reparse point (`IO_REPARSE_TAG_CLOUD`); zero reparse points means zero placeholders.

### Method 2 — allocated bytes vs logical bytes (metadata only, all 1,219 files)

`GetCompressedFileSizeW` returns bytes actually allocated on disk. It takes a path and queries file-system metadata; it never opens the data stream, so it cannot trigger recall. Run over **every** file, not a sample, with the `\\?\` prefix so long paths could not silently fail.

```
control (known-local file, written by the 2026-08-06 OCR run):
  Marketing\Bridges Test Case 1.ocr.txt   logical=9567  allocated=9567

target set:
  checked             : 1219
  zero-allocation     : 0
  query errors        : 0
  total logical bytes : 1128529854
  total on-disk bytes : 1128529854
```

Every file's on-disk allocation equals its logical size, and the two totals match to the byte. A dehydrated placeholder would report a nonzero logical size with zero allocation; none does.

**What could not be tested:** the work order asked for a comparison against "one file you believe is cloud-only." No such file exists anywhere on this machine, so the true-positive half of the test was impossible rather than skipped. See UNVERIFIED #1.

---

## 3. Inventory (§2)

### 3.1 Reference & Papers — by extension

| Ext | Count | Bytes |
|---|---|---|
| `.html` | 421 | 22,756,513 |
| `.json` | 252 | 4,664,035 |
| `.pdf` | 137 | 331,234,162 |
| `.js` | 91 | 21,223,926 |
| `.vtt` | 26 | 2,834,766 |
| `.srt` | 26 | 2,999,776 |
| `.webvtt` | 24 | 3,694,977 |
| `.svg` | 21 | 30,544 |
| `.png` | 17 | 188,081 |
| `.xml` | 14 | 153,185 |
| `.css` | 8 | 1,407,989 |
| `.map` | 8 | 2,127,561 |
| `.zip` | 6 | 318,582,638 |
| `.ttf` | 5 | 1,151,360 |
| `.jpg` | 5 | 842,538 |
| `.woff2` | 3 | 15,600 |
| `.gif` | 3 | 3,407 |
| `.md` | 2 | 24,033 |
| `.keep` | 2 | 0 |
| `.cjs` | 2 | 241 |
| `.mjs` | 2 | 186 |
| `.woff` | 2 | 18,180 |
| `.mts` | 1 | 44 |
| `.42368b5a19b817284b3c` | 1 | 11,358 |
| `.ico` | 1 | 5,558 |
| `.txt` | 1 | 69 |
| (no extension) | 1 | 0 |
| **Total** | **1,082** | **713,970,727** |

### 3.2 Reference & Papers — top-level subfolders

| Files | Bytes | Name |
|---|---|---|
| 704 | 55,005,570 | `6.s897-spring-2019` |
| 320 | 245,158,222 | `6.7960-fall-2024` |
| 49 | 63,987,580 | `MIT 6.S897 Lectures` |
| 9 | 349,819,355 | *(files sitting at the folder root)* |

Three top-level subfolders. Note that 9 loose files at the root account for 349.8 MB — 49% of this tree's bytes — which is consistent with the 6 `.zip` archives (318.6 MB) living there, though the location of individual zips was not separately confirmed.

### 3.3 School & Coursework — by extension

| Ext | Count | Bytes |
|---|---|---|
| `.pptx` | 37 | 368,504,526 |
| `.docx` | 36 | 22,578,453 |
| `.pdf` | 20 | 19,806,837 |
| `.xlsx` | 16 | 400,138 |
| `.html` | 11 | 1,416,516 |
| `.json` | 8 | 1,587,049 |
| `.md` | 5 | 137,045 |
| `.zip` | 2 | 62,090 |
| `.xls` | 1 | 62,976 |
| `.csv` | 1 | 3,497 |
| **Total** | **137** | **414,559,127** |

### 3.4 School & Coursework — top-level subfolders

| Files | Bytes | Name |
|---|---|---|
| 65 | 201,369,266 | `MBA` |
| 63 | 211,601,312 | `AI & PM Courses` |
| 9 | 1,588,549 | `Licensing Exams` |

### 3.5 Nesting depth and path length

| Metric | Reference & Papers | School & Coursework |
|---|---|---|
| Max depth (path segments below root, including filename) | 4 | 3 |
| Longest full path | **265 chars** | 161 chars |
| Files > 240 chars | 43 | 0 |
| Files > 259 chars (past `MAX_PATH`) | 28 | 0 |
| Directories > 240 chars | 0 | 0 |

Longest path (265 chars):

```
C:\Users\sabih\OneDrive\Documents\MBA Coursework\Reference & Papers\6.s897-spring-2019\_all_files_flattened\external-resources__biases-in-electronic-health-record-data-due-to-processes-within-the-healthcare-system-ret5014ffea-2e9c-48b7-8bcf-0d3f8a2e6305__index.html
```

All 43 over-length paths are in `6.s897-spring-2019\_all_files_flattened\`, a directory of 605 entries whose filenames encode a flattened URL plus a UUID.

**Long paths work locally — tested, not assumed:**

```
HKLM\SYSTEM\CurrentControlSet\Control\FileSystem  LongPathsEnabled = 1

node v24.18.0
path length: 265
statSync OK, size= 52395
readdirSync OK, entries= 605
```

Node 24 stats the longest path and reads its parent directory without error, and `GetCompressedFileSizeW` returned 0 errors across all 1,219 files. So local discovery/extraction is not at risk from path length. The exposure is on the Windows→box transfer path and on any tool that does not opt into long-path support; that was not tested (no SSH permitted this session).

### 3.6 Risky characters

| Check | Reference & Papers | School & Coursework |
|---|---|---|
| `&` in file names | 0 | 0 |
| `#` in file names | 0 | 0 |
| `%` in file names | 0 | 0 |
| Non-ASCII in file names | 0 | 0 |
| Trailing space in base name | 0 | 0 |
| Leading `~$` (Office lock files) | 0 | 0 |
| Risky chars in folder names | 0 | **1** — `AI & PM Courses` |

The only hit is the folder `AI & PM Courses` (ampersand). Note both target roots themselves also contain an ampersand and a space, which is why every path in this report is quoted.

### 3.7 Zero-byte files

6 total, all in Reference & Papers, none in a parseable format:

```
6.7960-fall-2024\.keep
6.7960-fall-2024\static_shared\js\instructor_insights.41451.js
6.s897-spring-2019\.keep
6.s897-spring-2019\static_shared\js\instructor_insights.41451.js
6.s897-spring-2019\_all_files_flattened\keep
6.s897-spring-2019\_all_files_flattened\static_shared__js__instructor_insights.41451.js
```

The two `.keep` files are dot-prefixed and would be skipped by the walker's dotfile rule regardless ([`discover.ts:26`](../../ingestion/src/discover.ts)). The remaining four are `.js` / extensionless and fall outside the parsed set. No zero-byte file poses an ingestion risk.

---

## 4. Format buckets (§3)

**Supported-extension set, read from code:**

[`ingestion/src/discover.ts:8-13`](../../ingestion/src/discover.ts)

```ts
const KIND_BY_EXT: Record<string, DocKind | undefined> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".pptx": "pptx",
  ".txt": "txt",
};
```

Dispatch confirming all four are actually extracted: [`ingestion/src/extract/index.ts:9-22`](../../ingestion/src/extract/index.ts) — `pdf` → `extractPdf`, `docx` → `extractDocx`, `pptx` → `extractPptx`, `txt` → `extractTxt` (line 19-20).

Skip rules that also apply: dotfiles and dot-directories are skipped at [`discover.ts:26`](../../ingestion/src/discover.ts); any extension not in `KIND_BY_EXT` is skipped at [`discover.ts:33-34`](../../ingestion/src/discover.ts).

> **Correction to the work order.** §3's table places `.txt` in "Not a parsed format." That is no longer true — `.txt` **is** parsed, added by PR #50 (form-feed split, one unit per page). `.md` is *not* parsed and is correctly assumed unsupported.

### Buckets

| Bucket | Reference & Papers | School & Coursework | Total files | Total bytes |
|---|---|---|---|---|
| Parseable now — PDF/DOCX/PPTX | 137 | 93 | **230** | 742,123,978 |
| Parseable now — `.txt` (supported) | 1 | 0 | **1** | 69 |
| Excel — held for A2 | 0 | 17 | **17** | 463,114 |
| Not a parsed format | 897 | 27 | **924** | 384,872,565 |
| Media (images/audio/video) | 47 | 0 | **47** | 1,070,128 |
| **Total** | **1,082** | **137** | **1,219** | **1,128,529,854** |

Bucket totals reconcile exactly against the per-folder file counts and byte sums in §3.

**Composition of the 924 "not a parsed format" files:**

- **Course-website scaffolding, 828 files:** `.html` 432, `.json` 260, `.js` 91, `.xml` 14, `.css` 8, `.map` 8, `.cjs` 2, `.mjs` 2, `.mts` 1, plus fonts `.ttf` 5, `.woff2` 3, `.woff` 2. These are the machinery of two mirrored MIT OpenCourseWare sites, not documents.
- **Lecture transcripts / subtitles, 76 files (9.5 MB):** `.vtt` 26, `.srt` 26, `.webvtt` 24. These are plain text and substantive.
- **Archives, 8 files (318.6 MB):** `.zip` 6 + 2. Contents not inspected (that requires reading file contents).
- **Markdown, 7 files (161 KB):** `.md` 2 + 5.
- **Other, 5 files:** `.csv` 1, `.keep` 2, `.42368b5a19b817284b3c` 1, extensionless 1.

Reconciliation: 828 + 76 + 8 + 7 + 5 = 924.

---

## 5. Content findings (§4)

Run 2026-08-13 after explicit approval. Read-only throughout: no archive was extracted, no file was written, no index was touched.

### 5.1 (§4a) Zip inventory — 8 archives, listed without extracting

Listing used `[System.IO.Compression.ZipFile]::OpenRead()`, which streams the central directory off disk. No entry stream was opened, so nothing was decompressed and nothing was written. Per the work order, encryption was **not** probed — detecting it requires opening an entry. All 8 archives listed successfully; none failed, and none reported as unreadable.

| # | Archive | On disk | Uncompressed | Files | Verdict |
|---|---|---|---|---|---|
| 1 | `Reference & Papers\6.7960-fall-2024.zip` | 231,095,827 | 276,117,246 | 509 | **Website mirror** + 54 PDFs |
| 2 | `Reference & Papers\6.s897-spring-2019.zip` | 74,208,142 | 121,741,019 | 776 | **Website mirror** + 76 PDFs |
| 3 | `…6.7960-deep-learning-documents\blog_template.zip` | 218,710 | 251,761 | 12 | Neither — an HTML template scaffold |
| 4 | `…6.7960-deep-learning-documents\hw3-tex.zip` | 457,628 | 544,565 | 8 | **Documents** — LaTeX source + 2 PDFs |
| 5 | `…6.7960-deep-learning-documents\hw4-tex.zip` | 6,544,079 | 7,174,097 | 38 | **Documents** — LaTeX source + 21 PDFs |
| 6 | `…6.7960-deep-learning-documents\hw5.zip` | 6,058,252 | 6,566,273 | 29 | **Documents** — LaTeX source + 7 PDFs |
| 7 | `School & Coursework\AI & PM Courses\Loop Engineering course module.zip` | 47,520 | 169,922 | 8 | Neither — a design-handoff bundle (HTML/JS/CSS/MD) |
| 8 | `…AI & PM Courses\Juno\juno-rag-bayesian-handoff.zip` | 14,570 | 35,776 | 4 | Neither — Python source + 1 README |
| | **Total** | **318,644,728** | **412,600,659** | **1,376** | |

**Per-archive detail.**

1 & 2 are unambiguously **website mirrors**, and specifically mirrors of the same two OCW sites already extracted beside them: their first entries are `static_shared/css/www_offline.41451.css`, `static_shared/css/common.41451.css.map`, etc. — the same `.41451` build hash and the same oddball files (`.42368b5a19b817284b3c`, `.keep`, a 69-byte `.txt`) that appear in the on-disk trees. Both nonetheless carry real PDFs: 54 (219,002,895 B) and 76 (67,715,881 B).

Archive 1 also contains **4 nested `.zip` entries** totalling 13,278,669 B, consistent with archives 3–6 being loose copies of files already inside it — not confirmed (UNVERIFIED #14).

3 is a blog template: 2 HTML, 2 PNG, 2 MP4, plus macOS `__MACOSX`/`.DS_Store` cruft.
4–6 are LaTeX assignment sources (`preamble.tex`, `macros.tex`, `hw/N_template.tex`, `reference.bib`) with figure PDFs/PNGs. The PDFs here are mostly **figures**, not papers.
7 is a design handoff: one 65 KB HTML, a JS bundle, CSS, 2 Markdown.
8 is source code: 3 `.py` + `CLAUDE_CODE_HANDOFF.md`.

**160 PDFs live inside these archives** (54+76+2+21+7). None was examined — that requires extraction. See UNVERIFIED #12.

### 5.2 (§4b) Scanned / image-only PDF check

Scoped to the 231 parseable files; the 828 scaffolding files were never touched. Extraction ran the pipeline's own extractors, imported directly from `ingestion/src/extract/*.ts`, so the verdict is the A1 criterion by construction:

```
ingestion/src/extract/pdf.ts:19   const MIN_TEXT_CHARS = 16;
ingestion/src/extract/pdf.ts:59   return { units, needsOcr: nonWhitespaceChars < MIN_TEXT_CHARS };
```

```
parseable files discovered: 231
extracted ok: 231   failures: 0

PDFs examined      : 157
needsOcr count     : 0
needsOcr page total: 0
```

**Result: zero image-only PDFs. No OCR pass is needed for any of this material.** Page total is therefore 0 and the file list is empty.

Corroborated independently in the second run: 0 of the 137 `Reference & Papers` PDFs produced an empty text fingerprint (`PDFs yielding zero shingles: 0`).

Also notable: **0 extraction failures across all 231 files** — no corrupt PPTX of the kind that exists in the current corpus.

### 5.3 (§4c) Duplicates — method

Text-extraction hashing, not byte hashing. Text came from the pipeline's extractors, was lowercased and stripped to alphanumerics, then cut into **8-word shingles**, each hashed and **sampled at 1/16** (keep hash ≡ 0 mod 16) to bound memory. Similarity is **containment** = |A∩B| / min(|A|,|B|).

Containment rather than Jaccard is deliberate: it detects a short document wholly contained in a long one, which plain equality or Jaccard would miss. Whole-text hashing is unusable on the corpus side because the index stores only *overlapping* chunks, so reconstructed corpus text never equals the original document — a shingle **set** is immune to that overlap.

Thresholds: **≥ 0.85** near-duplicate, **0.50–0.85** partial overlap.

### 5.4 (§4c pass 1) New material vs the existing indexed corpus

Compared all 231 new files against all 621 chunk-bearing corpus files.

```
new files with corpus match >= 0.85  : 18
new files with corpus match 0.50-0.85: 7
```

**All 25 matches come from `School & Coursework`. Not one comes from `Reference & Papers`.**

Reported as groups, by the corpus course they collide with:

| Group | Corpus course collided with | New files | Score range |
|---|---|---|---|
| A | `Operations and Supply Chain Management/` | 12 | 0.527 – 1.000 |
| B | `Product Management/` (incl. `Ai For Product Managers/`) | 8 | 0.585 – 1.000 |
| C | `Strategy In Action/` | 3 | 0.556 – 0.974 |
| D | `Marketing/` | 1 | 1.000 |
| E | `MIT Courses/` | 1 | 0.923 |
| | **Total** | **25** | |

**Group A — Operations and Supply Chain Management (12 files).** Two clusters: the *Littlefield* paper in 5 variants (`Littlefield Paper (Final).docx` at 1.000, then `_Final_Paper`, `_Final_Paper_highlighted`, `Rough Draft 1.BLF`, `Littlefield Final Paper.docx` at 0.843→0.527) and *SampleTrack* in 5 deck versions (`SampleTrack_FINAL PRESENTATION.pptx` at 1.000, then `_v8`, `_Final (2)`, `_v3`, `_Final` at 0.984→0.852), all colliding with the single indexed `SampleTrack_FINAL PRESENTATION [Autosaved].pptx`. Plus `MBA 8240 Heiser Spring 2026 0EXW.docx` (1.000) and `AI Project RD 1.pptx` (0.750).

**Group B — Product Management (8 files).** `Copy of PM TEMPLATE_ PRODUCT ROADMAP.pptx` (1.000), `M4_ Lab Guide and Walkthrough.docx` **and** its `(1)` copy (both 1.000 against the same indexed file), `Juno_AWSpec_M5_Reconciled.docx` (1.000), `Juno_EvalStack_M6_Reconciled.docx` (1.000), `Juno_Final_Group5_v4.pptx` (0.988), `Juno_AWSpec_M5.docx` (0.585), `PMC_Final_Presentation_-_Stay_N_Sleep.pptx` (0.873).

**Group C — Strategy In Action (3 files).** `Rationale.docx` (0.974), `Peer Evaluation Feedback (2).docx` (0.900), `CEO_Pitch_Managing_Strategic_Priorities.docx` (0.556).

**Group D — Marketing (1 file).** `M_1_1_Overview_of_Marketing_Strategy.pptx` (1.000).

**Group E — MIT Courses (1 file).** `AI & PM Courses/MLHC_Learning_Guide.pdf` (0.923) vs `MIT Courses/MLHC_Learning_Guide.pdf`.

### 5.5 (§4c pass 2) New material vs itself

```
pairs >= 0.85 : 17   groups formed: 8
```

| Group | Files | Nature |
|---|---|---|
| 1 | `AI Evals Final Project Deliverables` **.pdf + .pptx** | same deck, two export formats |
| 2 | `AI_Evals_Final_Deck_Slide6_Filled.pptx` + `Copy of AI Evals Final Project Deliverables Template.pptx` | deck + its template |
| 3 | `M1_ Build a Winning GTM Strategy` **.pdf + .pptx** | same deck, two formats |
| 4 | `M2_ Leverage Competitive Intelligence to Validate Strategy` **.pdf + .pptx** | same deck, two formats |
| 5 | `M3_ Master Product Positioning` **.pdf + .pptx** | same deck, two formats |
| 6 | `M4_ Lab Guide and Walkthrough.docx` + `… (1).docx` | file and its copy |
| 7 | `Littlefield_Final_Paper.docx` + `Littlefield_Final_Paper_highlighted.docx` | draft variants |
| 8 | 5 × `SampleTrack_*.pptx` (`_Final (2)`, `_FINAL PRESENTATION`, `_Final`, `_v3`, `_v8`) | version chain |

The dominant internal pattern is **the same deck saved as both `.pdf` and `.pptx`** (groups 1, 3, 4, 5). Groups 6, 7 and 8 also appear in pass 1, i.e. those files are duplicated both internally *and* against the existing index.

### 5.6 The `Reference & Papers` ↔ indexed-corpus overlap you asked me to quantify

**The overlap is zero.** Measured three independent ways:

```
--- score distribution (best match of each R&P PDF against ANY corpus file)
   0.85 to 1.01 : 0
   0.50 to 0.85 : 0
   0.25 to 0.50 : 0
   0.10 to 0.25 : 0
   0.02 to 0.10 : 1
   0.00 to 0.02 : 136

highest score observed across all 137 PDFs: 0.0225

--- filename-level cross-check
   Reference & Papers PDF basenames also present in corpus: 0
```

The single highest scorer is `MIT 6.S897 Lectures/…_MIT6_S897S19_lec23.pdf` against `MIT Courses/MLHC_Learning_Guide.pdf` at **0.0225** — noise, not overlap.

**Why there is no overlap:** the indexed `MIT Courses/` folder contains **exactly one file**, `MLHC_Learning_Guide.pdf`. The index never held the 6.S897 lecture material, so there is nothing for it to duplicate.

**This corrects §7 decision 9 as originally written**, which called overlap between `MIT 6.S897 Lectures` and the indexed `MIT Courses` "structurally likely." It is not present.

**The method is not producing false negatives here.** Same run, same code, same corpus: it scored `MLHC_Learning_Guide.pdf` against that very `MIT Courses/` folder at 0.923, and produced 25 matches up to an exact 1.000 elsewhere. Cross-tree PDF matching against `MIT Courses/` demonstrably works; there is simply nothing to find.

**Net:** all duplication in this material is confined to `School & Coursework`. `Reference & Papers` is entirely new content relative to the index.

---

## 6. UNVERIFIED

1. **Cloud-only detection has no true-positive test.** Both detection methods returned "nothing cloud-only," but no placeholder file exists anywhere on this machine to confirm the detector fires when one is present. *Cheap experiment:* right-click any single low-value file in OneDrive → "Free up space", re-run the flag scan, confirm `0x400000` and `0x400` both flip on for that file, then restore it by opening it once.
2. **The 451-vs-449 folder gap explanation is inferred, not observed.** The "Explorer counts the two selected roots" theory fits the arithmetic but was not tested. *Cheap experiment:* open Properties on `School & Coursework` alone; "Folders" should read 9 if Explorer excludes the selected root, 10 if it includes it.
3. **Contents of the 8 `.zip` archives (318.6 MB, 28% of the whole target set) are unknown.** They may contain parseable documents, or may be redundant with the extracted trees beside them. Requires opening files — deferred to §4 or later.
4. **Overlap between `Reference & Papers\MIT 6.S897 Lectures` (49 files, 64 MB) and the already-indexed top-level `MIT Courses` folder is unquantified.** The names strongly suggest overlap. Requires text-extraction hashing — §4.
5. **Text-layer status of all 157 PDFs is unknown** — how many are image-only and would need OCR. Requires content reads — §4. Reminder from the A1 arc: `pdftotext` and `pdfjs` disagree on thin text layers, so this must be judged with the ingestion pipeline's own extractor.
6. **The file with extension `.42368b5a19b817284b3c` (11,358 B) and the one extensionless file (0 B) were not opened.** Neither is parseable, so neither affects ingestion; noted only because the extension looks like a content hash.
7. **Whether the 76 subtitle/transcript files duplicate the lecture PDFs or slides beside them** is unknown. Requires content comparison — §4.
8. **Why the last ingest run produced zero manifest entries for these folders is not established.** The manifest proves absence, not cause; "added to the corpus after the 2026-08-06 run" is the obvious explanation but was not checked. *Cheap experiment:* compare the two folders' `CreationTime` / `LastWriteTime` against the index build time in `manifest.json`'s `createdAt`.
9. **Long-path behaviour on the Windows→box transfer path was not tested** (no SSH permitted this session). Local read is proven safe; the 28 files over 259 chars remain an open risk for whatever tool performs the transfer.

---

## 7. Decisions this triage surfaces

Listed, not answered.

1. **Does the MIT OpenCourseWare website scaffolding belong in the corpus at all?** 828 of the 1,219 files (68%) are `.html`/`.json`/`.js`/`.xml`/`.css`/fonts from two mirrored course sites. They are unparseable *and* they are browsable clutter in the Study Desk file tree.
2. **Course attribution is wrong by construction if these are ingested as-is.** [`discover.ts:37`](../../ingestion/src/discover.ts) sets `course` to the first path segment below the corpus root, so everything here would be filed under two courses literally named "Reference & Papers" and "School & Coursework" — collapsing 2 MIT courses, an `MBA` tree, an `AI & PM Courses` tree, and `Licensing Exams` under two labels. Existing citations use real course names.
3. **The 76 lecture transcript files (`.vtt`/`.srt`/`.webvtt`, 9.5 MB) are unparsed but are substantive text.** Whether to extend the extractor, convert them to `.txt`, or leave them out.
4. **The 7 `.md` files are silently skipped** — `.md` is genuinely unsupported. Add support, convert, or accept the gap.
5. **The 8 `.zip` archives (318.6 MB) need a disposition** — expand, ignore, or exclude — and their contents are currently unknown.
6. **17 Excel files (16 `.xlsx` + 1 `.xls`) land here**, still held pending the A2 decision. This is new Excel volume arriving before A2 is designed.
7. **28 files exceed Windows `MAX_PATH`.** Local ingestion is proven safe; the transfer path to the box is not. Whether to flatten/rename those filenames before any sync.
8. **`School & Coursework` and `Reference & Papers` are very different problems.** The former is 137 files, structurally clean (max depth 3, no long paths, no risky names), 93 parseable documents / 411 MB. The latter is 1,082 files of which 137 are parseable. Whether to treat them as one decision or two.
9. **Potential duplication against the existing corpus is unmeasured** but structurally likely for `MIT 6.S897 Lectures` vs. the indexed `MIT Courses`. Resolving it needs §4.
10. **The 37 `.pptx` files in `School & Coursework` total 368.5 MB** — an average of ~10 MB per deck, far heavier than typical coursework decks. Whether these are media-heavy decks worth ingesting at that size.

---

## Appendix — commands used

All read-only. No content reads were performed.

**PowerShell** — placeholder flags, allocated-vs-logical size (`GetCompressedFileSizeW` via P/Invoke), inventory, buckets, `MAX_PATH` counts, `LongPathsEnabled` registry read.

**Git Bash / node** — manifest inspection of `ingestion/.index/manifest.json`; `fs.statSync` / `fs.readdirSync` long-path test.

**Read tool** — `ingestion/src/discover.ts`, `ingestion/src/extract/index.ts`.

### Added for §4 (2026-08-13)

**PowerShell** — `[System.IO.Compression.ZipFile]::OpenRead()` central-directory listing of all 8 archives. No entry stream opened.

**Git Bash / node** — two runs, each a script piped to `node --input-type=module` via stdin, so no script file was created. Run 1: walk both roots for `.pdf`/`.docx`/`.pptx`/`.txt` honouring the dotfile skip at [`discover.ts:26`](../../ingestion/src/discover.ts), extract all 231 via the pipeline's own extractors, collect `needsOcr`, build shingle sets, compare new-vs-corpus and new-vs-new. Run 2: re-extract the 137 `Reference & Papers` PDFs to record the full best-match score distribution below threshold, plus a filename-level cross-check.

**Read tool** — `ingestion/src/extract/pdf.ts`, `docx.ts`, `pptx.ts`, `txt.ts`.

Note on running TypeScript: all four extractors import `../types` as a **type-only** import, which Node 24's type stripping erases, so they load directly via `import()` with no build step and no `tsx`. This means §4b used the production OCR criterion itself rather than a reimplementation of it.

---

## 6a. UNVERIFIED — added by §4

10. **Similarity scores are estimates, not exact.** Shingles were sampled at 1/16 to bound memory, so every score carries sampling error. This does not affect the 1.000 and 0.000-level conclusions but does affect the mid-band ordering. *Cheap experiment:* rerun with the sampling modulus set to 1 for the 25 matched pairs only — a small set, so it is fast.
11. **The 0.85 / 0.50 thresholds are conventions, not calibrated against this corpus.** Files in the 0.50–0.85 band may be genuine earlier drafts rather than duplicates. *Cheap experiment:* open one pair from the band (e.g. `Juno_AWSpec_M5.docx` at 0.585) and judge directly.
12. **The 160 PDFs inside the 8 archives were not examined at all** — neither for OCR need nor for duplication. Everything in §5.2 and §5.4 covers on-disk files only. Examining them requires extraction, which was out of scope.
13. **Archive encryption status is unknown by design.** Detecting a password-protected entry requires opening it; per the work order I did not. All 8 listed successfully, which is not proof that every entry is readable.
14. **Whether archives 3–6 duplicate the 4 nested `.zip` entries inside `6.7960-fall-2024.zip` is unconfirmed.** Sizes are suggestive, names were not compared. *Cheap experiment:* list both sets' entry names, uncompressed sizes and CRC32 values straight from the central directory — metadata only, no extraction needed.
15. **Whether the two large mirror archives are redundant with the extracted trees sitting beside them is unmeasured.** The extracted `6.s897-spring-2019` tree is 704 files / 55 MB while its archive holds 776 files / 122 MB, so they are demonstrably *not* identical, but the delta was not characterised. *Cheap experiment:* compare archive entry names + uncompressed sizes against the on-disk file list — metadata only.
16. **§4b establishes that a text layer exists, not that it is good.** `MIN_TEXT_CHARS = 16` is a whole-document floor, so a PDF with a thin or garbled layer passes. This is exactly the `Team_Member_Evaluation_Form` failure mode from the A1 arc, where two extractors disagreed on a marginal layer. *Cheap experiment:* record non-whitespace characters per page for all 157 PDFs and inspect the bottom of the distribution.

---

## 7a. Decisions this triage surfaces — added by §4

Listed, not answered.

11. **25 new files collide with material already in the index**, 18 of them at ≥0.85 and 9 at exactly 1.000. Each group needs a call on whether the new copy supersedes the indexed one, is a redundant re-upload, or should be quarantined under the existing convention.
12. **Two version chains dominate the collisions:** 5 `SampleTrack_*.pptx` decks and 5 Littlefield paper variants, all collapsing onto one indexed file each. The underlying question is whether draft/version history belongs in a search index at all, since every retained variant competes for the same retrieval slots.
13. **Four groups are the same deck saved as both `.pdf` and `.pptx`.** This is a recurring shape in `AI & PM Courses`, so it wants a standing policy rather than four individual calls.
14. **`M4_ Lab Guide and Walkthrough.docx` and its `(1)` copy both score 1.000 against the same indexed file** — a three-way identical set spanning both the new material and the index.
15. **The 8 archives hold 160 PDFs that are structurally invisible to ingestion**, since `.zip` is not in `KIND_BY_EXT`. Now better characterised: archives 4–6 are LaTeX sources whose PDFs are mostly *figures*, while archives 1–2 hold the substantive PDFs. Expand, ignore, or exclude.
16. **`Reference & Papers` is 137 PDFs of genuinely new, non-duplicated content** — that is the real gain in this material, and it is separable from the 828 scaffolding files and the 318 MB of archives around it.

**Closed by §4, no longer a decision:** OCR. Zero of the 157 PDFs need it, so the A1-style OCR question does not arise for this material.

**Corrected by §4:** decision 9 above, which anticipated overlap between `MIT 6.S897 Lectures` and the indexed `MIT Courses`. There is none — the indexed folder holds a single file.

---

## 8. Archive-vs-loose PDF reconciliation (follow-up, 2026-08-13)

**Question:** are the 130 PDFs inside the two mirror archives the same files as the 137 loose PDFs already in `Reference & Papers`?

**Answer: yes — all 130. Zero are archive-only. The archives add no PDF that is not already on disk.**

### 8.1 Method

`ZipArchiveEntry` under Windows PowerShell 5.1 (.NET Framework) does not expose a `Crc32` property, so the archive **central directory** was parsed directly: locate the End-of-Central-Directory record, read the central-directory byte range, and decode each record's CRC32 (offset +16), uncompressed size (+24) and path (+46). This reads the archive's index only — no entry's compressed payload was read, nothing was decompressed, nothing was written. Both archives are standard (not Zip64), so the 32-bit central-directory fields are authoritative:

```
##### 6.7960-fall-2024.zip    central-directory entries: 675   zip64: false   .pdf entries: 54
##### 6.s897-spring-2019.zip  central-directory entries: 1045  zip64: false   .pdf entries: 76
```

CRC32 over the loose files on disk was computed streaming (permitted: they are already local).

### 8.2 The two keys, reported separately

```
loose PDFs in Reference & Papers: 137
loose basenames that are not unique: 0

##### 6.7960-fall-2024.zip  (54 .pdf entries)
  basename matches but size differs : 0
  size matches but basename differs : 31
  basename AND size both match      : 23
  no match on either key            : 0

##### 6.s897-spring-2019.zip  (76 .pdf entries)
  basename matches but size differs : 0
  size matches but basename differs : 0
  basename AND size both match      : 76
  no match on either key            : 0
```

99 entries matched on **both** keys. For those, archive CRC32 was compared against CRC32 computed over the loose file:

```
===== CRC32 VERIFICATION (both-key matches only)
  CRC32 identical : 99
  CRC32 differing : 0
```

**The 31 size-only matches were left ambiguous at this stage** rather than assigned. A shared byte size with a different filename is not evidence of identity on its own.

### 8.3 Resolving the 31 ambiguous entries

Second pass, matching on CRC32 alone and ignoring filenames entirely:

```
loose PDFs: 137   distinct CRC32 values: 137
loose PDFs sharing a CRC with another loose PDF: 0 in 0 groups

##### 6.7960-fall-2024.zip    pdf entries: 54
   CRC32 found among loose PDFs     : 54   (of which stored under a different filename: 31)
   CRC32 NOT found among loose PDFs : 0
##### 6.s897-spring-2019.zip  pdf entries: 76
   CRC32 found among loose PDFs     : 76   (of which stored under a different filename: 0)
   CRC32 NOT found among loose PDFs : 0
```

All 31 are **renamed twins** — identical content stored on disk under a friendlier name. The rename pattern is Google-Drive-ID to lecture number:

```
[zip] static_resources/154_XOVYFauB7OgSOm6U04d1gPwxXFy1m_transcript.pdf -> [disk] .../lec24_transcript.pdf
[zip] static_resources/mit6_7960_f24_hw4.pdf                            -> [disk] .../hw4.pdf
[zip] static_resources/1AZAW0FdnxtmGT2saD5o6Cv4zF57Lpsw6_transcript.pdf -> [disk] .../lec11_transcript.pdf
[zip] static_resources/1l4_usiecMmCTXpPsoo4c8PtlwZRR6wip_transcript.pdf -> [disk] .../lec10_transcript.pdf
[zip] static_resources/1KvvlHUSE4HgkCf3cmUwrDlTujQukGzge_transcript.pdf -> [disk] .../lec04_transcript.pdf
[zip] static_resources/1T4vIHUKShVV8pRNsRmsjTY8wbJT558a7_transcript.pdf -> [disk] .../lec23_transcript.pdf
```

**Strength of claim:** CRC32 is a 32-bit checksum, so a match is very strong evidence of identity but not cryptographic proof. Combined with an exact uncompressed-byte-size match on every one of the 130, accidental collision is implausible. Stated as *very likely identical*, not proven — see UNVERIFIED #17.

### 8.4 Direct answers

- **Archived PDFs with a loose twin: 130 of 130.** (99 matched name+size+CRC; 31 matched size+CRC under a different filename.)
- **Genuinely archive-only: 0.**
- **List of archive-only files: empty.**

**The "160 unexamined PDFs" figure from §5.1 collapses to 30** — the hw3/hw4/hw5 figure PDFs, which were never inside the two mirror archives.

### 8.5 hw3 / hw4 / hw5 — figures or documents?

30 PDF entries across the three archives:

```
--- hw3-tex.zip  pdf entries: 2     (149,030 and 30,324 bytes)
--- hw4-tex.zip  pdf entries: 21
--- hw5.zip      pdf entries: 7
hw PDFs under 200 KB: 22   200 KB or larger: 8
```

By size, 22 of 30 are under 200 KB and 8 are 200 KB or larger (largest 477,914 B).

**Path is more decisive than size here: all 30 sit under a `figure/` or `hw4_dataset_viz/` directory.** Not one is a top-level document. The largest — `figure/sequential.pdf`, `figure/vae.pdf`, `figure/hw4_contrastive_mixture.pdf` — are vector plots, which are large because they are vector, not because they are long.

There is also heavy repetition across the three archives: `rnn.pdf` (149,030) and `gpt_loss.pdf` (30,324) appear in all three, and every one of hw5's 7 sizes also appears in hw4's 21. Treating equal size as identity would reduce 30 entries to about 21 distinct figures, but that inference was not confirmed by CRC — see UNVERIFIED #19.

**Page counts were not determined.** Nothing in a zip central directory carries page count; establishing "single-page" would require extraction. See UNVERIFIED #18.

---

## 6b. UNVERIFIED — added by §8

17. **Identity rests on CRC32 plus exact uncompressed size, not on a cryptographic hash.** All 130 matched on both, and all 137 loose PDFs have distinct CRC32 values (no internal collisions), so a false pairing is implausible — but not excluded. *Cheap experiment:* extract nothing; instead compute SHA-256 over the 137 loose files and compare against SHA-256 of the archive entries, which would require decompression — so the genuinely cheap version is to accept CRC32+size, or spot-check one pair by extracting a single entry to a scratch location outside the corpus.
18. **Whether the 30 hw figure PDFs are single-page is unconfirmed.** Zip central directories carry no page count. *Cheap experiment:* extract one archive to a scratch directory outside the corpus and run the pipeline's `extractPdf` over it.
19. **The claim that hw5's 7 PDFs are all duplicates of hw4's is based on matching uncompressed sizes only**, not CRC32. *Cheap experiment:* the central-directory parse already reads CRC32 for every entry — re-run it printing CRCs for the three hw archives and intersect.
20. **How many of the 137 loose PDFs are absent from both archives was not computed.** 130 archive entries all have loose twins, but whether they map to 130 *distinct* loose files (leaving 7 loose-only) was not verified — two archive entries could in principle share a CRC. *Cheap experiment:* take the union of the two archives' PDF CRC32 sets and subtract from the 137 loose CRCs.

---

## 7b. Decisions — updated by §8

**Decision 15 is now resolved on its facts.** The two mirror archives contain no PDF that is not already loose on disk, CRC-verified. What remains open is only the disposition of the archives themselves as files — 305 MB of the 318 MB of archive weight is confirmed-redundant PDF and mirror content.

**The remaining archive question is much smaller than stated in §5.1:** 30 figure PDFs inside hw3/hw4/hw5 (~21 distinct), all under `figure/` paths, plus the LaTeX sources beside them.
