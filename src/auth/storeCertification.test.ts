const mockExpoConfig: { extra?: Record<string, unknown> } = {}
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig
    }
  }
}))

import { certificationOAuthOptions, cloudProjectNumber } from './storeCertification'

describe('certificationOAuthOptions', () => {
  beforeEach(() => {
    mockExpoConfig.extra = undefined
  })

  it('asks for nothing while the Play project number is missing', () => {
    expect(certificationOAuthOptions()).toEqual({})
    expect(cloudProjectNumber()).toBeUndefined()
  })

  it('ignores an empty project number rather than attesting against it', () => {
    mockExpoConfig.extra = { playIntegrityCloudProjectNumber: '' }
    expect(certificationOAuthOptions()).toEqual({})
  })

  it('asks cozy-client to attest once the project number is there', () => {
    mockExpoConfig.extra = { playIntegrityCloudProjectNumber: '123456789012' }
    expect(certificationOAuthOptions()).toEqual({
      shouldRequireFlagshipPermissions: true,
      certificationConfig: { cloudProjectNumber: '123456789012', issuer: 'playintegrity' }
    })
  })
})
