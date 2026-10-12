"""Flatten matrix artifacts and merge electron-builder update manifests."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import yaml


MANIFEST_NAMES = {"latest.yml", "latest-mac.yml", "latest-linux.yml"}


def merge_manifests(manifests: list[Path], destination: Path) -> None:
    """Merge per-architecture electron-builder manifests into one manifest."""

    documents = [yaml.safe_load(path.read_text(encoding="utf-8")) for path in manifests]
    versions = {document.get("version") for document in documents}
    if len(versions) != 1:
        raise ValueError(f"manifest versions differ for {destination.name}")

    merged = dict(documents[0])
    files: list[dict] = []
    seen_urls: set[str] = set()
    for document in documents:
        for entry in document.get("files", []):
            url = entry.get("url")
            if not url:
                raise ValueError(f"manifest entry has no url in {destination.name}")
            if url in seen_urls:
                continue
            seen_urls.add(url)
            files.append(entry)
    if files:
        merged["files"] = files
        # Older electron-updater clients read these legacy fields for a single-file
        # manifest. Keep them consistent with the first artifact when present.
        merged["path"] = files[0].get("url", merged.get("path"))
        if files[0].get("sha512"):
            merged["sha512"] = files[0]["sha512"]

    destination.write_text(
        yaml.safe_dump(merged, sort_keys=False, allow_unicode=True), encoding="utf-8"
    )


def copy_flattened(source: Path, root: Path) -> None:
    destination = root / source.name
    if destination == source:
        return
    if destination.exists():
        if destination.is_file() and destination.read_bytes() == source.read_bytes():
            source.unlink()
            return
        raise ValueError(f"conflicting release artifact name: {source.name}")
    shutil.copy2(source, destination)
    source.unlink()


def prepare(root: Path) -> None:
    root = root.resolve()
    if not root.is_dir():
        raise ValueError(f"release root does not exist: {root}")

    manifests: dict[str, list[Path]] = {name: [] for name in MANIFEST_NAMES}
    for path in root.rglob("*"):
        if path.is_file() and path.name in manifests:
            manifests[path.name].append(path)

    files = [path for path in root.rglob("*") if path.is_file()]
    for path in files:
        if path.name not in MANIFEST_NAMES:
            copy_flattened(path, root)

    for name, paths in manifests.items():
        if not paths:
            continue
        destination = root / name
        merge_manifests(paths, destination)
        for path in paths:
            if path != destination and path.exists():
                path.unlink()

    for directory in sorted(
        (path for path in root.rglob("*") if path.is_dir()),
        key=lambda path: len(path.parts),
        reverse=True,
    ):
        if directory != root and not any(directory.iterdir()):
            directory.rmdir()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
