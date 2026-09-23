// `mock` prefix: babel-plugin-jest-hoist only lets a module factory reach
// out-of-scope names starting with it.
const mockStores = new Map<string, Map<string, string>>()

jest.mock('react-native-mmkv', () => ({
  createMMKV: ({ id }: { id: string }) => {
    const data = mockStores.get(id) ?? new Map<string, string>()
    mockStores.set(id, data)
    return {
      getString: (key: string) => data.get(key),
      set: (key: string, value: string) => data.set(key, value),
      remove: (key: string) => data.delete(key),
      getAllKeys: () => [...data.keys()],
      clearAll: () => data.clear()
    }
  }
}))

import {
  accountDir,
  accountKey,
  accountKeyFromUri,
  accountStorage,
  adoptLegacyStorage,
  NO_ACCOUNT,
  resetAccountScopeForTests,
  setAccountScope
} from './accountScope'

beforeEach(() => {
  mockStores.clear()
  resetAccountScopeForTests()
})

describe('accountKeyFromUri', () => {
  it('keeps the host of the instance', () => {
    expect(accountKeyFromUri('https://quentin.mycozy.cloud')).toBe('quentin.mycozy.cloud')
  })

  it('ignores the scheme, the path and the case', () => {
    expect(accountKeyFromUri('HTTPS://Quentin.Twake.App/drive/#/folder')).toBe('quentin.twake.app')
  })

  it('replaces what a file name cannot carry', () => {
    expect(accountKeyFromUri('http://localhost:8080')).toBe('localhost_8080')
  })

  it('falls back when the uri holds no host', () => {
    expect(accountKeyFromUri('')).toBe(NO_ACCOUNT)
  })
})

describe('account scope', () => {
  it('starts with no account', () => {
    expect(accountKey()).toBe(NO_ACCOUNT)
  })

  it('follows the account that logs in', () => {
    setAccountScope('https://a.mycozy.cloud')
    expect(accountKey()).toBe('a.mycozy.cloud')
    setAccountScope(null)
    expect(accountKey()).toBe(NO_ACCOUNT)
  })

  it('gives each account its own directory', () => {
    setAccountScope('https://a.mycozy.cloud')
    expect(accountDir('file:///documents/offline/')).toBe(
      'file:///documents/offline/a.mycozy.cloud/'
    )
  })
})

describe('accountStorage', () => {
  it('keeps two accounts apart', () => {
    const store = accountStorage('offline-files')
    setAccountScope('https://a.mycozy.cloud')
    store.set('offline:file:1', 'a')

    setAccountScope('https://b.mycozy.cloud')
    expect(store.getString('offline:file:1')).toBeUndefined()

    setAccountScope('https://a.mycozy.cloud')
    expect(store.getString('offline:file:1')).toBe('a')
  })

  it('follows the account that logs in after the store was taken', () => {
    const store = accountStorage('offline-files')
    setAccountScope('https://a.mycozy.cloud')
    store.set('k', 'v')
    expect(mockStores.get('offline-files.a.mycozy.cloud')?.get('k')).toBe('v')
  })

  it('clears only the account in scope', () => {
    const store = accountStorage('offline-files')
    setAccountScope('https://a.mycozy.cloud')
    store.set('k', 'a')
    setAccountScope('https://b.mycozy.cloud')
    store.set('k', 'b')

    store.clearAll()

    expect(store.getString('k')).toBeUndefined()
    setAccountScope('https://a.mycozy.cloud')
    expect(store.getString('k')).toBe('a')
  })
})

describe('adoptLegacyStorage', () => {
  it('hands the unscoped store to the account in scope', () => {
    mockStores.set('offline-files', new Map([['offline:file:1', 'kept']]))
    setAccountScope('https://a.mycozy.cloud')

    adoptLegacyStorage('offline-files')

    expect(accountStorage('offline-files').getString('offline:file:1')).toBe('kept')
    expect(mockStores.get('offline-files')?.size).toBe(0)
  })

  it('leaves a later account nothing to take over', () => {
    mockStores.set('offline-files', new Map([['offline:file:1', 'kept']]))
    setAccountScope('https://a.mycozy.cloud')
    adoptLegacyStorage('offline-files')

    setAccountScope('https://b.mycozy.cloud')
    adoptLegacyStorage('offline-files')

    expect(accountStorage('offline-files').getString('offline:file:1')).toBeUndefined()
  })

  it('does not overwrite what the account already holds', () => {
    mockStores.set('offline-files', new Map([['k', 'legacy']]))
    mockStores.set('offline-files.a.mycozy.cloud', new Map([['k', 'mine']]))
    setAccountScope('https://a.mycozy.cloud')

    adoptLegacyStorage('offline-files')

    expect(accountStorage('offline-files').getString('k')).toBe('mine')
  })

  it('does nothing while no account is in scope', () => {
    mockStores.set('offline-files', new Map([['k', 'legacy']]))

    adoptLegacyStorage('offline-files')

    expect(mockStores.get('offline-files')?.get('k')).toBe('legacy')
  })
})
