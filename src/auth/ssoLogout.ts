import { AppState } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

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

/**
 * The page that ends the SSO session of the account in `client`: the logout
 * page of the SSO the stack names for the instance, and the sign-up portal's
 * for an instance that has none. Read before the client logs out.
 */
export const ssoLogoutUrl = (client: CozyClient | null, signupUrl?: string): string | null => {
  const instance = readInstanceSettings(client)
  const oidcLogoutUrl = instance?.oidc_logout_url ?? instance?.attributes?.oidc_logout_url
  if (oidcLogoutUrl) return oidcLogoutUrl
  return signupUrl ? `${signupUrl}/logout?url=${AFTER_LOGOUT_REDIRECT}` : null
}

/**
 * Ends the SSO session held by the browser the login ran in, so the next login
 * asks who is signing in. Mirrors cozy-flagship-app's asyncLogout.
 */
export const closeSsoSession = (logoutUrl: string | null): Promise<void> => {
  if (!logoutUrl) return Promise.resolve()
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
      if (isAfterLogoutRedirect(url)) finish(true)
    })
    WebBrowser.openBrowserAsync(logoutUrl).then(
      result => {
        if (result?.type !== WebBrowser.WebBrowserResultType.OPENED) return finish(false)
        let wentAway = false
        appState = AppState.addEventListener('change', state => {
          if (state === 'background') wentAway = true
          else if (state === 'active' && wentAway) finish(false)
        })
      },
      () => finish(false)
    )
  })
}
