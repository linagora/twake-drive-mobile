const mockFetch = jest.fn()

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockFetch(...args) }
}))

jest.mock('cozy-pouch-link', () => ({
  __esModule: true,
  default: jest.fn(),
  SQLiteQuery: class FakeSQLiteQuery {}
}))

jest.mock('pouchdb-browser', () => ({ __esModule: true, default: 'pouchdb-browser-stub' }))

jest.mock('./sqliteStorage', () => ({
  sqliteStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    destroy: jest.fn()
  }
}))

import { pouchPlatform } from './pouchPlatform'
import { sqliteStorage } from './sqliteStorage'

describe('pouchPlatform', () => {
  beforeEach(() => mockFetch.mockReset())

  it('exposes the LinkPlatform shape', () => {
    expect(pouchPlatform.storage).toBe(sqliteStorage)
    expect(pouchPlatform.queryEngine).toBeDefined()
    expect(pouchPlatform.pouchAdapter).toBeDefined()
    expect(typeof pouchPlatform.isOnline).toBe('function')
    expect(pouchPlatform.events).toBeDefined()
    expect(typeof pouchPlatform.events.addEventListener).toBe('function')
    expect(typeof pouchPlatform.events.removeEventListener).toBe('function')
  })

  it('isOnline returns true when NetInfo says connected', async () => {
    mockFetch.mockResolvedValueOnce({ isConnected: true })
    expect(await pouchPlatform.isOnline()).toBe(true)
  })

  it('isOnline returns false when NetInfo says disconnected', async () => {
    mockFetch.mockResolvedValueOnce({ isConnected: false })
    expect(await pouchPlatform.isOnline()).toBe(false)
  })

  it('isOnline returns false when NetInfo throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('net'))
    expect(await pouchPlatform.isOnline()).toBe(false)
  })
})
