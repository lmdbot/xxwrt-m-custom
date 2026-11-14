#!/usr/bin/env python3
"""Targeted inspection of compiled main branch device-list Vue module."""
import re
from pathlib import Path
data=Path('src/www/app-service.js').read_text(encoding='utf-8', errors='replace')
code=data[2620000:]
print('APP tail length',len(code))
for term in [
    r'hostname',r'hide',r'hidden',r'privacy',r'mask',r'visible',
    r'visibleName',r'showName',r'showHost',r'showDevice',r'device_list',
    r'deviceList',r'getDeviceList',r'getDeviceStatus',r'cpuUsage',
    r'wanRx',r'wanTx',r'upRate',r'downRate',r'uptime',r'memoryUsage',
    r'getIcon',r'getMountPoints',r'deviceStatus',r'connectionStatus',
    r'visibleHostname',r'hideDevice',r'stats-container',r'viewMode'
]:
    matches=list(re.finditer(term,code,re.I))
    print('\nMATCH',term,'COUNT',len(matches))
    for m in matches[:(8 if term not in ('hostname','deviceList') else 20)]:
        start=max(0,m.start()-230)
        end=min(len(code),m.end()+370)
        print('AT',m.start()+2620000,'TEXT',code[start:end].replace('\n',' ')[:630])
print('\nMODULE CONTEXT')
for term in [r'pages/device_list\.vue',r'pages/device_list',r'getDeviceList',r'deviceData']:
    matches=list(re.finditer(term,code,re.I))
    for m in matches[-3:]:
        print('ANCHOR',term,'AT',m.start()+2620000,'CTX',code[max(0,m.start()-900):m.end()+2200].replace('\n',' ')[:3600])
