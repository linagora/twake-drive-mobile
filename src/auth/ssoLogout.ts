import { AppState } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as Crypto from 'expo-crypto'

import CozyClient from 'cozy-client'

import { AFTER_LOGOUT_REDIRECT, isAfterLogoutRedirect } from './redirectUri'

interface InstanceSettings {
  oidc_logout_url?: string
  attributes?: { oidc_logout_url?: string }
}

const readInstanceSettings = (client: CozyClient | null): InstanceSettings | null => {
  try {
    const data = client?.getQueryFromState('io.cozy.settings/instance')?.data as unknown
    return ((Array.isArray(data) ? data[0] : data) as InstanceSettings | undefined) ?? null
  } catch {
    return null
  }
}

const DISCOVERY_TIMEOUT_MS = 3000

/**
 * The `end_session_endpoint` the provider behind `logoutUrl` advertises, read
 * from the discovery document of the same origin. The stack's `logout_url` is
 * free text an admin typed, so it may be a portal page rather than the endpoint
 * that honours `post_logout_redirect_uri`. Falls back to `logoutUrl`.
 */
const findEndSessionEndpoint = async (logoutUrl: string): Promise<string> => {
  const origin = /^https?:\/\/[^/?#]+/i.exec(logoutUrl)?.[0]
  if (!origin) return logoutUrl
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)
  try {
    const res = await fetch(`${origin}/.well-known/openid-configuration`, {
      signal: controller.signal
    })
    const { end_session_endpoint: endpoint } = (await res.json()) as {
      end_session_endpoint?: unknown
    }
    return typeof endpoint === 'string' && endpoint.startsWith(`${origin}/`) ? endpoint : logoutUrl
  } catch {
    return logoutUrl
  } finally {
    clearTimeout(timer)
  }
}

/**
 * OpenID Connect RP-Initiated Logout: the provider sends the browser to
 * `post_logout_redirect_uri` (only if registered on a client) with our `state`
 * appended. `confirm=1` skips LemonLDAP's confirmation page, other providers
 * ignore it. Not `url`: it is LemonLDAP's portal parameter and refuses anything
 * but http(s) ("Bad URL").
 */
const withReturnAddress = (endpoint: string): SsoLogout => {
  const state = Crypto.randomUUID()
  const params = [
    `post_logout_redirect_uri=${encodeURIComponent(AFTER_LOGOUT_REDIRECT)}`,
    `state=${state}`,
    'confirm=1'
  ].join('&')
  return { url: `${endpoint}${endpoint.includes('?') ? '&' : '?'}${params}`, state }
}

/** The page to open, and the `state` the browser must bring back (RP-initiated logout only). */
export interface SsoLogout {
  url: string
  state?: string
}

/**
 * The page that ends the SSO session of the account in `client`: the
 * end-session endpoint of the SSO the stack names for the instance, and the
 * sign-up portal's logout page for an instance that has none. Read before the
 * client logs out.
 */
export const ssoLogoutUrl = async (
  client: CozyClient | null,
  signupUrl?: string
): Promise<SsoLogout | null> => {
  const instance = readInstanceSettings(client)
  const oidcLogoutUrl = instance?.oidc_logout_url ?? instance?.attributes?.oidc_logout_url
  if (oidcLogoutUrl) return withReturnAddress(await findEndSessionEndpoint(oidcLogoutUrl))
  return signupUrl ? { url: `${signupUrl}/logout?url=${AFTER_LOGOUT_REDIRECT}` } : null
}

const stateOf = (url: string): string | undefined => /[?&]state=([^&#]*)/.exec(url)?.[1]

/**
 * Ends the SSO session held by the browser the login ran in, so the next login
 * asks who is signing in. Mirrors cozy-flagship-app's asyncLogout.
 */
export const closeSsoSession = (logout: SsoLogout | null): Promise<void> => {
  if (!logout) return Promise.resolve()
  const { url: logoutUrl, state: expectedState } = logout
  return new Promise<void>(resolve => {
    let settled = false
    let appState: ReturnType<typeof AppState.addEventListener> | undefined
    const finish = (dismiss: boolean): void => {
      if (settled) return
      settled = true
      sub.remove()
      appState?.remove()
      if (dismiss) {
        try {
          void Promise.resolve(WebBrowser.dismissBrowser()).catch(() => undefined)
        } catch {
          // dismissing the tab is best-effort
        }
      }
      resolve()
    }
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (isAfterLogoutRedirect(url) && (!expectedState || stateOf(url) === expectedState)) {
        finish(true)
      }
    })
    WebBrowser.openBrowserAsync(logoutUrl).then(
      result => {
        if (result?.type !== WebBrowser.WebBrowserResultType.OPENED) return finish(false)
        let wentAway = AppState.currentState === 'background'
        appState = AppState.addEventListener('change', state => {
          if (state === 'background') wentAway = true
          else if (state === 'active' && wentAway) finish(false)
        })
      },
      () => finish(false)
    )
  })
}
