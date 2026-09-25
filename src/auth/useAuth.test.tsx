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
    // createClient() runs triggerPouchReplication, which does
    // client.links.find(...); an empty array lets it no-op gracefully here.
    links: []
  })),
  StackLink: jest.fn()
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

import i18n, { resolveDeviceLanguage } from '@/i18n'
import * as tokenStorage from './tokenStorage'
import * as oidcFlow from './oidcFlow'
import * as autodiscovery from './autodiscovery'
import * as registerSessionMod from './registerSession'
import { useAuth, AuthProvider, resetLiveClientForTests } from './useAuth'

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
  const { status, login, logout, sessionExpired } = useAuth()
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="expired">{String(sessionExpired)}</Text>
      <Pressable testID="login" onPress={() => login('user@example.com').catch(() => {})} />
      <Pressable testID="logout" onPress={() => logout()} />
      <Pressable testID="logout-expired" onPress={() => logout({ expired: true })} />
    </>
  )
}

describe('useAuth', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    resetLiveClientForTests()
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

  // A Fast Refresh remounts the provider. Restarting the bootstrap there
  // dropped the user on the login screen with a live session behind it.
  it('keeps the session when the provider remounts', async () => {
    const getSessionSpy = jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)

    const first = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    const callsAfterBootstrap = getSessionSpy.mock.calls.length
    first.unmount()

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(getSessionSpy).toHaveBeenCalledTimes(callsAfterBootstrap)
  })

  it('does not resurrect a session after logout', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(mockSession)
    jest.spyOn(tokenStorage, 'clearSession').mockResolvedValue()

    const first = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await act(async () => {
      fireEvent.press(screen.getByTestId('logout'))
    })
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    first.unmount()

    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(null)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
  })
})
