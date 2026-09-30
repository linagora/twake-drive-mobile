// On-device/Hermes insurance: guarantees Intl.PluralRules (esp. ru). Not covered by index.test (Node ships full ICU).
import 'intl-pluralrules'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import { getLocalePreference, resolveLanguage } from '@/preferences/localePreference'

import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import it from './locales/it.json'
import de from './locales/de.json'
import vi from './locales/vi.json'
import ru from './locales/ru.json'

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  it: { translation: it },
  de: { translation: de },
  vi: { translation: vi },
  ru: { translation: ru }
}

// Cold-launch language: the user override, else the device locale, else English —
// no instance locale (there is no logged-in account). Reused on logout to drop
// the instance locale that useSyncInstanceLocale applied during the session.
export const resolveDeviceLanguage = (): string =>
  resolveLanguage(
    getLocalePreference(),
    getLocales()[0]?.languageCode ?? undefined,
    Object.keys(resources)
  )

i18n.use(initReactI18next).init({
  resources,
  lng: resolveDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
