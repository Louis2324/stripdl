# stripdl Work Tracker

This file tracks the current state of the v0.4.0 work and the next items to
address.

## Delivery roadmap

| Pass | Scope | Status |
| ---- | ----- | ------ |
| Pass 0 | Previously shipped CLI, downloader, reader, provider, and release foundation | Completed history |
| Pass 1 | Provider and reliability completion: native Comix support, Asura encoding, failed-download recovery, provider discovery, and focused coverage | Planned |
| Pass 2 | Startup, reader, library, package-size, and release optimization | Implementation complete; release gates pending |
| Pass 3 | Reader and desktop UX: auto-scroll and broader end-to-end interaction coverage | Planned |
| Pass 4 | Branded, data-safe Windows NSIS uninstaller | Planned for a later release |
| Pass 5 | Account-free PC/mobile QR synchronization | Planned |

Only Pass 2 is being implemented in the current optimization branch. The other
passes remain separate so provider features, reader UX, mobile sync, and installer
changes can be reviewed and released independently.

## Versioning and release policy

- Keep the shared version at `0.5.1` while Pass 2 is being developed and tested;
  do not create a version bump for intermediate commits, measurements, or docs.
- Ship the completed backward-compatible Pass 2 optimization work as `0.5.2`.
- Before tagging `v0.5.2`, synchronize `VERSION`, Python package/runtime metadata,
  Electron `package.json`, the lockfile, tests, and changelog with
  `python scripts/sync_version.py --version 0.5.2` and its validation command.
- Publish `v0.5.2` only after the size, startup, reader, updater, and packaged-app
  gates in Pass 2 pass on the supported release matrix.
- Treat the branded uninstaller as a separate user-facing release feature,
  targeted for the next minor release after the optimization work (`0.6.0` unless
  maintainers explicitly choose a different release boundary).
- Keep unreleased work in the changelog until its implementation and release
  artifacts are verified.

## Provider support

| Provider     | Current state | Notes                                                          |
| ------------ | ------------- | -------------------------------------------------------------- |
| Webtoon      | Implemented   | Registered parser.                                             |
| WeebCentral  | Implemented   | Registered parser.                                             |
| Asura Scans  | Implemented   | Listing works; download output still has an encoding issue.    |
| MangaKakalot | Implemented   | Registered parser.                                             |
| Comix        | Partial       | Registered, but currently resolves titles through WeebCentral. |

## Fixes and reliability — Pass 1

### Completed

- Added provider registration for Webtoon, WeebCentral, Comix, Asura Scans,
  and MangaKakalot.
- Added the `stripdl list` flow for displaying series information and chapters.
- Added readable failure messages for list and library operations instead of
  exposing tracebacks.
- Added UTF-8 CLI stream configuration and safe rendering for dynamic metadata
  on Windows consoles.
- Made invalid series metadata non-fatal during library scans.
- Added retry policies for parser/image requests and persisted failed download
  URLs in `.failed-downloads.json` for later retries.

### In progress / partial

- Comix support exists, but it is not independent. `ComixParser` currently
  searches WeebCentral for the matching title. A Comix title that is missing
  from WeebCentral cannot be resolved.
- Asura Scans metadata and chapter listing work, but some author text is
  displayed with broken encoding.

### Outstanding

- Add a user-facing command or UI flow for reviewing and retrying entries from
  `.failed-downloads.json`.

## Planned features — Passes 1, 3, and 5

### Pass 5 — Mobile synchronization

- Since we're planning on making a mobile version and we want the sync of projects to be without the use of an account, we'll do it via qr codes , you'll scan a transfer qr code and then after that you'll have all of your comics that were on pc be sent like a json to your phone, containing details about the series name, it's url and it's provider and then you'll download them onto the phone. ( Think about the reverse path way , phone to pc how to communicate, also think about whether the qr code should contain just that or contain other info that could help syncing them later on)

### Pass 1 — Provider discovery

#### Completed

- Added support for the `stripdl list <url>` command.

#### Outstanding

- Add a native Comix parser that obtains Comix metadata, chapters, and images
  directly instead of depending on WeebCentral. Keep the WeebCentral bridge
  only as an optional fallback if useful.
- Add `stripdl show providers` to display all available comic and webtoon
  providers instantly.

### Pass 3 — Reader UX

#### Outstanding

- Investigate and design an auto-scroll feature.

## Performance — Pass 2

### Outstanding

- Reduce initial loading time to under one second where possible, including
  when the local library contains many downloaded series.
- Identify whether library scanning or another startup task is responsible for
  the current loading delay before optimizing it.

## Optimization and packaging — Pass 2

