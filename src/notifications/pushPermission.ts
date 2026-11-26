import { useSyncExternalStore } from 'react'
import { Linking, PermissionsAndroid, Platform } from 'react-native'
import { createMMKV } from 'react-native-mmkv'
import Minilog from 'cozy-minilog'
import {
  AuthorizationStatus,
  getMessaging,
  hasPermission,
  requestPermission
} from '@react-native-firebase/messaging'
import type { Messaging } from '@react-native-firebase/messaging'

import { useFlag } from '@/client/useFlag'
import { PUSH_NOTIFICATIONS_FLAG } from './notificationDeviceToken'

const log = Minilog('PushNotifications')

const ANDROID_RUNTIME_PERMISSION_API = 33

/** 'off' once the user turned notifications off in the app's settings. */
const CHOICE_KEY = 'pushNotifications'
/** Android cannot tell "never asked" from "refused": remember the refusal. */
const REFUSED_KEY = 'pushPermissionRefused'

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

/** What the OS says. 'denied' means it will not ask again: only its settings can. */
export type Permission = 'granted' | 'denied' | 'undetermined'

interface PushState {
  /** Null while unknown, and in a build without a Firebase configuration. */
  messaging: Messaging | null
  permission: Permission | null
  turnedOff: boolean
}

const readTurnedOff = (): boolean => storage?.getString(CHOICE_KEY) === 'off'

let state: PushState = { messaging: null, permission: null, turnedOff: false }
const listeners = new Set<() => void>()

const update = (next: Partial<PushState>): void => {
  state = { ...state, ...next }
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = (): PushState => state

export const usePushState = (): PushState =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

const isAndroidWithoutRuntimePermission = (): boolean =>
  Platform.OS === 'android' && Number(Platform.Version) < ANDROID_RUNTIME_PERMISSION_API

const isAllowed = (status: number): boolean =>
  status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL

const readPermission = async (messaging: Messaging): Promise<Permission> => {
  // On Android, whether notifications are on for the app, on every version.
  const status = await hasPermission(messaging)
  if (isAllowed(status)) return 'granted'
  if (Platform.OS === 'android') {
    // Below 13 there is no prompt: only the OS settings turn them back on.
    if (isAndroidWithoutRuntimePermission()) return 'denied'
    return storage?.getString(REFUSED_KEY) ? 'denied' : 'undetermined'
  }
  return status === AuthorizationStatus.NOT_DETERMINED ? 'undetermined' : 'denied'
}

/**
 * Null when the app was built without a Firebase configuration: there is no
 * token to get, and the app runs without push.
 */
export const findMessaging = (): Messaging | null => {
  try {
    return getMessaging()
  } catch (err) {
    log.warn('Firebase is not configured, push notifications are off', err)
    return null
  }
}

export const setMessaging = (messaging: Messaging | null): void => {
  update({ messaging, permission: null, turnedOff: readTurnedOff() })
}

export const refreshPermission = async (): Promise<void> => {
  const { messaging } = state
  if (!messaging) return
  const permission = await readPermission(messaging)
  if (state.messaging === messaging) update({ permission })
}

let asking = false

/** Shows the OS prompt. Only for 'undetermined': the OS ignores it otherwise. */
export const askPermission = async (): Promise<void> => {
  const { messaging } = state
  if (!messaging || asking) return
  asking = true
  try {
    if (Platform.OS === 'android' && !isAndroidWithoutRuntimePermission()) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      )
      if (result !== PermissionsAndroid.RESULTS.GRANTED) storage?.set(REFUSED_KEY, '1')
    } else if (Platform.OS !== 'android') {
      await requestPermission(messaging)
    }
  } finally {
    asking = false
  }
  await refreshPermission()
}

const setTurnedOff = (turnedOff: boolean): void => {
  storage?.set(CHOICE_KEY, turnedOff ? 'off' : 'on')
  update({ turnedOff })
}

export interface PushNotificationsSetting {
  /** False when the row has nothing to switch: flag off, or no Firebase. */
  available: boolean
  on: boolean
  setOn: (on: boolean) => void
}

/** The settings row: the OS permission and the in-app choice, together. */
export const usePushNotificationsSetting = (): PushNotificationsSetting => {
  const enabled = Boolean(useFlag(PUSH_NOTIFICATIONS_FLAG))
  const { messaging, permission, turnedOff } = usePushState()
  const setOn = (on: boolean): void => {
    setTurnedOff(!on)
    if (!on) return
    if (state.permission === 'undetermined') {
      askPermission().catch(err => log.warn('Could not ask for the permission', err))
    } else if (state.permission === 'denied') {
      // The OS does not ask twice. Back in the app, the permission is read again.
      Linking.openSettings().catch(err => log.warn('Could not open the settings', err))
    }
  }
  return {
    available: enabled && messaging !== null && permission !== null,
    on: !turnedOff && permission === 'granted',
    setOn
  }
}
