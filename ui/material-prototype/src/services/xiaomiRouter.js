import { Capacitor } from '@capacitor/core';
import { xiaomiRequestFromQwrt } from './xiaomiQwrtTransport.js';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { normalizeXiaomiAddress, parseXiaomiDevices, parseXiaomiLoginPage } from './xiaomiClientData.js';

const ADDRESS_KEY = 'xxwrt_xiaomi_address_v1_';
const PASSWORD_KEY = 'xxwrt_xiaomi_password_v1_';
// Xiaomi cookies are tied to the current authenticated QWRT client session.
const sessions = new WeakMap();
export function resetXiaomiSession(qwrt) {
  if (qwrt) sessions.delete(qwrt);
}

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
  return origin;
}

export async function clearXiaomiConfig(routerId) {
  const origin = readXiaomiAddress(routerId);
  if (Capacitor.isNativePlatform()) {
    try { await SecureStorage.remove(PASSWORD_KEY + routerId); }
    catch (error) { throw new Error('无法从安全存储中清除小米密码：' + String(error?.message || error)); }
  }
  localStorage.removeItem(ADDRESS_KEY + routerId);
}

export async function readXiaomiPassword(routerId) {
  if (!Capacitor.isNativePlatform()) return '';
  return (await SecureStorage.get(PASSWORD_KEY + routerId)) || '';
}

async function digest(algorithm, value) {
  if (!globalThis.crypto?.subtle)
    throw new Error('当前环境无法执行小米路由器的安全口令摘要');
  const bytes = new TextEncoder().encode(value);
  const result = await globalThis.crypto.subtle.digest(algorithm, bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function login(qwrt, origin, password) {
  const prefix = '/cgi-bin/luci';
  const info = await xiaomiRequestFromQwrt(qwrt, origin, prefix + '/api/xqsystem/init_info');
  if (Number(info.code ?? -1) !== 0)
    throw new Error('小米路由器初始化接口返回异常，无法判断登录加密模式');
  // Xiaomi's challenge key and actual device MAC are embedded in the public
  // management login HTML, not in init_info on BE5000/RD18 firmware.
  const page = await xiaomiRequestFromQwrt(qwrt, origin, prefix + '/web');
  const { key, deviceId } = parseXiaomiLoginPage(page);
  const algorithm = Number(info.newEncryptMode) === 1 ? 'SHA-256' : 'SHA-1';
  const random = new Uint32Array(1);
  globalThis.crypto.getRandomValues(random);
  const nonce = '0_' + deviceId + '_' + Math.floor(Date.now() / 1000) +
    '_' + (1000 + (random[0] % 9000));
  const inner = await digest(algorithm, password + key);
  const passHash = await digest(algorithm, nonce + inner);
  // Only a one-way proof travels from the App to QWRT. The plaintext
  // password stays in Android SecureStorage / memory, never on the router.
  const response = await xiaomiRequestFromQwrt(qwrt, origin, prefix + '/api/xqsystem/login',
    { username: 'admin', password: passHash, logtype: '2', nonce });
  const token = response.token || response.stok;
  if (Number(response.code ?? -1) !== 0 || !token)
    throw new Error('小米路由器登录未通过（code: ' + String(response.code ?? '未知') + '），请确认管理密码；连续失败请稍后再试，避免触发锁定');
  sessions.set(qwrt, { origin, token: String(token), session: qwrt.session });
  return String(token);
}

async function listWithToken(qwrt, origin, token) {
  const endpoint = '/cgi-bin/luci/;stok=' + encodeURIComponent(token) + '/api/';
  let firstFailure;
  for (const path of ['misystem/devicelist', 'xqsystem/device_list?all=1']) {
    try {
      const body = await xiaomiRequestFromQwrt(qwrt, origin, endpoint + path);
      return parseXiaomiDevices(body);
    } catch (error) { firstFailure ||= error; }
  }
  throw firstFailure || new Error('小米路由器未提供设备列表接口');
}

/** Returned rows contain no online status. Never trust Xiaomi's online flags. */
export async function fetchXiaomiDevices(qwrt, address, password) {
  const origin = normalizeXiaomiAddress(address);
  if (!password) throw new Error('未保存小米路由器管理密码，请重新配置');
  if (!qwrt?.session) throw new Error('请先登录 QWRT');
  const cached = sessions.get(qwrt);
  let token = cached?.origin === origin && cached.session === qwrt.session ? cached.token : '';
  if (!token) token = await login(qwrt, origin, password);
  try {
    return await listWithToken(qwrt, origin, token);
  } catch {
    // A stale stok can be revoked on router reboot. Refresh it once; never
    // reuse a failed device list as live client data.
    resetXiaomiSession(qwrt);
    token = await login(qwrt, origin, password);
    return listWithToken(qwrt, origin, token);
  }
}
