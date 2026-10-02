import React from 'react'
import { Text, Pressable } from 'react-native'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getStackClient: () => ({
      register: jest.fn(),
      fetchJSON: jest.fn().mockResolvedValue({
        access_token: 'a',
        refresh_token: 'r',
        token_type: 'bearer',
        scope: '*'
      }),
      oauthOptions: {
        clientID: 'cid',
        clientSecret: 'csecret',
        clientName: 'Twake Drive Mobile',
        softwareID: 'twake-drive-mobile',
        redirectURI: 'twakedrive://',
        clientKind: 'mobile',
        clientURI: 'https://twake.app',
        scopes: ['io.cozy.files']
      }
    }),
    registerPlugin: jest.fn(),
    login: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    // createClient() runs triggerPouchReplication, which does
    // client.links.find(...); an empty array lets it no-op gracefully here.
    links: []
  })),
  StackLink: jest.fn()
}))

const mockWipeDeviceData = jest.fn(async () => undefined)
jest.mock('./wipeDeviceData', () => ({
  wipeDeviceData: (...a: unknown[]) => mockWipeDeviceData(...(a as []))
}))

const mockCloseSsoSession = jest.fn(async () => undefined)
const mockSsoLogoutUrl = jest.fn((_client: unknown, signupUrl?: string) =>
  signupUrl ? `resolved:${signupUrl}` : null
)
jest.mock('./ssoLogout', () => ({
  closeSsoSession: (...a: unknown[]) => mockCloseSsoSession(...(a as [])),
  ssoLogoutUrl: (client: unknown, signupUrl?: string) => mockSsoLogoutUrl(client, signupUrl)
}))

const mockDestroyLocalData = jest.fn(async (..._args: unknown[]) => undefined)
jest.mock('@/pouchdb/destroyLocalData', () => ({
  destroyLocalData: (...args: unknown[]) => mockDestroyLocalData(...args)
}))

const mockDropAllFileNameIndexes = jest.fn(async (..._args: unknown[]) => undefined)
jest.mock('@/search/searchDatabases', () => ({
  dropAllFileNameIndexes: (...args: unknown[]) => mockDropAllFileNameIndexes(...args),
  ensureAllFileNameIndexes: jest.fn(async () => undefined),
  setReplicating: jest.fn()
}))

jest.mock('cozy-flags', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { plugin: jest.fn() })
}))

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { changeLanguage: jest.fn() },
  resolveDeviceLanguage: jest.fn(() => 'en')
}))

import CozyClient from 'cozy-client'
import flag from 'cozy-flags'

import i18n, { resolveDeviceLanguage } from '@/i18n'
import * as tokenStorage from './tokenStorage'
import * as twakeAuthBridge from '@/native/twakeAuthBridge'
import * as freshInstall from './freshInstall'
import * as oidcFlow from './oidcFlow'
import * as autodiscovery from './autodiscovery'
import * as registerSessionMod from './registerSession'
import { useAuth, AuthProvider } from './useAuth'

const mockSession = {
  uri: 'https://alice.example.com',
  oauthOptions: {
    clientID: 'cid',
    clientSecret: 'csecret',
    clientName: 'Twake Drive Mobile',
    softwareID: 'twake-drive-mobile',
    redirectURI: 'twakedrive://',
    clientKind: 'mobile',
    clientURI: 'https://twake.app',
    scopes: ['io.cozy.files']
  },
  token: { accessToken: 'a', refreshToken: 'r', tokenType: 'bearer', scope: '*' }
}

const Probe = () => {
  const { status, login, logout, sessionExpired, devResetAndResync } = useAuth()
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="expired">{String(sessionExpired)}</Text>
      <Pressable testID="login" onPress={() => login('user@example.com').catch(() => {})} />
      <Pressable testID="logout" onPress={() => logout()} />
      <Pressable testID="logout-expired" onPress={() => logout({ expired: true })} />
      <Pressable testID="logout-wipe" onPress={() => logout({ wipe: true })} />
      <Pressable testID="resync" onPress={() => devResetAndResync()} />
    </>
  )
}

