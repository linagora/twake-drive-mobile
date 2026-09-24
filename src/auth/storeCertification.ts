import Constants from 'expo-constants'
import CozyClient from 'cozy-client'
import { createMMKV } from 'react-native-mmkv'
import { NativeModules, Platform } from 'react-native'

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

const OUTCOME_KEY = 'lastStoreAttestation'

const BRIDGE_NAME = Platform.OS === 'ios' ? 'RNIOS11DeviceCheck' : 'RNGooglePlayIntegrity'

/**
 * What the app can see of the module it attests through: the native bridge
 * cozy-client reaches for, and the methods it exposes. An attestation that
 * fails on "undefined is not a function" fails here, before Apple or Google
 * are ever asked anything.
 */
export const describeAttestationModule = (): string => {
  const bridge = (NativeModules as Record<string, unknown>)[BRIDGE_NAME]
  if (!bridge || typeof bridge !== 'object') return `${BRIDGE_NAME} bridge=absent`
  const methods = Object.keys(bridge as Record<string, unknown>)
    .map(k => `${k}:${typeof (bridge as Record<string, unknown>)[k]}`)
    .join(' ')
  return `${BRIDGE_NAME} bridge=present ${methods}`
}

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

let lastOutcome: string | null = null

/**
 * What the last attestation attempt left behind: the reason it failed, or null
 * when the store vouched for the app. Read on the instance-address screen,
 * which is the only place a store build can show it.
 */
export const readLastAttestationOutcome = (): string | null => {
  if (lastOutcome !== null) return lastOutcome
  return storage?.getString(OUTCOME_KEY) ?? null
}

const recordOutcome = (reason: string | null): void => {
  lastOutcome = reason
  try {
    if (reason === null) storage?.remove(OUTCOME_KEY)
    else storage?.set(OUTCOME_KEY, `${new Date().toISOString()} ${reason}`)
  } catch {
    // a diagnostic is not worth failing a sign-in over
  }
}

/**
 * Asks the store to vouch for this installation, so the stack certifies the
 * client without mailing a code. Answers whether it went through: Play
 * Integrity and App Attest only speak for a build that came from a store, and
 * the stack's email code is what takes over for every other build.
 *
 * cozy-client catches an attestation failure itself and only warns about it,
 * so what it warned about is what says whether anything was attested.
 */
export const tryStoreAttestation = async (client: CozyClient): Promise<boolean> => {
  const warnings: string[] = []
  let threw = false
  const warn = console.warn
  console.warn = (...args: unknown[]): void => {
    warnings.push(args.map(a => String(a)).join(' '))
    warn(...args)
  }
  try {
    await client.certifyFlagship()
  } catch (err) {
    threw = true
    warnings.push((err as Error)?.message ?? String(err))
  } finally {
    console.warn = warn
  }
  const failed = threw || warnings.some(w => /FLAGSHIP_CERTIFICATION|attest|certif/i.test(w))
  recordOutcome(failed ? `${describeAttestationModule()} | ${warnings.join(' | ')}` : null)
  if (failed) console.log('[storeCertification] store attestation failed', warnings.join(' | '))
  return !failed
}
