jest.mock('@/auth/pkce', () => ({
  generatePkce: jest.fn().mockResolvedValue({
    codeVerifier: 'test-verifier',
    codeChallenge: 'test-challenge'
  }),
  openAuthorizeUrl: jest.fn().mockResolvedValue('twakedrive://oauth?code=AUTHCODE&state=STATE')
}))

jest.mock('@/auth/storeCertification', () => ({
  certificationOAuthOptions: () => ({
    shouldRequireFlagshipPermissions: true,
    certificationConfig: { cloudProjectNumber: '123456789012', issuer: 'playintegrity' }
  }),
  tryStoreAttestation: (...args: unknown[]) => mockTryStoreAttestation(...args)
}))

const mockTryStoreAttestation = jest.fn().mockResolvedValue(true)

const mockAuthorize = jest.fn().mockResolvedValue({
  token: { accessToken: 'AT', refreshToken: 'RT', tokenType: 'bearer', scope: '*' }
})

// The stack of an OIDC instance answers the token exchange with a session
// code, which is the branch that goes through /auth/authorize.
const mockFetchJSON = jest.fn().mockResolvedValue({ session_code: 'SESSION-CODE' })

const mockStackClient = {
  setUri: jest.fn(),
  setOAuthOptions: jest.fn(),
  register: jest.fn().mockResolvedValue(undefined),
  fetchJSON: mockFetchJSON,
  oauthOptions: { clientID: 'client-id', clientSecret: 'secret' }
}

jest.mock('cozy-client', () => {
  const MockCozyClient = jest.fn().mockImplementation(() => ({
    getStackClient: () => mockStackClient,
    certifyFlagship: jest.fn(),
    authorize: mockAuthorize
  }))
  return { __esModule: true, default: MockCozyClient }
})

const mockResolveRedirectUri = jest.fn()
jest.mock('./redirectUri', () => ({
  ...jest.requireActual('./redirectUri'),
  resolveRedirectUri: () => mockResolveRedirectUri()
}))

import CozyClient from 'cozy-client'

import { registerSession } from './registerSession'
import { CUSTOM_SCHEME_REDIRECT, UNIVERSAL_LINK_REDIRECT } from './redirectUri'
import type { OAuthOptions } from './types'

const mockCozyClient = CozyClient as unknown as jest.Mock

const callback = { fqdn: 'mine.twake.test', code: 'OIDC-CODE' } as Parameters<
  typeof registerSession
>[0]

describe('registerSession', () => {
  beforeEach(() => {
    mockAuthorize.mockClear()
    mockStackClient.register.mockClear()
    mockCozyClient.mockClear()
    mockTryStoreAttestation.mockClear().mockResolvedValue(true)
    mockResolveRedirectUri.mockResolvedValue(UNIVERSAL_LINK_REDIRECT)
  })

  const registeredRedirect = (): unknown =>
    (mockCozyClient.mock.calls[0][0] as { oauth: OAuthOptions }).oauth.redirectURI

  it('registers the client with the redirect chosen for this sign-in', async () => {
    await registerSession(callback)
    expect(registeredRedirect()).toBe(UNIVERSAL_LINK_REDIRECT)
    mockCozyClient.mockClear()
    mockResolveRedirectUri.mockResolvedValue(CUSTOM_SCHEME_REDIRECT)
    await registerSession(callback)
    expect(registeredRedirect()).toBe(CUSTOM_SCHEME_REDIRECT)
  })

  it('registers anew when the stored client uses an App Link Android does not honour', async () => {
    mockResolveRedirectUri.mockResolvedValue(CUSTOM_SCHEME_REDIRECT)
    const stored = {
      clientID: 'old',
      clientSecret: 's',
      redirectURI: UNIVERSAL_LINK_REDIRECT
    } as OAuthOptions
    await registerSession(callback, stored)
    expect(mockStackClient.register).toHaveBeenCalled()
    expect(registeredRedirect()).toBe(CUSTOM_SCHEME_REDIRECT)
  })

  it('keeps a stored client when its redirect still works', async () => {
    const stored = {
      clientID: 'old',
      clientSecret: 's',
      redirectURI: UNIVERSAL_LINK_REDIRECT
    } as OAuthOptions
    await registerSession(callback, stored)
    expect(mockStackClient.register).not.toHaveBeenCalled()
  })

  it('asks the store to vouch for the app before the authorize page opens', async () => {
    await registerSession(callback)
    expect(mockTryStoreAttestation).toHaveBeenCalled()
    expect(mockTryStoreAttestation.mock.invocationCallOrder[0]).toBeLessThan(
      mockAuthorize.mock.invocationCallOrder[0]
    )
  })

  it('still signs in when the store refuses to vouch for the app', async () => {
    mockTryStoreAttestation.mockResolvedValue(false)
    await expect(registerSession(callback)).resolves.toMatchObject({
      uri: 'https://mine.twake.test'
    })
    expect(mockAuthorize).toHaveBeenCalled()
  })
})
