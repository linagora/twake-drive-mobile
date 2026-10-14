import { useEffect } from 'react'
import { PermissionsAndroid, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { useClient } from 'cozy-client'
import Minilog from 'cozy-minilog'
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission
} from '@react-native-firebase/messaging'
import type { Messaging, RemoteMessage } from '@react-native-firebase/messaging'

import { useFlag } from '@/client/useFlag'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import {
  PUSH_NOTIFICATIONS_FLAG,
  removeNotificationDeviceToken,
  saveNotificationDeviceToken
} from './notificationDeviceToken'

const log = Minilog('PushNotifications')

// Where the stack sends a push for a folder shared with us. It names the
// sharings page and not the folder: the shortcut id is not in the payload.
const SHARINGS_REDIRECT_LINK = 'drive/#/sharings'

const ANDROID_RUNTIME_PERMISSION_API = 33

const askNotificationPermission = async (messaging: Messaging): Promise<boolean> => {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < ANDROID_RUNTIME_PERMISSION_API) return true
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    )
    return result === PermissionsAndroid.RESULTS.GRANTED
  }
  const status = await requestPermission(messaging)
  return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL
}

/**
 * Null when the app was built without a Firebase configuration: there is no
 * token to get, and the app runs without push.
 */
const findMessaging = (): Messaging | null => {
  try {
    return getMessaging()
  } catch (err) {
    log.warn('Firebase is not configured, push notifications are off', err)
    return null
  }
}

/**
 * Registers this device for the stack's push notifications (a folder shared
 * with us), keeps its token up to date, and opens the shares when one is
 * tapped. Behind PUSH_NOTIFICATIONS_FLAG.
 *
 * Mount once in the drive layout: the client is a signed-in one there, and a
 * new client (another sign-in, a certification) registers again.
 */
export const usePushNotifications = (): void => {
  const client = useClient()
  const router = useRouter()
  const enabled = Boolean(useFlag(PUSH_NOTIFICATIONS_FLAG))

  useEffect(() => {
    if (!client || !enabled) return
    const messaging = findMessaging()
    if (!messaging) return
    let stopped = false
    const unsubscribes: (() => void)[] = []

    const open = (message: RemoteMessage | null): void => {
      if (message?.data?.redirectLink === SHARINGS_REDIRECT_LINK) router.navigate('/(drive)/shared')
    }

    const saveToken = (token: string): void => {
      saveNotificationDeviceToken(client, token).catch(err =>
        log.warn('Could not register the push token', err)
      )
    }

    const start = async (): Promise<void> => {
      unsubscribes.push(onNotificationOpenedApp(messaging, open))
      const initial = await getInitialNotification(messaging)
      if (stopped) return
      open(initial)

      if (!(await askNotificationPermission(messaging))) {
        // A token registered before the permission was taken back would keep
        // the stack pushing to a device that shows nothing.
        await removeNotificationDeviceToken(client)
        return
      }
      if (stopped) return
      unsubscribes.push(
        // Also how a token that could not be had below arrives later.
        onTokenRefresh(messaging, saveToken),
        // In the foreground the OS shows nothing: sync, so that the share
        // shows up and the shares tab gets its badge.
        onMessage(messaging, () => triggerPouchReplication(client))
      )
      // Offline, or before iOS has handed its APNs token over, there is no
      // token yet: the refresh above brings it, or the next launch.
      saveToken(await getToken(messaging))
    }

    start().catch(err => log.warn('Could not set push notifications up', err))
    return () => {
      stopped = true
      unsubscribes.forEach(unsubscribe => unsubscribe())
    }
  }, [client, enabled, router])
}
