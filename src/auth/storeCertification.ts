import Constants from 'expo-constants'
import CozyClient from 'cozy-client'

export interface CertificationConfig {
  cloudProjectNumber: string
  issuer: 'playintegrity'
}

export interface CertificationOAuthOptions {
  shouldRequireFlagshipPermissions?: true
  certificationConfig?: CertificationConfig
}

/**
 * The Google Cloud project number of the Play app, which Play Integrity needs
 * to mint a token. Not a secret, and absent until the Play project is wired.
 */
export const cloudProjectNumber = (): string | undefined => {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined
  const value = extra?.playIntegrityCloudProjectNumber
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * What cozy-client needs to attest the app against Play Integrity or App
 * Attest. Empty while the project number is missing, which leaves the client
 * on the email-code certification.
 */
export const certificationOAuthOptions = (): CertificationOAuthOptions => {
  const number = cloudProjectNumber()
  if (!number) return {}
  return {
    shouldRequireFlagshipPermissions: true,
    certificationConfig: { cloudProjectNumber: number, issuer: 'playintegrity' }
  }
}

/**
 * Asks the store to vouch for this installation, so the stack certifies the
 * client without mailing a code. Answers whether it went through: Play
 * Integrity and App Attest only speak for a build that came from a store, and
 * the stack's email code is what takes over for every other build.
 */
export const tryStoreAttestation = async (client: CozyClient): Promise<boolean> => {
  try {
    await client.certifyFlagship()
    return true
  } catch (err) {
    console.log('[storeCertification] store attestation failed', (err as Error)?.message)
    return false
  }
}
