#!/usr/bin/env python3
"""Keep the five newest canonical XX-WRT Material APKs on the Lucky mirror.

Called over SSH after an APK and its version.json have both been published.
Only regular files matching XX-WRT-Material-vX.Y.Z.apk are eligible for deletion.
"""
import json
import re
import sys
from pathlib import Path

APK_NAME = re.compile(r"^XX-WRT-Material-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.apk$", re.ASCII)


def version_parts(filename):
    match = APK_NAME.fullmatch(filename)
    return tuple(map(int, match.groups())) if match else None


def prune_apks(directory, keep=5):
    directory = Path(directory)
    if keep < 1 or not directory.is_dir():
        raise ValueError("Directory must exist and keep must be at least 1")

    # Do not delete anything unless the latest published version is valid.
    manifest = json.loads((directory / "version.json").read_text(encoding="utf-8"))
    current = manifest.get("apkName")
    version = manifest.get("version")
    if not isinstance(current, str) or not isinstance(version, str):
        raise ValueError("Missing current APK/version in version.json")
    if version_parts(current) is None or current != "XX-WRT-Material-v" + version + ".apk":
        raise ValueError("Invalid current APK metadata in version.json")
    current_file = directory / current
    if not current_file.is_file() or current_file.is_symlink():
        raise ValueError("Currently advertised APK is missing or unsafe")

    candidates = []
    for entry in directory.iterdir():
        parts = version_parts(entry.name)
        if parts is not None and entry.is_file() and not entry.is_symlink():
            candidates.append((parts, entry.name, entry))
    candidates.sort(reverse=True)
    retained = candidates[:keep]

    # An outdated build must not delete the APK referenced by version.json.
    if current not in {name for _, name, _ in retained}:
        raise ValueError("Advertised APK is older than the newest five; refusing cleanup")

    removed = []
    for _, name, entry in candidates[keep:]:
        entry.unlink()
        removed.append(name)
    print("APK retention:", keep, "newest versions; kept:", len(retained), "removed:", len(removed))
    for name in removed:
        print("Removed old APK:", name)
    return removed


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: prune_mirror_apks.py <directory> <keep_count>")
    prune_apks(sys.argv[1], int(sys.argv[2]))