The implementation plan and safety constraints for this work are documented in
[the optimization and uninstaller design spec](docs/superpowers/specs/2026-11-17-strip-optimization-and-uninstaller-design.md).

### Size

- Establish a repeatable installer and installed-size baseline for each supported
  platform and architecture.
- Keep only the required Electron locale files in packaged builds.
- Audit the bundled PyInstaller CLI, remove verified-unused imports, and compare
  safe compression and one-file/one-directory packaging options.
- Tighten packaged file inclusion without removing runtime files, update metadata,
  or diagnostics needed for support.
- Rebuild release artifacts and record installer, installed, and differential-update
  size changes before shipping an optimization.

### App functionality and startup performance

- Add development-only timing instrumentation for app startup, library loading,
  chapter path enumeration, and first reader image display.
- Remove the reader's serial per-page path-validation wait while preserving the
  `strip-file` protocol's path-safety checks and symlink protections.
- Make cached library data render immediately, then refresh stale data in the
  background.
- Reduce library-scan filesystem work and replace per-series progress IPC calls
  with a bounded bulk operation where measurement confirms the benefit.
- Bundle or replace remote startup fonts so the reader does not depend on a
  network request for its initial presentation.
- Add regression coverage and compare cold-start, warm-start, and large-library
  results before and after each change.

### Installer and uninstaller — Pass 4, later release

- Design and ship a branded Windows NSIS uninstaller experience.
- Preserve the configured comic library and downloaded files by default.
- If app-data cleanup is offered, make it explicit, separately confirmed, and
  limited to Strip settings/cache data rather than the user-selected library.
- Verify install, upgrade, uninstall, cancel, shortcut removal, x64, and ARM64
  behavior before publishing the change.

### Safety constraints for all optimization work

- Measure before changing behavior; compare before and after results on the same
  fixtures and build type.
- Preserve `assertLibraryPath`, `assertChapterPath`, the `strip-file` protocol,
  and symlink protections when moving filesystem work.
- Never delete, move, or rewrite the configured comic library as part of an
  optimization or uninstall operation without explicit user action.
- Keep changes small and independently reversible, with focused tests and a
  production build check for every slice.
- Do not make network access a requirement for startup, reading, or the bundled
  downloader.
- Do not commit `desktop/out`, `desktop/release`, PyInstaller output, or local
  diagnostics/build state.

### Baseline and diagnostics checklist

- [x] Add development-only monotonic timing marks for:
  `app-ready`, `renderer-dom-ready`, `library-request-start`,
  `library-response`, `library-visible`, `chapter-pages-request-start`,
  `chapter-pages-response`, and `first-reader-image`.
- [x] Keep diagnostics local to the development console or an opt-in log; do
  not upload or persist personal analytics.
- [ ] Measure cold start with an empty library.
- [ ] Measure warm start with a cached library.
- [ ] Measure cold start with a large library.
- [ ] Measure short, medium, and long local chapters.
- [ ] Measure resume at the first, middle, and final page.
- [ ] Record installer size, extracted install size, `app.asar` size, bundled
  CLI size, Electron locale size, and differential-update size where available.

### Reader first-page implementation design

- [x] Validate the requested chapter directory once.
- [x] Read, filter, and sort page names using the existing ordering rules.
- [x] Return safe paths or opaque page identifiers without serially resolving
  every page before the first render.
- [x] Continue validating every actual file request in the `strip-file`
  protocol.
- [ ] If constructed paths are not sufficient for symlink safety, use bounded
  parallel validation or opaque main-process-resolved identifiers instead of
  weakening the path boundary.
- [ ] Test normal ordering, fractional chapter paths, missing chapters, missing
  pages, symlink escape attempts, malformed roots, and cancelled chapter loads.
- [x] Request saved progress in parallel with
  page enumeration.
- [x] Use high-priority/asynchronous decoding for the
  first visible page.
- [x] Keep the mounted reader window bounded.
- [x] Avoid recomputing spacer geometry across every page on every scroll.
- [x] Keep next-chapter preloading behind its preference and outside the
  first-page critical path.

### Library loading implementation design

- [x] Render valid cached library data immediately when available, then
  revalidate it in the background.
- [x] Keep explicit refresh as the force-refresh path.
- [x] Preserve usable cached data if a background refresh fails.
- [x] Avoid duplicate path resolution after a parent directory is validated.
- [x] Keep asynchronous filesystem work bounded rather than launching
  unbounded work for every chapter.
- [x] Avoid counting every image on the critical path when a trustworthy
  chapter manifest already contains the page count.
