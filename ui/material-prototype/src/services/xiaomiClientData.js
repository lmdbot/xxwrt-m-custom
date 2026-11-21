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
  if (value === '0' || ['lan', 'wired', 'ethernet', '有线'].includes(value))
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
  const body = payload?.data?.list ? payload.data : payload;
  if (!body || Number(body.code ?? 0) !== 0 || !Array.isArray(body.list))
    throw new Error('小米路由器未返回有效设备列表');
  const result = new Map();
  for (const entry of body.list.slice(0, 2048)) {
    const mac = validMac(entry?.mac || entry?.macaddr);
    if (!mac) continue;
    const ips = Array.isArray(entry.ip) ? entry.ip : [];
    const ip = ips.find(row => row?.active && row?.ip)?.ip || ips[0]?.ip ||
      (typeof entry.ip === 'string' ? entry.ip : '') || entry.ipaddr || '';
    const attachment = xiaomiConnection(entry.type ?? entry.connectType ?? entry.connection_type);
    const row = {
      mac,
      name: String(entry.name || entry.oname || entry.hostname || '').trim().slice(0, 100),
      ip: String(ip || '').trim(),
      connectionType: attachment.connectionType,
      band: attachment.band
    };
    const previous = result.get(mac);
    // If a Mesh node repeats the same MAC, prefer a row that identifies
    // the attachment; never infer online/offline from Xiaomi's "online".
    if (!previous || (!previous.connectionType && row.connectionType))
      result.set(mac, row);
  }
  return [...result.values()];
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
  const key = page.match(/\bkey\s*:\s*(['"])([A-Za-z0-9_+=/-]{1,128})\1/)?.[2] || ''
  const deviceId = page.match(/\bdeviceId\s*=\s*(['"])([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})\1/)?.[2] || ''
  if (!key || !deviceId)
    throw new Error('无法从小米管理登录页提取 key 或 deviceId；该固件登录页面可能不兼容')
  return { key, deviceId: deviceId.toLowerCase() }
}
