const mockDeleteAsync = jest.fn(async (..._a: unknown[]) => undefined)
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: (...a: unknown[]) => mockDeleteAsync(...a),
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => undefined)
}))

jest.mock('@/pouchdb/destroyLocalData', () => ({
  destroyLocalData: jest.fn(async () => undefined)
}))

import { wipeDeviceData } from './wipeDeviceData'
import { destroyLocalData } from '@/pouchdb/destroyLocalData'
import { setAccountScope } from '@/storage/accountScope'

const deleted = (): string[] => mockDeleteAsync.mock.calls.map(c => String(c[0]))

describe('wipeDeviceData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setAccountScope('https://alice.twake.app')
  })
  afterEach(() => setAccountScope(null))

  it('drops the replica and the sync bookkeeping', async () => {
    await wipeDeviceData()
    expect(destroyLocalData).toHaveBeenCalled()
  })

  it('deletes the offline copies and the viewer cache of the account in scope', async () => {
    await wipeDeviceData()

    const paths = deleted()
    expect(paths.some(p => p.includes('offline/alice.twake.app'))).toBe(true)
    expect(paths.some(p => p.includes('twake-drive/viewer/alice.twake.app'))).toBe(true)
  })

  // The directories are resolved through the account in scope, so a caller
  // that clears the scope first would wipe the no-account directory instead
  // and leave the real one on disk.
  it('wipes nothing belonging to another account once the scope is cleared', async () => {
    setAccountScope(null)

    await wipeDeviceData()

    expect(deleted().some(p => p.includes('alice.twake.app'))).toBe(false)
  })

  it('keeps going when one directory cannot be removed', async () => {
    mockDeleteAsync.mockRejectedValueOnce(new Error('busy'))

    await expect(wipeDeviceData()).resolves.toBeUndefined()

    expect(deleted().some(p => p.includes('twake-drive/viewer'))).toBe(true)
  })
})