- [x] Preserve malformed-metadata tolerance and fractional chapter ordering.
- [ ] If scanning remains dominant, add a versioned, rebuildable local library
  index with fallback to a full scan when its version or root path differs.
- [x] Replace per-series progress IPC requests with one bounded bulk request
  while keeping existing progress keys compatible.

### Package-size implementation design

- [x] Set `electronLanguages` to the locales Strip actually supports; initially
  evaluate an English-only package because the current UI has no localization
  layer.
- [x] Review `files`/`fileOptions` and exclude verified non-runtime files such
  as source maps, tests, and development metadata without removing support
  diagnostics required by the packaged app.
- [x] Keep ASAR packaging enabled unless a runtime requirement proves a file
  must be unpacked.
- [x] Preserve updater manifests, icons, `extraResources/strip-cli`, and other
  target-specific runtime files.
- [x] Create a controlled PyInstaller build configuration.
- [x] Audit the CLI import graph and hidden imports instead of deleting
  dependencies by guesswork.
- [x] Keep Pillow and lxml unless replacement tests prove their functionality is
  no longer needed; both are currently used by the downloader/parsers.
- [x] Evaluate verified optional-module excludes and Windows UPX compression; keep
  one-file packaging for the self-contained CLI.
- [x] Keep the CLI self-contained in the packaged desktop app and usable offline.
- [x] Do not make first-run CLI downloading part of the initial size change.
- [ ] Rebuild every supported release target and record installer, installed,
  and differential-update size changes before accepting an optimization.

### Windows uninstaller implementation design

- [ ] Start with the Windows NSIS target; retain native removal semantics for
  macOS DMG/ZIP and Linux AppImage/deb unless separately designed.
- [ ] Extend the existing electron-builder NSIS customization in
  `desktop/installer/assets/windows/installer.nsh` instead of introducing a
  second uninstaller executable.
- [ ] Keep the standard electron-builder uninstall registration and lifecycle.
- [ ] Add Strip branding and clear removal language.
- [ ] Stop or refuse removal while Strip is running, with an actionable message.
- [ ] Remove installed binaries, shortcuts, and uninstall metadata.
- [ ] Leave the configured comic library and downloaded chapters untouched.
- [ ] If cleanup is offered, limit it to explicitly identified app-owned
  settings/cache paths under Electron's user-data location.
- [ ] Keep cleanup disabled by default and require a separate confirmation.
- [ ] Never infer that the configured download directory is disposable app data.
- [ ] Make cancellation and failure recoverable and visible.
- [ ] Add static checks for the NSIS customization.
- [ ] Smoke-test install, launch, configure-library, uninstall-without-cleanup,
  uninstall-with-cleanup, cancellation, shortcut removal, x64, ARM64, and
  upgrade-then-uninstall flows.

### Rollback and release gates

- [ ] Keep each optimization in an isolated commit so regressions can be
  reverted without undoing unrelated work.
- [ ] Retain a small internal fallback for old reader/scanner behavior until
  packaged-app tests pass.
- [ ] Do not publish a smaller release that fails to open pages, preserve reading
  position, update correctly, or preserve the comic library.
- [ ] Confirm startup and first-page timings improve on agreed fixtures.
- [ ] Confirm core tests, desktop tests, production builds, release-asset checks,
  and packaged-reader smoke tests pass.
- [ ] Confirm updater manifests and differential updates remain valid.
- [ ] Confirm the uninstaller preserves comic downloads by default.
- [ ] Update documentation and changelog to match only the behavior actually
  shipped.

## Notes from v0.4.0 testing

- `stripdl list` successfully returned series information and chapter lists for
  tested Asura Scans URLs.
- Downloading `SSS-Class Suicide Hunter` from Asura Scans failed with the
  Windows `charmap` encoding error above.
- Pasting a Markdown link such as
  `[https://example.com](https://example.com)` into the CLI passes the Markdown
  text as input; commands should receive the raw URL instead.

## Verification audit — 2026-10-04

### Resolved in the current fix pass

- `stripdl --help` no longer crashes on Windows `cp1252` consoles.
- `stripdl library` tolerates invalid or non-UTF-8 series metadata.
- `stripdl list` preserves non-ASCII metadata when the CLI configures UTF-8
  output.

### Coverage gaps by pass

- Pass 2/3: Add end-to-end desktop tests for the actual React/Electron interactions:
  library loading, opening a series, loading reader pages, deleting a chapter,
  deleting a series, and confirming the resulting UI state.
- Pass 1: Add dedicated Comix parser tests. Current Comix support is only an adapter to
  WeebCentral and has no independent parser behavior to verify.
