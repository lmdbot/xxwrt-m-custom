#!/usr/bin/env python3
"""Patch Capacitor's freshly generated Android project with launcher icon aliases.

Runs after patch_android_insets.py and patch_android_config_export.py. This is
necessary because GitHub Actions creates the Android project on every APK build.
"""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ANDROID_NS = "http://schemas.android.com/apk/res/android"
ET.register_namespace("android", ANDROID_NS)
A = lambda name: "{" + ANDROID_NS + "}" + name
ALIASES = (
    ("LauncherAnime", "ic_launcher", True),
    ("LauncherClassic", "ic_launcher_classic", False),
    ("LauncherOpenWrt", "ic_launcher_openwrt", False),
)
PACKAGE_RE = re.compile(r"^\s*package\s+([\w.]+);", re.M)


def patch(android=ROOT / "android", native=ROOT / "native"):
    base = android / "app/src/main"
    main_path = next(iter((base / "java").glob("**/MainActivity.java")), None)
    if main_path is None:
        raise RuntimeError("Generated MainActivity.java was not found")
    java = main_path.read_text(encoding="utf-8")
    match = PACKAGE_RE.search(java)
    registration = "registerPlugin(ConfigFileExportPlugin.class);"
    new_line = "registerPlugin(LauncherIconPlugin.class);"
    if not match or registration not in java:
        raise RuntimeError("Android plugin registration anchor was not found")
    if new_line in java:
        raise RuntimeError("LauncherIconPlugin is already installed")
    source = (native / "LauncherIconPlugin.java").read_text(encoding="utf-8")
    if not source.startswith("package __PACKAGE__;"):
        raise RuntimeError("Native plugin package marker missing")
    main_path.write_text(java.replace(registration, registration + "\n        " + new_line, 1), encoding="utf-8")
    native_path = main_path.with_name("LauncherIconPlugin.java")
    native_path.write_text(source.replace("package __PACKAGE__;", f"package {match.group(1)};"), encoding="utf-8")

    manifest = base / "AndroidManifest.xml"
    root = ET.parse(manifest).getroot()
    application = root.find("application")
    if application is None:
        raise RuntimeError("Android application was not found in manifest")
    activities = [item for item in application.findall("activity") if
                  item.get(A("name"), "").endswith(".MainActivity")]
    if len(activities) != 1:
        raise RuntimeError("Expected a unique MainActivity for launcher alias patch")
    activity = activities[0]
    launcher_filters = [item for item in activity.findall("intent-filter")
                        if any(action.get(A("name")) == "android.intent.action.MAIN"
                               for action in item.findall("action"))
                        and any(category.get(A("name")) == "android.intent.category.LAUNCHER"
                                for category in item.findall("category"))]
    if len(launcher_filters) != 1:
        raise RuntimeError("Expected exactly one generated MAIN/LAUNCHER intent filter")
    activity.remove(launcher_filters[0])
    for name, drawable, enabled in ALIASES:
        alias = ET.SubElement(application, "activity-alias", {
            A("name"): "." + name, A("targetActivity"): activity.get(A("name")),
            A("enabled"): "true" if enabled else "false",
            A("exported"): "true",
            A("icon"): "@mipmap/" + drawable,
            A("label"): "@string/app_name",
        })
        intent = ET.SubElement(alias, "intent-filter")
        ET.SubElement(intent, "action", {A("name"): "android.intent.action.MAIN"})
        ET.SubElement(intent, "category", {A("name"): "android.intent.category.LAUNCHER"})
    ET.ElementTree(root).write(manifest, encoding="utf-8", xml_declaration=True)
    return (main_path, native_path, manifest)


if __name__ == "__main__":
    for path in patch():
        print("Patched Android launcher icon aliases:", path)
