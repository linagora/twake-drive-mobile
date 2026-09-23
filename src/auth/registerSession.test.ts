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

import { registerSession } from './registerSession'

const callback = { fqdn: 'mine.twake.test', code: 'OIDC-CODE' } as Parameters<
  typeof registerSession
>[0]

describe('registerSession', () => {
  beforeEach(() => {
    mockAuthorize.mockClear()
    mockTryStoreAttestation.mockClear().mockResolvedValue(true)
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
