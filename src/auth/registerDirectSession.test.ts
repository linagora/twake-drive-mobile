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

const calls: string[] = []
const mockRegister = jest.fn(() => {
  calls.push('register')
  return Promise.resolve()
})
const mockAuthorize = jest.fn(() => {
  calls.push('authorize')
  return Promise.resolve({
    token: { accessToken: 'AT', refreshToken: 'RT', tokenType: 'bearer', scope: '*' }
  })
})

const mockStackClient = {
  setUri: jest.fn(),
  setOAuthOptions: jest.fn(),
  register: mockRegister,
  oauthOptions: { clientID: 'new-client-id', clientSecret: 'secret' }
}

let constructorArgs: Record<string, unknown> = {}
jest.mock('cozy-client', () => {
  const MockCozyClient = jest.fn().mockImplementation((args: Record<string, unknown>) => {
    constructorArgs = args
    return {
      getStackClient: () => mockStackClient,
      certifyFlagship: jest.fn(),
      authorize: mockAuthorize
    }
  })
  return { __esModule: true, default: MockCozyClient }
})

import { registerDirectSession } from './registerDirectSession'

describe('registerDirectSession', () => {
  beforeEach(() => {
    calls.length = 0
    mockRegister.mockClear()
    mockAuthorize.mockClear()
    mockTryStoreAttestation.mockClear().mockResolvedValue(true)
  })

  it('carries what cozy-client needs to attest against the store', async () => {
    await registerDirectSession('https://mine.twake.test')
    const oauth = constructorArgs.oauth as Record<string, unknown>
    expect(oauth.shouldRequireFlagshipPermissions).toBe(true)
    expect(oauth.certificationConfig).toEqual({
      cloudProjectNumber: '123456789012',
      issuer: 'playintegrity'
    })
  })

  it('asks the store to vouch for the app before the authorize page opens', async () => {
    await registerDirectSession('https://mine.twake.test')
    expect(mockTryStoreAttestation).toHaveBeenCalled()
    expect(calls).toEqual(['register', 'authorize'])
    const attestedAt = mockTryStoreAttestation.mock.invocationCallOrder[0]
    expect(attestedAt).toBeLessThan(mockAuthorize.mock.invocationCallOrder[0])
  })

  it('still opens the authorize page when the store refuses', async () => {
    mockTryStoreAttestation.mockResolvedValue(false)
    await expect(registerDirectSession('https://mine.twake.test')).resolves.toMatchObject({
      uri: 'https://mine.twake.test'
    })
    expect(mockAuthorize).toHaveBeenCalled()
  })
})
