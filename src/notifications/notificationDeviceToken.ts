import { Platform } from 'react-native'
import flag from 'cozy-flags'
import type CozyClient from 'cozy-client'

/**
 * Turns push notifications on for an instance.
 *
 * Off unless the instance sets it: the stack pushes through one Firebase
 * project, and a token from any other gets this device's OAuth client deleted
 * on the first push, which signs the user out. The flag is the switch to flip
 * once the app's Firebase configuration is known to match the stack's, and the
 * one to flip back if it turns out not to.
 */
export const PUSH_NOTIFICATIONS_FLAG = 'drive.mobile.push-notifications.enabled'

export const isPushEnabled = (): boolean => Boolean(flag(PUSH_NOTIFICATIONS_FLAG))

interface OAuthOptions {
  clientKind?: string
  clientURI?: string
  logoURI?: string
  policyURI?: string
  softwareVersion?: string
  registrationAccessToken?: string
  [key: string]: unknown
}

interface OAuthStackClient {
  oauthOptions: OAuthOptions
  updateInformation: (information: Record<string, string>) => Promise<OAuthOptions>
}

// The stack rewrites the whole client from the request: what is not sent is
// blanked, except the flagship certification, which it carries over.
const KEPT_FIELDS = ['clientKind', 'clientURI', 'logoURI', 'policyURI', 'softwareVersion'] as const

const updateNotificationFields = async (
  client: CozyClient,
  notificationDeviceToken: string
): Promise<void> => {
  const stackClient = client.getStackClient() as unknown as OAuthStackClient
  const previous = stackClient.oauthOptions
  const information: Record<string, string> = {
    notificationPlatform: Platform.OS,
    notificationDeviceToken
  }
  for (const field of KEPT_FIELDS) {
    const value = previous[field]
    if (typeof value === 'string' && value) information[field] = value
  }
  // Never the client secret: the stack generates a new one when it receives
  // the current one, and the stored session would be left with a dead secret.
  await stackClient.updateInformation(information)
  // cozy-stack-client replaces its options with the stack's answer, which has
  // no registration token (the next update would be refused) and keys only
  // half camel-cased. Nothing else changed on the client: keep the options.
  stackClient.oauthOptions = {
    ...previous,
    notificationPlatform: Platform.OS,
    notificationDeviceToken
  }
}

export const saveNotificationDeviceToken = (client: CozyClient, token: string): Promise<void> =>
  updateNotificationFields(client, token)

export const removeNotificationDeviceToken = (client: CozyClient): Promise<void> =>
  updateNotificationFields(client, '')
