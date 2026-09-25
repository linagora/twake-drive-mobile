const mockClearSession = jest.fn().mockResolvedValue(undefined)
jest.mock('./tokenStorage', () => ({ clearSession: () => mockClearSession() }))

jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>()
  return {
    __store: store,
    createMMKV: () => ({
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => store.set(key, value)
    })
  }
})

import * as mmkv from 'react-native-mmkv'

import { clearSessionLeftByAPreviousInstall } from './freshInstall'

const store = (mmkv as unknown as { __store: Map<string, string> }).__store

describe('clearSessionLeftByAPreviousInstall', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    store.clear()
  })

  // Deleting the app takes the container, and with it MMKV. It does not take
  // the keychain, so what is left there belongs to an app the user removed.
  it('drops what the keychain kept from an install that is gone', async () => {
    const cleared = await clearSessionLeftByAPreviousInstall()

    expect(cleared).toBe(true)
    expect(mockClearSession).toHaveBeenCalledTimes(1)
  })

  it('leaves the session alone on every launch after that', async () => {
    await clearSessionLeftByAPreviousInstall()
    mockClearSession.mockClear()

    const cleared = await clearSessionLeftByAPreviousInstall()

    expect(cleared).toBe(false)
    expect(mockClearSession).not.toHaveBeenCalled()
  })

  // A keychain that could not be read yet must be worth another try, or the
  // session it holds survives for good.
  it('tries again when the keychain could not be cleared', async () => {
    mockClearSession.mockRejectedValueOnce(new Error('keychain locked'))

    await expect(clearSessionLeftByAPreviousInstall()).rejects.toThrow('keychain locked')

    mockClearSession.mockClear()
    const cleared = await clearSessionLeftByAPreviousInstall()

    expect(cleared).toBe(true)
    expect(mockClearSession).toHaveBeenCalledTimes(1)
  })
})
