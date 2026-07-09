import { useEffect } from 'react'
import { getLocales } from 'expo-localization'

import i18n from '@/i18n'
import { getLocalePreference, resolveLanguage } from '@/preferences/localePreference'
import { useCurrentUser } from '@/account/useCurrentUser'

// Precedence: explicit user override > instance locale > device > default.
export const useSyncInstanceLocale = (): void => {
  const { locale: instanceLocale } = useCurrentUser()

  useEffect(() => {
    const deviceLocale = getLocales()[0]?.languageCode ?? undefined
    const available = Object.keys(i18n.options.resources ?? {})
    const target = resolveLanguage(getLocalePreference(), instanceLocale ?? deviceLocale, available)
    if (target && i18n.language !== target) {
      void i18n.changeLanguage(target)
    }
  }, [instanceLocale])
}
