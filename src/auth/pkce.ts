import { Platform } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'

import { UserCancelledError } from './types'
import { isOurRedirect, normalizeRedirectUrl as normalize, redirectUri } from './redirectUri'

export { normalizeRedirectUrl } from './redirectUri'

/** Kept as a named export: the callers ask for "the redirect" of this build. */
export const REDIRECT_URL = redirectUri()

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export const generatePkce = async (): Promise<{ codeVerifier: string; codeChallenge: string }> => {
  const verifierBytes = Crypto.getRandomBytes(32)
  const codeVerifier = base64UrlEncode(verifierBytes)
  const challengeB64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  )
  const codeChallenge = challengeB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return { codeVerifier, codeChallenge }
}

const CANCEL_GRACE_MS = 400
const REDIRECT_RACE_GRACE_MS = 4000

let abortActiveBrowserFlow: (() => void) | null = null

// Open `url` in the system browser (an external Custom Tab — an RFC 8252
// user-agent with no access to the page's cookies or credentials) and resolve
// with the twakedrive:// redirect captured as an OS deep link.
//
// We deliberately do NOT use WebBrowser.openAuthSessionAsync here: the auth
// session cancels as soon as the app is backgrounded, and the flagship
// email-code certification requires exactly that — the user must leave the tab
// to read the 6-digit code from their mail and come back. On OIDC/LemonLDAP that
// backgrounding aborted the authorize flow and bounced the user back to the
// welcome screen. A plain Custom Tab stays open across the excursion, and the
// deep-link listener catches the final twakedrive:// redirect at the OS level.
const openViaSystemBrowser = (url: string): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    // A new attempt tears down any flow still in flight first, so its lingering
    // deep-link listener, grace timer, or dismissBrowser() can't fire against
    // this attempt's browser — closing it and hanging the retry.
    abortActiveBrowserFlow?.()

    let settled = false
    let sub: ReturnType<typeof Linking.addEventListener> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: () => void
    const finish = (run: () => void): void => {
      if (settled) return
      settled = true
      if (abortActiveBrowserFlow === abort) abortActiveBrowserFlow = null
      sub?.remove()
      if (timer) clearTimeout(timer)
      try {
        void Promise.resolve(WebBrowser.dismissBrowser()).catch(() => undefined)
      } catch {
        // dismissing the tab is best-effort
      }
      run()
    }
    abort = (): void => finish(() => reject(new UserCancelledError()))
    abortActiveBrowserFlow = abort

    sub = Linking.addEventListener('url', ({ url: incoming }) => {
      if (isOurRedirect(incoming)) {
        console.log('[auth] captured the redirect via deep link')
        finish(() => resolve(normalize(incoming)))
      }
    })
    WebBrowser.openBrowserAsync(url, { showInRecents: true }).then(
      result => {
        if (settled) return
        const userClosed = result?.type === WebBrowser.WebBrowserResultType.CANCEL
        const grace = userClosed ? CANCEL_GRACE_MS : REDIRECT_RACE_GRACE_MS
        timer = setTimeout(() => finish(() => reject(new UserCancelledError())), grace)
      },
      (err: unknown) => finish(() => reject(err as Error))
    )
  })

export const openAuthorizeUrl = async (url: string): Promise<string> => {
  console.log('[auth] opening authorize URL', url.split('?')[0])
  // Android delivers the custom-scheme intent to the app, so the Custom Tab and
  // its deep-link listener catch the instant redirect AND survive the excursion
  // to the mail app that the email-code certification requires. One consent
  // screen, whether the client is certified or not.
  if (Platform.OS === 'android') return openViaSystemBrowser(url)
  // iOS: the stack's /auth/authorize step usually redirects to twakedrive://
  // instantly with no UI, and only openAuthSessionAsync captures that redirect
  // out of SFSafariViewController — the deep-link path misses it. This does not
  // affect the Docs cookie jar: the Lemon SSO cookie is set during login
  // (openLoginUrl / SFSafariViewController), not here.
  const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URL, { showInRecents: false })
  if (result.type === 'success' && result.url) {
    return normalize(result.url)
  }
  // An uncertified client shows the email-code form instead of redirecting; the
  // user leaves to read the code, which aborts openAuthSessionAsync on refocus.
  // Retry in the system browser, which survives the mail excursion, at the cost
  // of a second consent screen. Kept on iOS on purpose: a certified client
  // redirects without ever showing one, so this path stays exceptional.
  console.log('[auth] auth session returned', result.type, '— falling back to system browser')
  return openViaSystemBrowser(url)
}

export const openLoginUrl = async (url: string): Promise<string> => {
  console.log('[auth] opening login URL', url.split('?')[0])
  return openViaSystemBrowser(url)
}
