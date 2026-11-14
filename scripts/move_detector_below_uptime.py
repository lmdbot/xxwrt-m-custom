#!/usr/bin/env python3
"""Reorder Internet Detector to follow uptime in both compiled UniApp renderers."""
from pathlib import Path
from capsule_internet_detector import SERVICE_MARKUP, VIEW_MARKUP

ROOT = Path(__file__).resolve().parents[1] / "src" / "www"
FILES = [
    (ROOT / "app-service.js", SERVICE_MARKUP,
     'n("view",{staticClass:t._$s(46,"sc","status-grid")',
     'n("view",{staticClass:t._$s(43,"sc","detail-row")'),
    (ROOT / "app-view.js", VIEW_MARKUP,
     'r("uni-view",{staticClass:t._$g(46,"sc"),attrs:{_i:46}}',
     'r("uni-view",{staticClass:t._$g(43,"sc"),attrs:{_i:43}}'),
]

def call_end(text, start):
    index = text.index("(", start)
    nesting, quote, escaped = 0, None, False
    for pos in range(index, len(text)):
        ch = text[pos]
        if quote is not None:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
        elif ch in ('"', "'", chr(96)):
            quote = ch
        elif ch == "(":
            nesting += 1
        elif ch == ")":
            nesting -= 1
            if nesting == 0:
                return pos + 1
    raise RuntimeError("Unbalanced compiled JS call")

def move(text, block, next_marker, uptime_marker):
    old = "," + block
    if text.count(old) != 1:
        raise RuntimeError("Expected exactly one pre-uptime detector node")
    text = text.replace(old, "", 1)
    matches, pos = [], 0
    while True:
        next_pos = text.find(next_marker, pos)
        if next_pos < 0:
            break
        uptime_pos = text.rfind(uptime_marker, max(0, next_pos - 1100), next_pos)
        if uptime_pos >= 0:
            end_pos = call_end(text, uptime_pos)
            if uptime_pos < end_pos < next_pos and next_pos - end_pos <= 35:
                matches.append((uptime_pos, end_pos, next_pos))
        pos = next_pos + len(next_marker)
    if len(matches) != 1:
        raise RuntimeError(f"Ambiguous uptime node: found {len(matches)} candidates")
    start, end, next_pos = matches[0]
    text = text[:end] + "," + block + text[end:]
    if not (start < text.index(block) < text.index(next_marker, end)):
        raise RuntimeError("Resulting render order is wrong")
    return text

def main():
    output = []
    for filename, block, next_marker, uptime_marker in FILES:
        source = filename.read_text(encoding="utf-8")
        output.append((filename, move(source, block, next_marker, uptime_marker)))
    for filename, source in output:
        filename.write_text(source, encoding="utf-8")
    print("OK: Internet Detector moved below uptime in service and view")

if __name__ == "__main__":
    main()
