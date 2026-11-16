import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSnapshotFile, systemBackupFilename, validateSystemBackupRequest } from '../src/services/configFileExport.js'

test('snapshot filename and contents are validated before invoking native picker', () => {
  const snapshot = JSON.stringify({ format: 'xxwrt-uci-snapshot', schema: 1, configs: {} })
  assert.doesNotThrow(() => validateSnapshotFile('xxwrt-192.168.100.1-2026-11-16.json', snapshot))
  for (const filename of ['../router.json', 'router.txt', '', 'xxwrt/backup.json', 'a'.repeat(130) + '.json']) {
    assert.throws(() => validateSnapshotFile(filename, snapshot))
  }
  assert.throws(() => validateSnapshotFile('xxwrt-backup.json', ''))
  assert.throws(() => validateSnapshotFile('xxwrt-backup.json', 'x'.repeat(2 * 1024 * 1024 + 1)))
})


test('native sysupgrade backup filename includes origin hostname and timestamp', () => {
  const now = new Date('2026-11-16T04:05:06.000Z')
  assert.equal(systemBackupFilename('http://192.168.100.1', now),
    'backup-192.168.100.1-2026-11-16T04-05-06.tar.gz')
  assert.match(systemBackupFilename('https://[2001:db8::1]:443', now),
    /^backup-.*-2026-11-16T04-05-06\.tar\.gz$/)
})

test('system tar.gz export rejects invalid sessions, URLs and filenames', () => {
  const client = { baseUrl: 'https://router.example.net', session: 'a'.repeat(32) }
  const filename = 'backup-router.example.net-2026-11-16T04-05-06.tar.gz'
  assert.doesNotThrow(() => validateSystemBackupRequest(client, filename))
  for (const name of ['../bad.tar.gz', 'backup.json', 'backup/other.tar.gz',
    'backup-router.tar.gz.exe']) {
    assert.throws(() => validateSystemBackupRequest(client, name))
  }
  assert.throws(() => validateSystemBackupRequest({ ...client, session: '' }, filename))
  assert.throws(() => validateSystemBackupRequest({
    ...client, baseUrl: 'file:///etc/config'
  }, filename))
  assert.throws(() => validateSystemBackupRequest({
    ...client, baseUrl: 'https://router.example.net/trick'
  }, filename))
})
