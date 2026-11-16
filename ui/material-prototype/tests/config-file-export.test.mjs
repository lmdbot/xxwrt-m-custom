import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSnapshotFile } from '../src/services/configFileExport.js'

test('snapshot filename and contents are validated before invoking native picker', () => {
  const snapshot = JSON.stringify({ format: 'xxwrt-uci-snapshot', schema: 1, configs: {} })
  assert.doesNotThrow(() => validateSnapshotFile('xxwrt-192.168.100.1-2026-11-16.json', snapshot))
  for (const filename of ['../router.json', 'router.txt', '', 'xxwrt/backup.json', 'a'.repeat(130) + '.json']) {
    assert.throws(() => validateSnapshotFile(filename, snapshot))
  }
  assert.throws(() => validateSnapshotFile('xxwrt-backup.json', ''))
  assert.throws(() => validateSnapshotFile('xxwrt-backup.json', 'x'.repeat(2 * 1024 * 1024 + 1)))
})
