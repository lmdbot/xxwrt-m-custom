#!/usr/bin/env python3
"""Pinpoint main's saved router list UI, stats, privacy toggles."""
from pathlib import Path
import re
src=Path('src/www/app-service.js').read_text(encoding='utf-8',errors='replace')
for label,needle,before,after in [
('MAIN DEVICE LIST VIEW','n("view",{staticClass:t._$s(14,"sc","filter-bar")',300,8500),
('MAIN DEVICE STAT METHOD','getDeviceListStats',120,5500),
('MAIN DEVICE LIST DATA','showIp:!0',300,6300),
('MAIN DEVICE LIST METHODS','toggleIp',700,2300),
('MAIN DEVICE STATUS','shouldShowData',500,3500),
('MAIN DEVICE UI TAIL','t.showIp?t.formatDeviceAddress(e)',1500,4500),
]:
    pos=src.find(needle,2600000)
    print('\n----',label,'AT',pos,'----')
    if pos<0: continue
    print(src[max(0,pos-before):pos+after].replace('\n',' ')[:after+before])
print('\nSPECIAL FIELD NAMES:')
tail=src[2744500:2752500]
for field in sorted(set(re.findall(r'(?:e|t)\.([A-Za-z_][A-Za-z0-9_]*)',tail))):
    if field in {'_$s','_s','_v','_e','_l','_t','$t'}:continue
    print(field)
