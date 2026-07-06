import * as WebBrowser from 'expo-web-browser'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'

import { UserCancelledError } from './types'

export const REDIRECT_URL = 'cozy://'

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

export const normalizeRedirectUrl = (raw: string): string => {
  let url = raw
  if (url.startsWith('cozy:?')) url = url.replace('cozy:?', 'cozy://?')
  url = url.replace(/%23$/i, '').replace(/#$/, '')
  return url
}

export const openAuthorizeUrl = async (url: string): Promise<string> => {
  console.log('[auth] opening authorize URL', url)
  // The flagship certification page emails a 6-digit code, so the user MUST leave
  // to their mail app and come back to type it. `openAuthSessionAsync` resolves
  // `{type:'dismiss'}` the instant the app is refocused, which aborts the flow and
  // bounces the user back to the start — an inescapable loop on a mobile-only
  // device. A plain Custom Tab (`openBrowserAsync`) survives that excursion: it
  // stays open while the user reads the code. The cert finishes by redirecting to
  // `cozy://`, which reopens the app and fires a Linking `url` event — that deep
  // link is the reliable completion signal (openBrowserAsync never returns the
  // redirect URL itself). `showInRecents` keeps the tab in the app switcher so the
  // user can return to it after checking their mail.
  return await new Promise<string>((resolve, reject) => {
    let settled = false
    let linkSub: ReturnType<typeof Linking.addEventListener> | undefined

    const done = (finish: () => void): void => {
      if (settled) return
      settled = true
      linkSub?.remove()
      // Best-effort close of the Custom Tab. dismissBrowser() resolves a Promise
      // on iOS but returns void on Android, so `.catch` on the result throws
      // "Cannot read property 'catch' of undefined" there — which previously ate
      // the resolve() below and hung the login. Wrap it so it can never throw.
      try {
        void Promise.resolve(WebBrowser.dismissBrowser()).catch(() => undefined)
      } catch {
        // ignore — dismissing the browser is optional
      }
      finish()
    }

    linkSub = Linking.addEventListener('url', ({ url: incoming }) => {
      if (incoming && incoming.startsWith('cozy:')) {
        console.log('[auth] captured cozy:// redirect via deep link')
        done(() => resolve(normalizeRedirectUrl(incoming)))
      }
    })

    WebBrowser.openBrowserAsync(url, { showInRecents: true }).then(
      () => {
        // The Custom Tab was closed. If a cozy:// redirect already arrived this is
        // a no-op; otherwise a close + redirect can race, so give the deep link a
        // brief grace period before treating a genuine close as a user cancel.
        setTimeout(() => done(() => reject(new UserCancelledError())), 500)
      },
      (err: unknown) => done(() => reject(err as Error))
    )
  })
}
