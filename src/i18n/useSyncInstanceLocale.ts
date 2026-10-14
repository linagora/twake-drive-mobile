import { useEffect, useState } from 'react'
import { getLocales } from 'expo-localization'
import { useClient } from 'cozy-client'

import i18n from '@/i18n'
import {
  getInstanceLocale,
  getLocalePreference,
  resolveLanguage,
  setInstanceLocale
} from '@/preferences/localePreference'
import { useCurrentUser } from '@/account/useCurrentUser'
import { refreshInstanceLocale } from '@/client/refreshInstanceLocale'

// Precedence: explicit user override > instance locale > device > default.
// The instance locale is kept between launches (getInstanceLocale), refreshed
// from the stack once per session, and replaced when the settings query has it.
export const useSyncInstanceLocale = (): void => {
  const client = useClient()
  const { locale: liveLocale } = useCurrentUser()
  const [keptLocale, setKeptLocale] = useState(getInstanceLocale)
  const instanceLocale = liveLocale ?? keptLocale

  useEffect(() => {
    void refreshInstanceLocale(client).then(locale => locale && setKeptLocale(locale))
  }, [client])

  useEffect(() => {
    if (!liveLocale) return
    setInstanceLocale(liveLocale)
  }, [liveLocale])

  useEffect(() => {
    const deviceLocale = getLocales()[0]?.languageCode ?? undefined
    const available = Object.keys(i18n.options.resources ?? {})
    const target = resolveLanguage(getLocalePreference(), [instanceLocale, deviceLocale], available)
    if (target && i18n.language !== target) {
      void i18n.changeLanguage(target)
    }
  }, [instanceLocale])
}
