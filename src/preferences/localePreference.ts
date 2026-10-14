import { createMMKV } from 'react-native-mmkv'

export const LOCALE_SYSTEM = 'system'
const STORAGE_KEY = 'localePreference'

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

/** Resolve the i18n language from the stored preference and the locales
 *  actually present in the bundle. `system` (or an unavailable choice) takes
 *  the first of `candidates` (instance locale, then device locale) that the
 *  bundle has; anything unresolved falls back to English. */
export function resolveLanguage(
  pref: string,
  candidates: Array<string | undefined>,
  available: string[]
): string {
  if (pref !== LOCALE_SYSTEM && available.includes(pref)) return pref
  return candidates.find(c => c && available.includes(c)) ?? 'en'
}

export function getLocalePreference(): string {
  return storage?.getString(STORAGE_KEY) ?? LOCALE_SYSTEM
}

export function setLocalePreference(pref: string): void {
  storage?.set(STORAGE_KEY, pref)
}

// The local replica of the instance settings has no locale, so after a restart
// the app only knows it from the last time the stack answered.
const INSTANCE_LOCALE_KEY = 'instanceLocale'

export function getInstanceLocale(): string | undefined {
  return storage?.getString(INSTANCE_LOCALE_KEY)
}

export function setInstanceLocale(locale: string | undefined): void {
  if (locale) storage?.set(INSTANCE_LOCALE_KEY, locale)
  else storage?.remove(INSTANCE_LOCALE_KEY)
}
