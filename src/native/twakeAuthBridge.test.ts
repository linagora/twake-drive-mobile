jest.mock('react-native', () => ({
  NativeModules: {
    TwakeAuthBridge: {
      syncSession: jest.fn(async () => true),
      clearSession: jest.fn(async () => true),
      isAppLinkUsable: jest.fn(async () => true)
    }
  },
  Platform: { OS: 'android' }
}))

import { NativeModules } from 'react-native'

import { mirrorSessionToNative, clearNativeSession, isAppLinkUsable } from './twakeAuthBridge'
import type { Session } from '@/auth/types'

const { syncSession, clearSession } = NativeModules.TwakeAuthBridge as {
  syncSession: jest.Mock
  clearSession: jest.Mock
}

const session: Session = {
  uri: 'https://alice.mycozy.cloud',
  oauthOptions: {
    clientID: 'cid',
    clientSecret: 'secret',
    clientName: 'x',
    softwareID: 'y',
    redirectURI: 'z',
    clientKind: 'mobile',
    clientURI: 'u',
    scopes: []
  },
  token: { accessToken: 'at', refreshToken: 'rt', tokenType: 'bearer', scope: '' }
}

beforeEach(() => jest.clearAllMocks())

test('mirrors the durable creds as JSON', async () => {
  await mirrorSessionToNative(session)
  expect(syncSession).toHaveBeenCalledWith(
    JSON.stringify({
      uri: 'https://alice.mycozy.cloud',
      clientId: 'cid',
      clientSecret: 'secret',
      refreshToken: 'rt'
    })
  )
})

test('clear delegates to native', async () => {
  await clearNativeSession()
  expect(clearSession).toHaveBeenCalledTimes(1)
})

describe('isAppLinkUsable', () => {
  const native = NativeModules.TwakeAuthBridge as { isAppLinkUsable: jest.Mock }

  it('relays the native answer', async () => {
    native.isAppLinkUsable.mockResolvedValueOnce(false)
    await expect(isAppLinkUsable()).resolves.toBe(false)
    native.isAppLinkUsable.mockResolvedValueOnce(true)
    await expect(isAppLinkUsable()).resolves.toBe(true)
  })

  it('keeps the App Link when the native call fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    native.isAppLinkUsable.mockRejectedValueOnce(new Error('boom'))
    await expect(isAppLinkUsable()).resolves.toBe(true)
    warn.mockRestore()
  })
})
