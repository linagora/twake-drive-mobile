import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useRouter } from 'expo-router'
import { useClient } from 'cozy-client'
import Minilog from 'cozy-minilog'
import {
  getInitialNotification,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh
} from '@react-native-firebase/messaging'
import type { RemoteMessage } from '@react-native-firebase/messaging'

import { useFlag } from '@/client/useFlag'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import {
  PUSH_NOTIFICATIONS_FLAG,
  removeNotificationDeviceToken,
  saveNotificationDeviceToken
} from './notificationDeviceToken'
import {
  askPermission,
  findMessaging,
  refreshPermission,
  setMessaging,
  usePushState
} from './pushPermission'

const log = Minilog('PushNotifications')

// Where the stack sends a push for a folder shared with us. It names the
// sharings page and not the folder: the shortcut id is not in the payload.
const SHARINGS_REDIRECT_LINK = 'drive/#/sharings'

/**
 * Registers this device for the stack's push notifications (a folder shared
 * with us), keeps its token up to date, and opens the shares when one is
 * tapped. Behind PUSH_NOTIFICATIONS_FLAG.
 *
 * The OS permission is asked at launch until the user has answered it, unless
 * notifications were turned off in the app's settings.
 *
 * Mount once in the drive layout: the client is a signed-in one there, and a
 * new client (another sign-in, a certification) registers again.
 */
export const usePushNotifications = (): void => {
  const client = useClient()
  const router = useRouter()
  const enabled = Boolean(useFlag(PUSH_NOTIFICATIONS_FLAG))
  const { messaging, permission, turnedOff } = usePushState()

  useEffect(() => {
    if (!client || !enabled) return
    const found = findMessaging()
    if (!found) return
    let stopped = false
    const open = (message: RemoteMessage | null): void => {
      if (message?.data?.redirectLink === SHARINGS_REDIRECT_LINK) router.navigate('/(drive)/shared')
    }
    const unsubscribe = onNotificationOpenedApp(found, open)
    getInitialNotification(found)
      .then(initial => {
        if (!stopped) open(initial)
      })
      .catch(err => log.warn('Could not read the launching notification', err))
    setMessaging(found)
    const refresh = (): void => {
      refreshPermission().catch(err => log.warn('Could not read the permission', err))
    }
    refresh()
    // Back from the OS settings, where the permission may have changed.
    const appState = AppState.addEventListener('change', next => {
      if (next === 'active') refresh()
    })
    return () => {
      stopped = true
      unsubscribe()
      appState.remove()
      setMessaging(null)
    }
  }, [client, enabled, router])

  useEffect(() => {
    if (permission !== 'undetermined' || turnedOff) return
    askPermission().catch(err => log.warn('Could not ask for the permission', err))
  }, [permission, turnedOff])

  useEffect(() => {
    if (!client || !messaging || permission === null) return
    if (turnedOff || permission === 'denied') {
      // A token left behind would keep the stack pushing to a device that
      // shows nothing, or to a user who turned it off.
      removeNotificationDeviceToken(client).catch(err =>
        log.warn('Could not clear the push token', err)
      )
      return
    }
    if (permission !== 'granted') return
    const saveToken = (token: string): void => {
      saveNotificationDeviceToken(client, token).catch(err =>
        log.warn('Could not register the push token', err)
      )
    }
    const unsubscribes = [
      // Also how a token that could not be had below arrives later.
      onTokenRefresh(messaging, saveToken),
      // In the foreground the OS shows nothing: sync, so that the share shows
      // up and the shares tab gets its badge.
      onMessage(messaging, () => triggerPouchReplication(client))
    ]
    // Offline, or before iOS has handed its APNs token over, there is no token
    // yet: the refresh above brings it, or the next launch.
    getToken(messaging)
      .then(saveToken)
      .catch(err => log.warn('Could not get the push token', err))
    return () => unsubscribes.forEach(unsubscribe => unsubscribe())
  }, [client, messaging, permission, turnedOff])
}
