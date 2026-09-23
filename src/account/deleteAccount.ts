import CozyClient from 'cozy-client'
import * as WebBrowser from 'expo-web-browser'

import { buildCozyAppUrl } from '@/files/cozyAppLink'

/** Address of the account deletion page of the settings web app. */
export const deleteAccountUrl = (stackUri: string, sessionCode?: string): string =>
  buildCozyAppUrl(stackUri, 'settings', '/profile/delete', sessionCode)

/**
 * Opens the account deletion page in the in-app browser, signed in when the
 * stack hands out a session code, and on the login page when it does not.
 */
export const openDeleteAccount = async (
  client: CozyClient,
  fetchSessionCode?: () => Promise<string>
): Promise<void> => {
  const stackUri = client.getStackClient().uri as string
  let sessionCode: string | undefined
  if (fetchSessionCode) {
    try {
      sessionCode = await fetchSessionCode()
    } catch {
      sessionCode = undefined
    }
  }
  await WebBrowser.openBrowserAsync(deleteAccountUrl(stackUri, sessionCode))
}
