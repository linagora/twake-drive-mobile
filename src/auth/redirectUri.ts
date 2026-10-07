import { Platform } from 'react-native'

import { isAppLinkUsable } from '@/native/twakeAuthBridge'

/** The custom scheme the stack has always redirected to. */
export const CUSTOM_SCHEME_REDIRECT = 'twakedrive://'

/** The domain that vouches for this app, served by the cozy apps registry. */
export const UNIVERSAL_LINK_HOST = 'links.twake.app'

/** The path that domain associates with this app, as its .well-known files say. */
export const UNIVERSAL_LINK_PATH = '/drive'

export const UNIVERSAL_LINK_REDIRECT = `https://${UNIVERSAL_LINK_HOST}${UNIVERSAL_LINK_PATH}`

let androidRedirect: Promise<string> | null = null

/** Forgets the choice made for the previous sign-in, to ask the OS again. */
export const resetRedirectUri = (): void => {
  androidRedirect = null
}

const chooseAndroidRedirect = async (): Promise<string> => {
  if (await isAppLinkUsable()) return UNIVERSAL_LINK_REDIRECT
  console.warn(
    `[auth] ${UNIVERSAL_LINK_HOST} is not verified for this app, falling back to ${CUSTOM_SCHEME_REDIRECT} (a second factor may cancel the redirect, #179)`
  )
  return CUSTOM_SCHEME_REDIRECT
}

/**
 * Where the stack sends the user back at the end of the OAuth dance.
 *
 * Android gates launching an app from a navigation on a user activation, which
 * a second factor consumes, so the redirect is cancelled and login never ends
 * (#179). A verified App Link is not subject to that gating, hence the https
 * address there. But an App Link the OS did not verify (a signing key missing
 * from assetlinks.json, a failed verification) opens the web page, which is a
 * 404: the custom scheme then wins, at the price of #179. iOS has no such gate
 * on the path it uses: the auth session intercepts the custom scheme inside
 * itself, and an https callback would raise the floor to iOS 17.4.
 *
 * Asked once per sign-in so the registration, the authorize request and the
 * auth session all see the same answer; `resetRedirectUri` starts a new one.
 */
export const resolveRedirectUri = (): Promise<string> => {
  if (Platform.OS !== 'android') return Promise.resolve(CUSTOM_SCHEME_REDIRECT)
  androidRedirect ??= chooseAndroidRedirect()
  return androidRedirect
}

/** Whether a URL the OS handed us is the end of our own OAuth dance. */
export const isOurRedirect = (url: string): boolean => {
  if (!url) return false
  if (url.startsWith('twakedrive:')) return true
  return url.startsWith(`https://${UNIVERSAL_LINK_HOST}${UNIVERSAL_LINK_PATH}`)
}

/** Where the sign-up portal sends the browser once it has closed the SSO session. */
export const AFTER_LOGOUT_REDIRECT = `${CUSTOM_SCHEME_REDIRECT}afterlogout`

export const isAfterLogoutRedirect = (url: string): boolean =>
  !!url && url.toLowerCase().startsWith(AFTER_LOGOUT_REDIRECT)

/**
 * Repairs the shapes the stack and the browsers hand back: a custom scheme
 * with no slashes, and a trailing hash some browsers append.
 */
export const normalizeRedirectUrl = (raw: string): string => {
  let url = raw
  if (url.startsWith('twakedrive:?')) url = url.replace('twakedrive:?', 'twakedrive://?')
  url = url.replace(/%23$/i, '').replace(/#$/, '')
  return url
}
