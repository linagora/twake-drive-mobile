import { readBackupSettings, writeBackupSettings } from './backupSettings'

jest.mock('@/storage/accountScope', () => {
  const values = new Map<string, string>()
  return {
    accountStorage: () => ({
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value)
    })
  }
})

test('the backup is off with no folder until it is turned on', () => {
  expect(readBackupSettings()).toEqual({ enabled: false, folder: null })
})

test('a change keeps what it does not touch', () => {
  writeBackupSettings({ enabled: true, folder: { id: 'd1', path: '/Photos/B/iPhone' } })
  writeBackupSettings({ enabled: false })
  expect(readBackupSettings()).toEqual({
    enabled: false,
    folder: { id: 'd1', path: '/Photos/B/iPhone' }
  })
})
