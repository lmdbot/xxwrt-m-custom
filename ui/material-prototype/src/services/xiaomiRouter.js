import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { normalizeXiaomiAddress, parseXiaomiDevices } from './xiaomiClientData.js';

const ADDRESS_KEY = 'xxwrt_xiaomi_address_v1_';
const PASSWORD_KEY = 'xxwrt_xiaomi_password_v1_';
const sessions = new Map();

export function readXiaomiAddress(routerId) {
  if (!routerId) return '';
  try { return normalizeXiaomiAddress(localStorage.getItem(ADDRESS_KEY + routerId)); }
  catch { return ''; }
}

export async function saveXiaomiConfig(routerId, address, password) {
  if (!routerId) throw new Error('请先连接 QWRT 路由器');
  const origin = normalizeXiaomiAddress(address);
  if (!password) throw new Error('请输入小米路由器管理密码');
  if (!Capacitor.isNativePlatform())
    throw new Error('安全保存密码仅支持 Android App，请在手机端配置');
  // Write the secret first. Never mark a Xiaomi source configured if its
  // Keystore write failed, and never put plaintext password in localStorage.
  await SecureStorage.set(PASSWORD_KEY + routerId, password);
  localStorage.setItem(ADDRESS_KEY + routerId, origin);
  sessions.delete(origin);
  return origin;
}

export async function clearXiaomiConfig(routerId) {
  const origin = readXiaomiAddress(routerId);
  if (Capacitor.isNativePlatform()) {
    try { await SecureStorage.remove(PASSWORD_KEY + routerId); }
    catch (error) { throw new Error('无法从安全存储中清除小米密码：' + String(error?.message || error)); }
  }
  localStorage.removeItem(ADDRESS_KEY + routerId);
  if (origin) sessions.delete(origin);
}

export async function readXiaomiPassword(routerId) {
  if (!Capacitor.isNativePlatform()) return '';
  return (await SecureStorage.get(PASSWORD_KEY + routerId)) || '';
}

function decodeResponse(response) {
  if (response.status < 200 || response.status >= 300)
    throw new Error('小米路由器 HTTP ' + response.status + '，请检查 IP 和管理权限');
  let body = response.data;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { throw new Error('小米接口返回了非 JSON 响应'); }
  }
  if (!body || typeof body !== 'object')
    throw new Error('小米接口响应为空');
  return body;
}

async function apiGet(url) {
  return decodeResponse(await CapacitorHttp.get({
    url, headers: { Accept: 'application/json' },
    connectTimeout: 5500, readTimeout: 7500, disableRedirects: true
  }));
}

async function apiPost(url, data) {
  return decodeResponse(await CapacitorHttp.post({
    url, data: new URLSearchParams(data).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    connectTimeout: 5500, readTimeout: 7500, disableRedirects: true
  }));
}

async function digest(algorithm, value) {
  if (!globalThis.crypto?.subtle)
    throw new Error('当前环境无法执行小米路由器的安全口令摘要');
  const bytes = new TextEncoder().encode(value);
  const result = await globalThis.crypto.subtle.digest(algorithm, bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function login(origin, password) {
  const prefix = origin + '/cgi-bin/luci';
  const info = await apiGet(prefix + '/api/xqsystem/init_info');
  if (Number(info.code ?? 0) !== 0 || typeof info.key !== 'string')
    throw new Error('小米路由器不支持当前登录接口（init_info）');
  const algorithm = Number(info.newEncryptMode) === 1 ? 'SHA-256' : 'SHA-1';
  const random = new Uint32Array(1);
  globalThis.crypto.getRandomValues(random);
  const nonce = '0_00:00:00:00:00:00_' + Math.floor(Date.now() / 1000) + '_' + (random[0] % 100000);
  const inner = await digest(algorithm, password + info.key);
  const passHash = await digest(algorithm, nonce + inner);
  const response = await apiPost(prefix + '/api/xqsystem/login',
    { username: 'admin', password: passHash, logtype: '2', nonce });
  const token = response.token || response.stok;
  if (Number(response.code ?? -1) !== 0 || !token)
    throw new Error('小米路由器登录失败，请确认管理密码和后台访问权限');
  sessions.set(origin, String(token));
  return String(token);
}

async function listWithToken(origin, token) {
  const endpoint = origin + '/cgi-bin/luci/;stok=' + encodeURIComponent(token) + '/api/';
  let firstFailure;
  for (const path of ['misystem/devicelist', 'xqsystem/device_list?all=1']) {
    try {
      const body = await apiGet(endpoint + path);
      return parseXiaomiDevices(body);
    } catch (error) { firstFailure ||= error; }
  }
  throw firstFailure || new Error('小米路由器未提供设备列表接口');
}

/** Returned rows contain no online status. Never trust Xiaomi's online flags. */
export async function fetchXiaomiDevices(address, password) {
  const origin = normalizeXiaomiAddress(address);
  if (!password) throw new Error('未保存小米路由器管理密码，请重新配置');
  let token = sessions.get(origin);
  if (!token) token = await login(origin, password);
  try {
    return await listWithToken(origin, token);
  } catch {
    // A stale stok can be revoked on router reboot. Refresh it once; never
    // reuse a failed device list as live client data.
    sessions.delete(origin);
    token = await login(origin, password);
    return listWithToken(origin, token);
  }
}
