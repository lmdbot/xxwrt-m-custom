/** Xiaomi MiWiFi device data is a discovery/attachment source only, never presence. */
const MAC_PATTERN = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/;

export function normalizeXiaomiAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('请输入小米路由器的局域网 IP 地址');
  let parsed;
  try { parsed = new URL(/^https?:\/\//i.test(raw) ? raw : 'http://' + raw); }
  catch { throw new Error('小米路由器地址格式不正确'); }
  const octets = parsed.hostname.split('.').map(Number);
  const privateIp = octets.length === 4 &&
    octets.every((n, i) => /^\d{1,3}$/.test(parsed.hostname.split('.')[i]) && n >= 0 && n <= 255) &&
    (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168));
  if (!privateIp || !['http:', 'https:'].includes(parsed.protocol) || parsed.username ||
      parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('仅允许填写局域网私有 IPv4 地址，可带 HTTP(S) 端口');
  }
  return parsed.origin;
}

export function xiaomiConnection(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === '0' || ['line', 'lan', 'wired', 'ethernet', '有线'].includes(value))
    return { connectionType: 'wired', band: '' };
  if (value === '1' || /^(2[.]4|2[.]4g|2g|2[.]4ghz|2[.]4g wifi)$/.test(value))
    return { connectionType: 'wireless', band: '2.4G' };
  if (value === '2' || /^(5|5g|5ghz|5g wifi)$/.test(value))
    return { connectionType: 'wireless', band: '5G' };
  if (value === '3' || ['wifi', 'wireless', 'guest', 'wi-fi'].includes(value))
    return { connectionType: 'wireless', band: '' };
  return { connectionType: '', band: '' };
}

function validMac(value) {
  const mac = String(value || '').replace(/-/g, ':').toUpperCase();
  return MAC_PATTERN.test(mac) && mac !== '00:00:00:00:00:00' ? mac : '';
}

export function parseXiaomiDevices(payload) {
  const nested = payload?.data;
  const body = nested && (Array.isArray(nested.list) || Array.isArray(nested.dev)) ? nested : payload;
  const entries = Array.isArray(body?.list) ? body.list : body?.dev;
  if (!body || Number(payload?.code ?? body.code ?? 0) !== 0 || !Array.isArray(entries))
    throw new Error('小米路由器未返回有效设备列表');
  const result = new Map();
  for (const entry of entries.slice(0, 2048)) {
    const mac = validMac(entry?.mac || entry?.macaddr);
    if (!mac) continue;
    const ips = Array.isArray(entry.ip) ? entry.ip : [];
    const ip = ips.find(row => row?.active && row?.ip)?.ip || ips[0]?.ip ||
      (typeof entry.ip === 'string' ? entry.ip : '') || entry.ipaddr || '';
    const attachment = xiaomiConnection(
      entry.type ?? entry.connectType ?? entry.connection_type ?? entry.connectionType);
    const row = {
      mac,
      name: String(entry.name || entry.oname || entry.hostname || entry.origin_name || '').trim().slice(0, 100),
      ip: String(ip || '').trim(),
      connectionType: attachment.connectionType,
      band: attachment.band,
      // Only an explicit current-inventory offline status is a negative
      // observation. Xiaomi's online flag is never used as proof of online.
      reportedOffline: entry.online === 0 || entry.online === false ||
        entry.online === '0' || entry.online === 'offline'
    };
    const previous = result.get(mac);
    // If a Mesh node repeats the same MAC, prefer a row that identifies
    // the attachment; never infer online/offline from Xiaomi's "online".
    if (!previous || (!previous.connectionType && row.connectionType) ||
        (!previous.band && row.band && previous.connectionType === row.connectionType))
      result.set(mac, row);
  }
  return [...result.values()];
}


// Keep historical attachment records as metadata only: no Xiaomi online flag,
// connection count or historical IP may ever become live QWRT presence data.
export function mergeXiaomiDeviceLists(current = [], history = []) {
  const byMac = new Map();
  for (const row of history) {
    if (!row?.mac) continue;
    byMac.set(row.mac, {
      mac: row.mac, name: row.name || '', ip: '',
      connectionType: row.connectionType || '', band: row.band || '',
      reportedOffline: false, // History alone is not an offline observation.
      xiaomiHistoryOnly: true
    });
  }
  for (const row of current) {
    if (!row?.mac) continue;
    const previous = byMac.get(row.mac);
    const connectionType = row.connectionType || previous?.connectionType || '';
    const inheritedType = !row.connectionType && !!previous?.connectionType;
    const inheritedBand = connectionType === 'wireless' &&
      !row.band && previous?.connectionType === 'wireless' && !!previous.band;
    byMac.set(row.mac, {
      mac: row.mac,
      name: row.name || previous?.name || '',
      ip: row.ip || '',
      reportedOffline: row.reportedOffline === true,
      connectionType,
      band: connectionType === 'wireless'
        ? (row.band || (previous?.connectionType === 'wireless' ? previous.band : '') || '')
        : '',
      xiaomiHistoryOnly: inheritedType || inheritedBand
    });
  }
  return [...byMac.values()];
}

/**
 * Always attempt both inventory endpoints. Some firmware returns only current
 * clients from misystem/devicelist and historical clients from
 * xqsystem/device_list?all=1. A partial success is still useful; two failures
 * remain an error so the caller can retry a revoked Xiaomi login token.
 */
export async function queryXiaomiDeviceLists(request) {
  const [currentResult, historyResult] = await Promise.allSettled([
    request('misystem/devicelist').then(parseXiaomiDevices),
    request('xqsystem/device_list?all=1').then(parseXiaomiDevices)
  ]);
  if (currentResult.status === 'rejected' && historyResult.status === 'rejected')
    throw currentResult.reason || historyResult.reason || new Error('小米设备列表获取失败');
  return mergeXiaomiDeviceLists(
    currentResult.status === 'fulfilled' ? currentResult.value : [],
    historyResult.status === 'fulfilled' ? historyResult.value : []
  );
}

/** Attachment label is descriptive, never evidence that a device is online. */
export function formatTerminalConnectionLabel(item) {
  if (!item?.connectionType) return '';
  const fromXiaomi = item.connectionSource === 'xiaomi';
  if (item.online !== true && !fromXiaomi) return '';
  const historical = fromXiaomi && (item.online !== true || item.xiaomiHistoryOnly === true);
  const medium = item.connectionType === 'wired' ? 'LAN'
    : item.connectionType === 'wireless'
      ? (historical
          ? (item.connectionBand || '无线（频段未知）')
          : (item.connectionBand ? '无线 · ' + item.connectionBand : '无线'))
      : '';
  return medium ? (historical ? '曾接入 · ' : '') + medium : '';
}


/**
 * Login challenge is embedded in Xiaomi's public /cgi-bin/luci/web HTML,
 * not in the init_info JSON response on newer (e.g. RD18) firmware.
 * Never execute or render the returned HTML; extract only bounded tokens.
 */
export function parseXiaomiLoginPage(html) {
  const page = String(html || '')
  if (page.length > 262144 || !page.trimStart().startsWith('<'))
    throw new Error('小米管理登录页无效或内容过大')
  const key = page.match(/\bkey\s*:\s*(['"])([A-Za-z0-9_+=\/-]{1,128})\1/)?.[2] || ''
  const deviceId = page.match(/\bdeviceId\s*=\s*(['"])([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})\1/)?.[2] || ''
  if (!key || !deviceId)
    throw new Error('无法从小米管理登录页提取 key 或 deviceId；该固件登录页面可能不兼容')
  return { key, deviceId: deviceId.toLowerCase() }
}