describe('useAuth', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    // restoreAllMocks leaves jest.fn()s from jest.mock factories alone.
    mockWipeDeviceData.mockClear()
    mockCloseSsoSession.mockClear()
    mockSsoLogoutUrl.mockClear()
    ;(flag as unknown as jest.Mock).mockReset()
    mockDestroyLocalData.mockClear()
    mockDropAllFileNameIndexes.mockClear()
  })

  it('starts loading then transitions to unauthenticated when no session', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(null)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
  })

  it('clears what the native side holds when a launch finds no session', async () => {
    jest.spyOn(freshInstall, 'clearSessionLeftByAPreviousInstall').mockResolvedValue(false)
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(null)
    const clearNative = jest.spyOn(twakeAuthBridge, 'clearNativeSession')
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(clearNative).toHaveBeenCalled()
  })

  it('falls back to unauthenticated when the initial session read fails (no permanent loading)', async () => {
    // Regression: on iOS Simulator (unsigned build) SecureStore/keychain can
    // reject; the bootstrap must not leave the app stuck on the loading spinner.
    jest.spyOn(tokenStorage, 'getSession').mockRejectedValue(new Error('keychain unavailable'))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
  })

  it('transitions to authenticated when a session exists', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
  })

  it('login flow fetches loginUri, runs OIDC, registers, saves, transitions to authenticated', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(null)
    jest.spyOn(autodiscovery, 'getLoginUri').mockResolvedValue(new URL('https://login.example.com'))
    jest
      .spyOn(oidcFlow, 'startOidcFlow')
      .mockResolvedValue({ fqdn: 'alice.example.com', code: 'tok', defaultRedirection: null })
    jest.spyOn(registerSessionMod, 'registerSession').mockResolvedValue(mockSession)
    const saveSpy = jest.spyOn(tokenStorage, 'saveSession').mockResolvedValue()

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('login'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(saveSpy).toHaveBeenCalledWith(mockSession)
  })

  // A session revoked from the web ends on its own: the welcome screen has to
  // say so rather than reappear as if the user had asked to leave (#270).
  it('a session that ended on its own is flagged for the welcome screen', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout-expired'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(screen.getByTestId('expired')).toHaveTextContent('true')
  })

  it('a logout the user asked for explains nothing', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(screen.getByTestId('expired')).toHaveTextContent('false')
  })

  it('logout clears session and transitions to unauthenticated', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    const clearSpy = jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(clearSpy).toHaveBeenCalled()
    // login screen returns to the device language, dropping the instance locale
    expect(resolveDeviceLanguage).toHaveBeenCalled()
    expect(i18n.changeLanguage).toHaveBeenCalledWith('en')
  })

  it('a logout the user asked for closes the SSO session too', async () => {
    ;(flag as unknown as jest.Mock).mockImplementation((name: string) =>
      name === 'signup.url' ? 'https://sign-up.example.com' : undefined
    )
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(mockSsoLogoutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ logout: expect.any(Function) }),
      'https://sign-up.example.com'
    )
    expect(mockCloseSsoSession).toHaveBeenCalledWith('resolved:https://sign-up.example.com')
  })

  it('stays on the drive until the logout page is closed', async () => {
    ;(flag as unknown as jest.Mock).mockImplementation((name: string) =>
      name === 'signup.url' ? 'https://sign-up.example.com' : undefined
    )
    let browserClosed: () => void = () => undefined
    mockCloseSsoSession.mockImplementationOnce(
      () => new Promise<undefined>(resolve => (browserClosed = () => resolve(undefined)))
    )
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    const clearSpy = jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    // A first launch clears the session a previous install may have left.
    clearSpy.mockClear()

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout'))
    })
    expect(mockCloseSsoSession).toHaveBeenCalled()
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(clearSpy).not.toHaveBeenCalled()

    await act(async () => {
      browserClosed()
    })
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(clearSpy).toHaveBeenCalled()
  })

  it('a session that ended on its own opens no browser', async () => {
    ;(flag as unknown as jest.Mock).mockImplementation((name: string) =>
      name === 'signup.url' ? 'https://sign-up.example.com' : undefined
    )
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout-expired'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(mockCloseSsoSession).not.toHaveBeenCalled()
  })

  // A revocation is somebody else ending the session — most often an admin
  // taking the device back. Nothing of the account may survive it.
  it('a revoked session wipes what the device holds', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout-expired'))
    })

    await waitFor(() => expect(mockWipeDeviceData).toHaveBeenCalled())
  })

  it('a logout the user asked for keeps the local data by default', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(mockWipeDeviceData).not.toHaveBeenCalled()
  })

  it('a logout that asked to erase wipes too', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout-wipe'))
    })

    await waitFor(() => expect(mockWipeDeviceData).toHaveBeenCalled())
  })

  it('a logout drops the name indexes before the client destroys its databases', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    const clients = (CozyClient as unknown as jest.Mock).mock.results
    const client = clients[clients.length - 1].value as { logout: jest.Mock }

    await act(async () => {
      fireEvent.press(screen.getByTestId('logout'))
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(mockDropAllFileNameIndexes).toHaveBeenCalledWith(client)
    expect(client.logout).toHaveBeenCalledTimes(1)
    expect(mockDropAllFileNameIndexes.mock.invocationCallOrder[0]).toBeLessThan(
      client.logout.mock.invocationCallOrder[0]
    )
  })

  it('a resync drops the name indexes before the local data is destroyed', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      fireEvent.press(screen.getByTestId('resync'))
    })

    await waitFor(() => expect(mockDestroyLocalData).toHaveBeenCalledTimes(1))
    expect(mockDropAllFileNameIndexes).toHaveBeenCalledTimes(1)
    expect(mockDropAllFileNameIndexes.mock.invocationCallOrder[0]).toBeLessThan(
      mockDestroyLocalData.mock.invocationCallOrder[0]
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
  })
})
