#!/usr/bin/env python3
"""Rebuild an unsigned APK using the original base APK plus edited compiled web assets.

No signing secrets are stored in this repository. Android build-tools then align
and sign the APK in the GitHub Actions job.
"""
from pathlib import Path
from zipfile import ZipFile
import argparse, copy

BUNDLE_PREFIX = 'assets/apps/__UNI__3B56600/www/'

def is_sig(name):
    n = name.upper()
    if not n.startswith('META-INF/'):
        return False
    tail = n.split('/')[-1]
    return tail == 'MANIFEST.MF' or tail.endswith(('.SF', '.RSA', '.DSA', '.EC'))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base',default='vendor/base.apk')
    parser.add_argument('--assets',default='src/www')
    parser.add_argument('--output',default='build/app-unsigned.apk')
    args=parser.parse_args()
    base,assets,out=Path(args.base),Path(args.assets),Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(base,'r') as zin, ZipFile(out,'w', allowZip64=False) as zout:
        replaced=0
        for info in zin.infolist():
            if is_sig(info.filename):
                continue
            override=assets / info.filename[len(BUNDLE_PREFIX):] if info.filename.startswith(BUNDLE_PREFIX) else None
            data=override.read_bytes() if override and override.is_file() else zin.read(info.filename)
            if override and override.is_file():
                replaced+=1
            zout.writestr(copy.copy(info), data, compress_type=info.compress_type, compresslevel=6)
    with ZipFile(out) as z:
        bad=z.testzip()
        if bad:raise RuntimeError(f'Archive integrity failure: {bad}')
        service=z.read(BUNDLE_PREFIX+'app-service.js').decode('utf-8')
        assert 'internetDetectorItems' in service, 'Internet Detector UI patch absent'
    print('Repack OK: %s assets overlaid; unsigned APK: %s' % (replaced,out))

if __name__=='__main__':main()
