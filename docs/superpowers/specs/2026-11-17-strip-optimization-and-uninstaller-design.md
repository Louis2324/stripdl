# Strip Optimization and Uninstaller Design

## Status

Proposed. Planning only; this document does not authorize implementation by
itself.

## Goal

Make Strip smaller to download and install, reduce the time before a user can
see and read a local comic, and later provide a branded, safe uninstall flow.

The work must preserve offline reading, the configured download library, path
safety, automatic updates, and the current cross-platform release matrix.

## Current observations

The local Windows reference build shows that the renderer bundle is not the main
size problem:

- Installer: approximately 114.5 MiB.
- Installed `win-unpacked` tree: approximately 301 MiB.
- Bundled PyInstaller `stripdl.exe`: approximately 40.1 MiB.
- Electron locale files: approximately 37.4 MiB.
- `app.asar`: approximately 7.1 MiB.
- Renderer JavaScript: approximately 0.31 MiB.

These figures are a baseline only. Each release candidate must be rebuilt and
measured on the target platform rather than relying on these local artifacts.

The most likely reader delay is in the chapter page IPC path. The renderer waits
for the main process to enumerate every page. The main process currently performs
per-page path validation sequentially before returning any page paths. A large
chapter can therefore complete many filesystem `realpath` operations before the
first image request starts.

The library scan is another likely contributor on cold starts: it traverses
series and chapter directories, rereads chapter directories to count images, and
performs repeated path checks. The renderer also waits for progress enrichment
after obtaining either a fresh scan or cached library data.

## Safety principles

1. Measure before editing behavior. Every performance change must have a before
   and after measurement on the same fixture and build type.
2. Preserve security boundaries. Moving work earlier or later must not bypass
   `assertLibraryPath`, `assertChapterPath`, the custom file protocol, or symlink
   protections.
3. Preserve user data. No optimization or uninstall path may delete, move, or
   rewrite the configured comic library without an explicit user action.
4. Prefer small vertical changes. Each change should have focused tests, a
   production build check, and a clear rollback path.
5. Do not make network access a requirement for startup, reading, or the bundled
   downloader.
6. Keep release artifacts separate from source changes. Size comparisons must
   not commit `desktop/out`, `desktop/release`, PyInstaller output, or local tool
   state.

## Workstream A: establish a performance and size baseline

### Instrumentation

Add development-only timing marks with a stable event vocabulary:

- `app-ready`
- `renderer-dom-ready`
- `library-request-start`
- `library-response`
- `library-visible`
- `chapter-pages-request-start`
- `chapter-pages-response`
- `first-reader-image`

Use monotonic clocks only. The timings should be emitted to the development
console or an opt-in diagnostics log, not uploaded and not persisted as personal
analytics.

Record at least these scenarios:

- cold app start with an empty library;
- warm app start with a cached library;
- cold start with a large library;
- opening a short, medium, and long local chapter;
- resuming at the first, middle, and final page.

### Size accounting

For every release candidate, record:

- installer/download size;
- installed size after extraction;
- `app.asar` size;
- bundled CLI size;
- Electron locale size;
- differential update size where the release manifest supports it.

The baseline report must identify whether a proposed change affects the installer,
installed footprint, startup I/O, or only build tooling.

## Workstream B: optimize the reader's first page path

### First implementation slice

Change the chapter-page flow so it:

1. validates the requested chapter directory once;
2. reads and filters the page names;
3. sorts the page names using the existing ordering rules;
4. returns safe paths or opaque page identifiers without serially resolving every
   page before the first render;
5. continues to validate each actual file request in the `strip-file` protocol.

If returning constructed paths is not sufficient for the platform's symlink
semantics, use a bounded parallel validation step or opaque identifiers resolved
only by the main process. Do not weaken the path boundary to gain speed.

### Renderer improvements after measurement

Only if profiling shows they are useful:

- request the saved reading position in parallel with page enumeration;
- mark the first visible page with high fetch priority and asynchronous decoding;
- keep the mounted reader window bounded;
- avoid recomputing spacer geometry across every page on every scroll;
- keep next-chapter preloading behind the existing preference and out of the
  first-page critical path.

### Tests

Add tests for:

- normal page ordering and fractional chapter paths;
- missing chapters and missing pages;
- symlinked chapter/page escape attempts;
- malformed or inaccessible library roots;
- first-page rendering while later pages remain lazy;
- cancellation when the user changes chapters before enumeration completes.

## Workstream C: optimize library loading

### Cache-first behavior

The renderer should display a valid cached library immediately when one exists,
then revalidate it in the background. A refresh action remains an explicit
force-refresh path. A failed background refresh must not erase usable cached data.

### Main-process scanning

