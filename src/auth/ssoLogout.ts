import { AppState } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

import { AFTER_LOGOUT_REDIRECT, isAfterLogoutRedirect } from './redirectUri'

/**
 * Ends the SSO session held by the browser the login ran in, so the next login
 * asks who is signing in. Mirrors cozy-flagship-app's asyncLogout.
 */
export const closeSsoSession = (signupUrl?: string): Promise<void> => {
  if (!signupUrl) return Promise.resolve()
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
    WebBrowser.openBrowserAsync(`${signupUrl}/logout?url=${AFTER_LOGOUT_REDIRECT}`).then(
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
