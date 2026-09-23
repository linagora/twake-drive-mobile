const mockExpoConfig: { extra?: Record<string, unknown> } = {}
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig
    }
  }
}))

import CozyClient from 'cozy-client'

import {
  certificationOAuthOptions,
  cloudProjectNumber,
  tryStoreAttestation
} from './storeCertification'

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

describe('tryStoreAttestation', () => {
  const clientWith = (certifyFlagship: () => Promise<void>): CozyClient =>
    ({ certifyFlagship }) as unknown as CozyClient

  it('answers true once the store vouched for the app', async () => {
    const certifyFlagship = jest.fn().mockResolvedValue(undefined)
    await expect(tryStoreAttestation(clientWith(certifyFlagship))).resolves.toBe(true)
    expect(certifyFlagship).toHaveBeenCalled()
  })

  it('answers false when the store refuses, leaving the email code to take over', async () => {
    const certifyFlagship = jest.fn().mockRejectedValue(new Error('no Play Integrity here'))
    await expect(tryStoreAttestation(clientWith(certifyFlagship))).resolves.toBe(false)
  })
})
