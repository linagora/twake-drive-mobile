import { createMMKV } from 'react-native-mmkv'

export const LOCALE_SYSTEM = 'system'
const STORAGE_KEY = 'localePreference'

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

/** Resolve the i18n language from the stored preference, the OS locale and the
 *  locales actually present in the bundle. `system` (or an unavailable choice)
 *  follows the device locale; anything unresolved falls back to English. */
export function resolveLanguage(
  pref: string,
  deviceLocale: string | undefined,
  available: string[]
): string {
  if (pref !== LOCALE_SYSTEM && available.includes(pref)) return pref
  if (deviceLocale && available.includes(deviceLocale)) return deviceLocale
  return 'en'
}

export function getLocalePreference(): string {
  const stored = storage?.getString(STORAGE_KEY)
  if (stored) return stored
  // The e2e build runs on an emulator the runner creates in English, and every
  // flow selects on the French labels. A preference is the only answer both the
  // cold launch and useSyncInstanceLocale honour, and only that build sets it.
  return process.env.EXPO_PUBLIC_E2E === '1' ? 'fr' : LOCALE_SYSTEM
}

export function setLocalePreference(pref: string): void {
  storage?.set(STORAGE_KEY, pref)
}
