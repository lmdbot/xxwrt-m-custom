#!/usr/bin/env python3
"""Inspect the checked-in main APK's compiled UniApp service for device list parity.

This is a source-only diagnostic. No network requests, credentials, or router access.
Run from the root of the feature branch: python3 scripts/inspect_main_device_list.py
"""
from pathlib import Path
import re

path = Path("src/www/app-service.js")
data = path.read_text(encoding="utf-8", errors="replace")
print("MAIN APP SERVICE BYTES:", len(data), "LINES:", data.count("\n")+1)
terms = [
    r"隐藏主机名", r"隐藏", r"隐私", r"主机名", r"hide(?:Host|Device|Name)",
    r"(?:show|display|mask|isHide|hidden)(?:Host|Device|Name|Hostname|IP|Ip)",
    r"(?:hide|privacy).{0,25}(?:host|name|device|ip)",
    r"(?:host|name|device|ip).{0,25}(?:hide|privacy)",
    r"hostname", r"device_list", r"wanip", r"lanip", r"deviceList",
]
for term in terms:
    matches = list(re.finditer(term, data, flags=re.IGNORECASE))
    print(f"\nTERM {term}: {len(matches)} match(es)")
    limit = 32 if any(x in term for x in ("hide", "hidden", "隐私", "隐藏", "主机名")) else 10
    for m in matches[:limit]:
        snippet = data[max(0, m.start()-190):min(len(data), m.end()+280)]
        snippet = snippet.replace("\r", " ").replace("\n", " ")
        print(f"[{m.start()}] {snippet[:500]}")
print("\nEND")
