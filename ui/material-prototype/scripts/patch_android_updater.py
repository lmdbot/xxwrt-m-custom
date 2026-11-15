#!/usr/bin/env python3
"""Install the native APK streaming/update plugin into generated Capacitor Android.

Capacitor's android/ tree is generated afresh by Actions, so native code is
version-controlled under native/ and injected after npx cap add/sync.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_RE = re.compile(r"^\s*package\s+([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+)\s*;", re.M)
PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES'


def patch(android: Path = ROOT / "android", native: Path = ROOT / "native"):
    main_activities = list((android / "app/src/main/java").glob("**/MainActivity.java"))
    if len(main_activities) != 1:
        raise RuntimeError(f"Expected one MainActivity.java, got {len(main_activities)}")
    main = main_activities[0]
    current = main.read_text(encoding="utf-8")
    package = PACKAGE_RE.search(current)
    if not package:
        raise RuntimeError("Cannot locate generated Android package")
    if "registerPlugin(ApkDownloaderPlugin.class);" not in current:
        raise RuntimeError("Native updater plugin was not registered in MainActivity")
    java_files = ["ApkDownloaderPlugin.java", "ApkInstallStatusReceiver.java"]
    for filename in java_files:
        target = main.with_name(filename)
        if target.exists():
            raise RuntimeError(f"Native updater class already exists: {filename}")
        source = (native / filename).read_text(encoding="utf-8")
        if "package __PACKAGE__;" not in source:
            raise RuntimeError(f"Native updater package placeholder missing: {filename}")
        target.write_text(
            source.replace("package __PACKAGE__;", f"package {package.group(1)};"),
            encoding="utf-8"
        )

    manifest = android / "app/src/main/AndroidManifest.xml"
    xml = manifest.read_text(encoding="utf-8")
    if "<application" not in xml or "</application>" not in xml:
        raise RuntimeError("Unexpected generated AndroidManifest.xml")
    if PERMISSION in xml or 'android:name=".ApkInstallStatusReceiver"' in xml:
        raise RuntimeError("Android updater manifest already patched")
    xml = xml.replace(
        "<application",
        f'<uses-permission android:name="{PERMISSION}" />\\n    <application',
        1
    )
    receiver = """
        <!-- PackageInstaller result receiver: explicit internal status callback. -->
        <receiver
            android:name=".ApkInstallStatusReceiver"
            android:exported="false" />
"""
    xml = xml.replace("</application>", receiver + "    </application>", 1)
    manifest.write_text(xml, encoding="utf-8")
    return main, manifest, main.with_name("ApkInstallStatusReceiver.java")


if __name__ == "__main__":
    files = patch()
    for file in files:
        print("Patched native updater:", file)