Measure the current scanner before changing its shape. The first safe changes are:

- avoid duplicate path resolution where a parent directory has already been
  validated;
- keep asynchronous filesystem calls bounded rather than launching unbounded
  work for every chapter;
- avoid counting every image on the critical path when a stored chapter manifest
  already contains a trustworthy page count;
- preserve malformed-metadata tolerance and fractional chapter ordering.

If filesystem scanning remains the dominant cost, introduce a versioned local
library index as a later slice. The index must be rebuildable from disk, tolerate
interrupted writes, and fall back to a full scan when its version or root path
does not match.

### Progress enrichment

Replace the renderer's per-series progress requests with one bounded main-process
request that returns the required progress data for the visible library. Keep the
existing progress keys compatible so this does not require a data migration.

## Workstream D: reduce packaged size

### Electron package contents

- Set `electronLanguages` to the locales Strip actually supports, initially
  evaluating an English-only package because the current UI has no localization
  layer.
- Review `files`/`fileOptions` and exclude verified non-runtime files such as
  source maps, tests, and development metadata where support does not require
  them.
- Keep ASAR packaging enabled unless a specific runtime requirement proves that
  a file must be unpacked.
- Preserve `extraResources/strip-cli`, updater manifests, icons, and any native
  files required by the target platform.

### Bundled CLI

Create an explicit PyInstaller spec or equivalent controlled build configuration.
Audit the import graph and hidden imports rather than deleting dependencies by
guesswork. Pillow and lxml are currently used by the downloader/parsers and must
not be removed without replacement tests.

Evaluate, on Windows first:

- verified excludes for unused optional modules;
- UPX compression with runtime and antivirus smoke checks;
- one-file versus one-directory packaging;
- whether a smaller CLI entry point can preserve all packaged desktop commands.

The CLI must remain self-contained in the packaged desktop app and work offline.
Downloading it after installation is not part of the first optimization slice.

### Release verification

For each candidate, run the core suite, desktop suite, production build, release
asset verification, and a packaged-app smoke test. Compare the measured size and
startup metrics against the baseline before accepting the change.

## Workstream E: branded and safe uninstaller

### Scope

Start with the Windows NSIS installer because it has a real registered uninstall
entry and the repository already contains branded NSIS assets and a custom
uninstall welcome macro. macOS DMG/ZIP and Linux AppImage/deb should retain their
platform-native removal semantics unless a separate design is approved.

### Intended behavior

The uninstaller should:

- use Strip branding and clear removal language;
- stop or refuse removal while a Strip process is running, with an actionable
  message;
- remove installed binaries, shortcuts, and registered uninstall metadata;
- leave the configured comic library and downloaded chapters untouched;
- optionally offer removal of Strip settings/cache data only, disabled by default;
- require a separate confirmation before any optional app-data removal;
- make cancellation and failure recoverable and visible.

The configured download directory must never be inferred as disposable app data.
It can be outside the install directory and may contain the user's only copy of
their comics.

### Implementation approach

Extend the existing electron-builder NSIS customization in
`desktop/installer/assets/windows/installer.nsh` rather than introducing a second
uninstaller executable. Keep the standard electron-builder uninstall registration
and lifecycle, and add only the custom pages/macros and narrowly scoped cleanup
actions required for the approved behavior.

Use an explicit, versioned cleanup contract for app-owned data. The contract must
list exact paths under Electron's `app.getPath("userData")` or equivalent known
app-owned locations. It must not accept or recursively delete the configured
download directory.

### Uninstaller tests and smoke checks

Add static checks for the NSIS customization and a packaged Windows smoke matrix:

- install, launch, and configure a library outside the install directory;
- uninstall with the cleanup option disabled and verify the library remains;
- uninstall with cleanup enabled and verify only app-owned settings/cache paths
  are removed;
- cancel each confirmation and verify no data is removed;
- verify shortcuts and the uninstall entry are removed;
- repeat on x64 and ARM64 builds;
- verify upgrade then uninstall, not only fresh install then uninstall.

## Rollback strategy

- Revert each optimization as an isolated commit if the metric regresses or a
  security test fails.
- Keep the old scanner and page enumeration behavior available behind a small
  internal fallback until the new path passes packaged-app testing.
- Do not publish a release that has a smaller artifact but fails to open pages,
  preserve reading position, update correctly, or preserve the comic library.

## Definition of done

The work is ready for release only when:

- measured startup and first-page timings improve on the agreed fixtures;
- installer and installed-size changes are recorded for supported targets;
- core and desktop tests pass;
- packaged reader smoke tests pass;
- updater metadata and differential updates remain valid;
- the uninstaller preserves comic downloads by default;
- documentation and the changelog describe the actual shipped behavior.
