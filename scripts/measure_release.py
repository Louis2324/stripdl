"""Measure release artifact sizes without modifying the release directory."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    if path.is_dir():
        return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())
    return 0


def find_first(root: Path, *names: str) -> Path | None:
    for name in names:
        matches = list(root.rglob(name))
        if matches:
            return matches[0]
    return None


def measure(root: Path) -> dict:
    root = root.resolve()
    if not root.is_dir():
        raise ValueError(f"release directory does not exist: {root}")

    installers = [
        path for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in {".exe", ".dmg", ".appimage", ".deb", ".zip"}
    ]
    blockmaps = [path for path in root.rglob("*.blockmap") if path.is_file()]
    app_asar = find_first(root, "app.asar")
    unpacked = find_first(root, "win-unpacked", "mac", "linux-unpacked")
    cli = find_first(root, "stripdl.exe", "stripdl")
    locale_files = [
        path for path in root.rglob("*.pak")
        if "locales" in {part.lower() for part in path.parts}
    ]

    def entry(path: Path | None) -> dict | None:
        if path is None:
            return None
        return {
            "path": path.relative_to(root).as_posix(),
            "bytes": size(path),
        }

    return {
        "root": str(root),
        "installers": [entry(path) for path in sorted(installers, key=lambda p: p.name)],
        "differential_updates": [entry(path) for path in sorted(blockmaps, key=lambda p: p.name)],
        "app_asar": entry(app_asar),
        "installed_tree": entry(unpacked),
        "bundled_cli": entry(cli),
        "electron_locales_bytes": sum(size(path) for path in locale_files),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = measure(args.root)
    payload = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
