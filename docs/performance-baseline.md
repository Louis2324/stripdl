# Performance and size baseline

This report records repeatable local measurements. It is evidence for release
decisions, not a promise that every machine will produce the same timings.

## Windows x64 packaged build

Measured on 2026-11-17 from the local `v0.5.3` build with:

```text
py -3.14 build_cli.py
npm run build --prefix desktop
npx electron-builder --win   # from desktop/
py -3.14 scripts/measure_release.py --root desktop/release
```

| Artifact | Bytes | Approximate size |
| --- | ---: | ---: |
| `Strip-0.5.3-windows-x64.exe` | 100,914,513 | 96.2 MiB |
| Installed `win-unpacked` tree | 264,621,804 | 252.4 MiB |
| `app.asar` | 7,041,924 | 6.7 MiB |
| Bundled `stripdl.exe` | 29,909,853 | 28.5 MiB |
| Electron locale files | 453,712 | 0.43 MiB |
| Differential blockmap | 105,768 | 0.10 MiB |

The previous local comparison build measured 120,065,803 bytes for the
installer, 316,000,917 bytes installed, 7,485,968 bytes for `app.asar`,
42,094,693 bytes for the bundled CLI, and 39,203,938 bytes for locale files.
The comparison is useful for direction, but the builds were not produced in the
same release workflow and should not replace the cross-platform release matrix.

## Desktop fixture benchmark

The benchmark creates a temporary library and removes it when complete:

```text
node scripts/benchmark_desktop.mjs --series 10 --chapters 20 --pages 40
```

The small verification fixture (`2` series, `4` chapters, `6` pages) measured
approximately in a standalone local run:

| Operation | Time |
| --- | ---: |
| First library scan | 53.20 ms |
| Repeat library scan | 12.75 ms |
| Short chapter page enumeration | 1.89 ms |
| Medium chapter page enumeration | 1.06 ms |
| Long chapter page enumeration | 0.88 ms |

Run the benchmark with the target library sizes before changing the scanner or
reader again. The production reader smoke test is available through:

```text
npm run test:e2e --prefix desktop
```
