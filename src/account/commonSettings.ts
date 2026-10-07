import CozyClient, { Q, useClient, useQuery } from 'cozy-client'
import * as WebBrowser from 'expo-web-browser'
import { useCallback } from 'react'

import { useSessionCode } from '@/auth/useSessionCode'
import { buildCozyAppUrl } from '@/files/cozyAppLink'

const SETTINGS_SLUG = 'settings'
const APPS_MAX_AGE_MS = 5 * 60 * 1000

/** The settings page where the preferences shared by every app of the account
 *  (language, theme…) are set. */
const COMMON_SETTINGS_ROUTE = '/profile'

const appsQuery = Q('io.cozy.apps')

/** Whether the instance has the settings app installed. Same test as the
 *  cozy-bar, which shows its "manage profile" entry on it. */
export const hasSettingsApp = (apps: unknown): boolean =>
  Array.isArray(apps) && apps.some(app => (app as { slug?: string } | null)?.slug === SETTINGS_SLUG)

/** Whether the instance offers the common settings. False until the apps are
 *  known, and when they cannot be fetched (offline). */
export const useHasCommonSettings = (): boolean => {
  const { data } = useQuery(appsQuery, {
    as: 'io.cozy.apps',
    fetchPolicy: CozyClient.fetchPolicies.olderThan(APPS_MAX_AGE_MS)
  })
  return hasSettingsApp(data)
}

/** Address of a page of the settings web app. */
export const settingsAppUrl = (stackUri: string, route: string, sessionCode?: string): string =>
  buildCozyAppUrl(stackUri, SETTINGS_SLUG, route, sessionCode)

/**
 * Opens a page of the settings web app in the in-app browser, signed in when
 * the stack hands out a session code, and on the login page when it does not.
 */
export const openSettingsApp = async (
  client: CozyClient,
  route: string,
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
  await WebBrowser.openBrowserAsync(settingsAppUrl(stackUri, route, sessionCode))
}

/** Opens the common settings page of the settings web app. */
export const useOpenCommonSettings = (): (() => Promise<void>) => {
  const client = useClient()
  const fetchSessionCode = useSessionCode()
  return useCallback(async () => {
    if (!client) throw new Error('No cozy client')
    await openSettingsApp(client, COMMON_SETTINGS_ROUTE, fetchSessionCode)
  }, [client, fetchSessionCode])
}
