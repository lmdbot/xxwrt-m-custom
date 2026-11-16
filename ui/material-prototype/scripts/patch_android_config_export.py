#!/usr/bin/env python3
"""Inject native Android ACTION_CREATE_DOCUMENT config snapshot export plugin."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_RE = re.compile(r"^\s*package\s+([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+)\s*;", re.M)


def patch(android: Path = ROOT / "android", native: Path = ROOT / "native"):
    activities = list((android / "app/src/main/java").glob("**/MainActivity.java"))
    if len(activities) != 1:
        raise RuntimeError(f"Expected exactly one MainActivity.java, got {len(activities)}")
    activity = activities[0]
    source = activity.read_text(encoding="utf-8")
    package = PACKAGE_RE.search(source)
    registration = "registerPlugin(ApkDownloaderPlugin.class);"
    requested = "registerPlugin(ConfigFileExportPlugin.class);"
    if not package or registration not in source:
        raise RuntimeError("Expected native plugin registration point was not found")
    if requested in source or activity.with_name("ConfigFileExportPlugin.java").exists():
        raise RuntimeError("Config file export plugin already installed")
    template = (native / "ConfigFileExportPlugin.java").read_text(encoding="utf-8")
    if not template.startswith("package __PACKAGE__;"):
        raise RuntimeError("Native export package placeholder is missing")
    activity.write_text(source.replace(registration,
        registration + "\n        " + requested, 1), encoding="utf-8")
    target = activity.with_name("ConfigFileExportPlugin.java")
    target.write_text(template.replace("package __PACKAGE__;",
        f"package {package.group(1)};"), encoding="utf-8")
    return activity, target


if __name__ == "__main__":
    for path in patch():
        print("Patched native config export:", path)
