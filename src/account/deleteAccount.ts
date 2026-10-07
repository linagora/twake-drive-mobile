import CozyClient from 'cozy-client'

import { openSettingsApp, settingsAppUrl } from '@/account/commonSettings'

const DELETE_ACCOUNT_ROUTE = '/profile/delete'

/** Address of the account deletion page of the settings web app. */
export const deleteAccountUrl = (stackUri: string, sessionCode?: string): string =>
  settingsAppUrl(stackUri, DELETE_ACCOUNT_ROUTE, sessionCode)

/**
 * Opens the account deletion page in the in-app browser, signed in when the
 * stack hands out a session code, and on the login page when it does not.
 */
export const openDeleteAccount = async (
  client: CozyClient,
  fetchSessionCode?: () => Promise<string>
): Promise<void> => openSettingsApp(client, DELETE_ACCOUNT_ROUTE, fetchSessionCode)
