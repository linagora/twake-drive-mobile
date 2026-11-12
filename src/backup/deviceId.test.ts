import * as SecureStore from 'expo-secure-store'

import { backupDeviceId } from './deviceId'

jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }))

const getItem = SecureStore.getItemAsync as jest.Mock
const setItem = SecureStore.setItemAsync as jest.Mock

beforeEach(() => {
  getItem.mockReset()
  setItem.mockReset()
})

test('a phone keeps the id it already has', async () => {
  getItem.mockResolvedValue('known-id')
  await expect(backupDeviceId()).resolves.toBe('known-id')
  expect(setItem).not.toHaveBeenCalled()
})

test('a first id stays on this phone, out of the backups of another', async () => {
  getItem.mockResolvedValue(null)
  await expect(backupDeviceId()).resolves.toBe('new-id')
  expect(setItem).toHaveBeenCalledWith('twake-drive-backup-device-id', 'new-id', {
    keychainAccessible: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY'
  })
})
