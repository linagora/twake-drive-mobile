import { Platform } from 'react-native'

/** The custom scheme the stack has always redirected to. */
export const CUSTOM_SCHEME_REDIRECT = 'twakedrive://'

/** The domain that vouches for this app, served by the cozy apps registry. */
export const UNIVERSAL_LINK_HOST = 'links.twake.app'

/** The path that domain associates with this app, as its .well-known files say. */
export const UNIVERSAL_LINK_PATH = '/drive'

export const UNIVERSAL_LINK_REDIRECT = `https://${UNIVERSAL_LINK_HOST}${UNIVERSAL_LINK_PATH}`

/**
 * Where the stack sends the user back at the end of the OAuth dance.
 *
 * Android gates launching an app from a navigation on a user activation, which
 * a second factor consumes, so the redirect is cancelled and login never ends
 * (#179). A verified App Link is not subject to that gating, hence the https
 * address there. iOS has no such gate on the path it uses: the auth session
 * intercepts the custom scheme inside itself, and an https callback would
 * raise the floor to iOS 17.4.
 */
export const redirectUri = (): string =>
  Platform.OS === 'android' ? UNIVERSAL_LINK_REDIRECT : CUSTOM_SCHEME_REDIRECT

/** Whether a URL the OS handed us is the end of our own OAuth dance. */
export const isOurRedirect = (url: string): boolean => {
  if (!url) return false
  if (url.startsWith('twakedrive:')) return true
  return url.startsWith(`https://${UNIVERSAL_LINK_HOST}${UNIVERSAL_LINK_PATH}`)
}

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
