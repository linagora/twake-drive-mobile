import { useSyncExternalStore } from 'react'
import { Appearance, AppState, Platform, useColorScheme } from 'react-native'
import { createMMKV } from 'react-native-mmkv'

export type ThemePref = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'themePreference'
const DEFAULT: ThemePref = 'system'

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

function parse(raw: string | undefined): ThemePref {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT
}

// Android draws the navigation bar from the night mode, not from the screens:
// the night mode follows the in-app choice so the bar matches the app.
function applyToSystemBars(pref: ThemePref): void {
  if (Platform.OS === 'android') Appearance.setColorScheme(pref === 'system' ? null : pref)
}

let current: ThemePref = parse(storage?.getString(STORAGE_KEY))
// On "system" the night mode expo-system-ui sets stands (AUTO_BATTERY below
// Android 9). Otherwise it is put back each time the activity is recreated,
// while this module (and so the choice) survives in the JS runtime.
if (current !== 'system') applyToSystemBars(current)
if (Platform.OS === 'android') {
  AppState.addEventListener('change', state => {
    if (state === 'active' && current !== 'system') applyToSystemBars(current)
  })
}
const listeners = new Set<() => void>()

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
function getSnapshot(): ThemePref {
  return current
}

export function setThemePreference(pref: ThemePref): void {
  if (pref === current) return
  current = pref
  storage?.set(STORAGE_KEY, pref)
  applyToSystemBars(pref)
  listeners.forEach(l => l())
}

export function useThemePreference(): { pref: ThemePref; setPref: (p: ThemePref) => void } {
  const pref = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { pref, setPref: setThemePreference }
}

export function useActiveColorScheme(): 'light' | 'dark' {
  const systemScheme = useColorScheme()
  const pref = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return (pref === 'system' ? systemScheme : pref) ?? 'light'
}
