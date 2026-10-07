import { NativeModules, Platform } from 'react-native'

import type { Session } from '@/auth/types'

import { ensureFileProviderDomain, removeFileProviderDomain } from './fileProviderDomain'

interface TwakeAuthBridgeNative {
  syncSession: (json: string) => Promise<boolean>
  clearSession: () => Promise<boolean>
  isAppLinkUsable: () => Promise<boolean>
}

const native: TwakeAuthBridgeNative | undefined = NativeModules.TwakeAuthBridge as
  | TwakeAuthBridgeNative
  | undefined

/**
 * Hands a stored session to the system file browser: on Android, the durable
 * OAuth creds go to the EncryptedSharedPreferences the DocumentsProvider reads;
 * on iOS, the File Provider domain is registered.
 */
export const mirrorSessionToNative = async (session: Session): Promise<void> => {
  if (Platform.OS === 'ios') return ensureFileProviderDomain()
  if (Platform.OS !== 'android' || !native) return
  const payload = JSON.stringify({
    uri: session.uri,
    clientId: session.oauthOptions.clientID,
    clientSecret: session.oauthOptions.clientSecret,
    refreshToken: session.token.refreshToken
  })
  try {
    await native.syncSession(payload)
  } catch (err) {
    console.warn('[twakeAuthBridge] syncSession failed', err)
  }
}

export const clearNativeSession = async (): Promise<void> => {
  if (Platform.OS === 'ios') return removeFileProviderDomain()
  if (Platform.OS !== 'android' || !native) return
  try {
    await native.clearSession()
  } catch (err) {
    console.warn('[twakeAuthBridge] clearSession failed', err)
  }
}

/**
 * Whether Android will open links.twake.app in this app, i.e. whether the App
 * Link is verified (or the user enabled it by hand). Resolves true wherever the
 * answer is unknown (no native module, API below 31, a failing call): the App
 * Link is then the historical behaviour.
 */
export const isAppLinkUsable = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !native?.isAppLinkUsable) return true
  try {
    return await native.isAppLinkUsable()
  } catch (err) {
    console.warn('[twakeAuthBridge] isAppLinkUsable failed', err)
    return true
  }
}
