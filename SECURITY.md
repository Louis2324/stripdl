# Security policy

## Supported versions

Security fixes are made against the latest release. Users should update to the
latest version before reporting an issue.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository:

https://github.com/Louis2324/stripdl/security/advisories/new

If private reporting is unavailable, contact the maintainer through the email
listed on the repository profile. Do not open a public issue for an unpatched
vulnerability or include credentials, private library paths, or downloaded
content in a report.

Include, when safe to share:

- affected Strip version and platform;
- concise reproduction steps or a proof of concept;
- security impact and likely attack surface;
- any suggested mitigation.

Maintainers will acknowledge reports when practical, investigate privately, and
coordinate disclosure after a fix or mitigation is available.

## Scope notes

Strip serves user-selected local files through an Electron protocol and invokes
the bundled downloader. Reports involving path traversal, symlink escapes,
unsafe IPC, update/release integrity, credential exposure, or arbitrary code
execution are especially important.
