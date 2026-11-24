# Strip Work Tracker

This is a maintainer working note, not the authoritative project backlog. GitHub
Issues are the source of truth for work that is ready to implement. Keep one
coherent objective per issue/branch and target normal pull requests at `dev`.

## Current release state

| Area | Status |
| --- | --- |
| CLI, downloader, local library, and Electron reader | Shipped through `v0.5.3` |
| Provider registration and core reliability | Implemented, including native Comix and failed-download recovery |
| Startup, reader, package-size, and updater optimization | Implemented through the `v0.5.3` baseline; measurement and smoke evidence are tracked here |
| Windows installer branding | Safe custom uninstaller behavior implemented; physical cross-architecture smoke remains |
| Mobile synchronization | Future work |

## Shipped and no longer pending

- Webtoon, WeebCentral, Asura Scans, native Comix, and MangaKakalot registration.
- `stripdl list`, library scanning, resumable downloads, retry policies, and
  persisted failed-download records.
- UTF-8 metadata/output handling and malformed-metadata tolerance.
- Secure `strip-file://` image serving with library/chapter path checks and
  symlink protection.
- React/Electron reader with bounded page mounting, progress persistence,
  chapter navigation, zoom controls, and optional next-chapter preloading.
- Cache-first library rendering, bounded filesystem work, bulk progress reads,
  and parallel chapter enumeration.
- Electron package trimming, English-only locale packaging, controlled
  PyInstaller packaging, and release artifact verification.
- Packaged-app update checks and GitHub Releases for Windows, macOS, and Linux.
- Branded installer assets and a data-safe Windows NSIS uninstaller with running-app detection.
- `v0.5.2` optimization release and `v0.5.3` reader image-loading fix.

## Priority 0 — repository and release hygiene

These items make the project ready for outside contributors before adding more
large features.

- [x] Correct old `ZLouisMiguel` repository URLs in README and CONTRIBUTING.
- [x] Make CONTRIBUTING agree with the `dev` integration-branch workflow.
- [x] Remove duplicate changelog entries and keep release notes human-readable.
- [x] Add GitHub bug-report and feature-request issue forms.
- [x] Add a pull-request template with scope, tests, screenshots, and limitations.
- [x] Add `CODE_OF_CONDUCT.md` and a clear enforcement contact.
- [x] Add `SECURITY.md` with private vulnerability-reporting instructions.
- [x] Add `.github/CODEOWNERS` for core, desktop, release, and security-sensitive
  files.
- [x] Protect `main` and `dev` with required CI checks and review requirements.
- [x] Add repository topics, a useful description, and a homepage/release link.
- [x] Review and archive stale branches after confirming they contain no unique work;
  fully merged release/fix branches were removed from the remote.
- [x] Move implementation-ready follow-up work into GitHub Issues; physical
  installer coverage is tracked as issue #1.

## Pass 1 — provider and reliability completion

### Failed-download recovery

- [x] Persist failed image/chapter URLs in `.failed-downloads.json`.
- [x] Add a user-facing CLI command or desktop flow to review failed entries.
- [x] Allow retrying selected entries without restarting an unrelated download.
- [x] Add tests for malformed records, missing files, retry success, and retry
  failure reporting.

### Provider discovery

- [x] Register the currently supported providers.
- [x] Support `stripdl list <url>`.
- [x] Add `stripdl show providers` with names, URL patterns, and availability
  notes.
- [x] Add dedicated parser tests for every provider's URL detection and core
  metadata/chapter/image behavior.

### Asura Scans

- [x] Decode the site's UTF-8 HTML from response bytes instead of relying on a
  missing/incorrect response charset.
- [x] Add a live-fixture or recorded-fixture regression test for non-ASCII
  author/title metadata.

### Comix

- [x] Replace the current cross-provider adapter with a native Comix parser; it
  stays on the Comix origin and reports protected-session limitations.
- [x] Add fixture-based tests for Comix title canonicalization, metadata,
  chapter pagination, fractional chapter numbers, image URLs, and unavailable
  titles.
- [x] Make failures caused by unavailable/challenge-protected Comix data
  actionable instead of silently returning WeebCentral data for the wrong title.

See the Comix investigation below before implementation.

## Comix investigation and implementation decision

### Why the current code is redundant

Two independent implementations were created on 2026-09-23:

1. `2f1e5d4` added the current adapter. It extracts the Comix title, searches
   WeebCentral, and delegates metadata, chapters, and images to the WeebCentral
   parser.
2. `49af489` independently added a direct Comix implementation based on HTML and
   a guessed `/api/v2` chapters endpoint.

The later merge of those branches retained the first implementation's adapter
file while taking the unrelated reader changes from the other branch. There is
no commit or issue recording a deliberate architecture decision. The current
redundancy is therefore historical merge/contribution overlap, not a useful
two-layer runtime design.

### What the research indicates

- The old direct implementation's `/api/v2` assumption is not a safe foundation.
  Current integrations observe `/api/v1/manga/{id}/chapters` instead.
- Title details are available through the Comix page's embedded initial data,
  while chapter data is loaded dynamically.
- Current chapter responses may be signed/encrypted and image hosts can require
  the Comix referer. Other clients also report browser/session or challenge
  requirements.
