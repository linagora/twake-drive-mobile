import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

const STORAGE_KEY = 'crashReportsEnabled'

/** Off until the user says otherwise: nothing about a failure leaves the device
 *  unless it was asked for. A fresh install never reports. */
const DEFAULT = false

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

const read = (): boolean => {
  const raw = storage?.getString(STORAGE_KEY)
  return raw === undefined ? DEFAULT : raw === 'on'
}

let current = read()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = (): boolean => current

/** Read synchronously at startup, before anything is initialised. */
export const areCrashReportsEnabled = (): boolean => current

export const setCrashReportsEnabled = (enabled: boolean): void => {
  if (enabled === current) return
  current = enabled
  storage?.set(STORAGE_KEY, enabled ? 'on' : 'off')
  listeners.forEach(listener => listener())
}

export const useCrashReportsEnabled = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

/** Called by the reporting side so a change takes effect without a restart. */
export const onCrashReportsPreferenceChange = (listener: () => void): (() => void) =>
  subscribe(listener)