- A direct parser must therefore follow the currently observable public site
  flow and treat endpoint versions, payload shapes, and challenge pages as
  changeable. It must not silently substitute a similarly named title from
  another provider.

### Safe native-parser plan

- [x] Capture small, versioned parser fixtures for representative Comix page
  and document which fields are stable enough to parse.
- [x] Parse the canonical title identifier and embedded metadata first.
- [x] Implement chapter discovery against the currently supported public flow,
  with pagination, deduplication, ordering, and clear unavailable/challenge
  errors.
- [x] Extract page URLs from the Comix response without hardcoding an image host;
  preserve the required request headers through the existing downloader contract.
- [x] Do not silently cross-provider resolve Comix titles.
- [x] Do not bypass access controls or challenge mechanisms; document when Comix
  cannot be downloaded without an interactive browser/session.
- [x] Add rate limits, retries, and fixture tests before enabling the native
  parser by default.

### Native-parser acceptance criteria

- Metadata, chapter URLs, and page URLs all originate from Comix for a test title.
- No WeebCentral request occurs on the native path.
- Chapter ordering preserves fractional values and does not duplicate pages.
- Missing, blocked, malformed, and challenge-protected responses produce useful
  errors and never report a false successful download.
- Core tests pass and at least one packaged CLI smoke test exercises provider
  registration without requiring live-site access.

## Pass 2 follow-up — performance and size evidence

The implementation shipped in `v0.5.2`; the remaining work is measurement and
optional follow-up, not another untracked optimization pass.

- [x] Add development-only timing marks for startup, library visibility,
  chapter enumeration, and first reader image.
- [x] Record cold start with an empty library.
- [x] Record warm start with a cached library.
- [x] Record cold start with a large library.
- [x] Record short, medium, and long local chapters.
- [x] Record resume at first, middle, and final page.
- [x] Record installer size, extracted install size, `app.asar`, bundled CLI,
  Electron locales, and differential-update sizes where available.
- [x] Rebuild the supported local Windows target and publish a comparison
  report with the release evidence.
- [x] Add packaged-reader smoke coverage for opening pages and the destructive
  library flows (chapter and series deletion).
- [x] Keep reading-position restore, chapter navigation, and updater behavior
  covered by focused desktop tests.
- [ ] Exercise update installation against a published release in a disposable
  environment; this remains part of issue #1's release-gate follow-up.
- [x] Add a versioned, rebuildable local library index; it falls back to a full
  scan when the fingerprint changes.

## Pass 3 — reader UX

- [x] Investigate and design auto-scroll with explicit speed, pause/resume,
  keyboard, and accessibility behavior.
- [x] Implement auto-scroll with explicit speed controls and keyboard access.
- [x] Add end-to-end coverage for library loading, opening a series, loading
  reader pages, deleting a chapter, deleting a series, and resulting UI state.

## Pass 4 — safe Windows uninstaller

The branded NSIS assets and custom welcome surface exist. The safe uninstall
behavior is implemented; physical installer coverage remains a release-gate
follow-up.

- [x] Keep the standard electron-builder uninstall registration and lifecycle.
- [x] Add clear Strip removal language and running-app detection with an
  actionable message.
- [x] Remove installed binaries, shortcuts, and uninstall metadata through the
  standard electron-builder lifecycle.
- [x] Leave the configured comic library and downloaded chapters untouched.
- [x] Do not offer app-data cleanup until a separate, explicit cleanup contract
  and confirmation flow is approved.
- [x] Make cancellation and failure recoverable through the standard NSIS flow.
- [x] Add static checks for the NSIS customization.
- [ ] Smoke-test fresh install, upgrade, launch, external library configuration,
  uninstall with and without cleanup, cancellation, shortcut removal, x64, and
  ARM64; tracked in issue #1 because the local environment cannot safely run the
  full cross-architecture installer matrix.

## Pass 5 — account-free mobile synchronization

- [ ] Define a versioned transfer schema for series title, canonical URL,
  provider, local progress, and downloaded-state metadata.
- [ ] Use a short-lived, authenticated QR transfer handoff rather than placing
  all library data directly in a reusable QR code.
- [ ] Design both PC-to-phone and phone-to-PC flows, including duplicate and
  conflict handling.
- [ ] Keep downloaded image data out of the QR payload; transfer metadata first
  and let the receiving device download or pair locally.
- [ ] Add explicit user confirmation and an export/import backup path.

## Release gates

- [x] Keep each new feature or fix in an isolated, reviewable commit/PR.
- [x] Add focused regression tests before or alongside implementation.
- [x] Do not publish a release that breaks page loading, reading position,
  updating, or preservation of the comic library.
- [x] Confirm core tests, desktop tests, production builds, release-asset checks,
  and packaged-app smoke tests pass.
- [x] Confirm documentation and the changelog describe only shipped behavior.
- [x] Record remaining limitations in GitHub Issues or the release notes (issue
  #1 covers physical installer/update validation; Comix session limitations are
  documented above and in the parser errors).

## Historical manual-testing notes

- Markdown links pasted into the CLI are input text; commands require the raw URL.
- Live provider behavior is external and may change independently of Strip. Use
  recorded fixtures for deterministic tests and live checks only as smoke tests.
