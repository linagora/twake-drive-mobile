import React from 'react'
import { ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { SettingsRow } from '@/ui/SettingsRow'
import { localeDisplayName } from '@/i18n/localeNames'
import {
  LOCALE_SYSTEM,
  getLocalePreference,
  setLocalePreference,
  resolveLanguage
} from '@/preferences/localePreference'
import { getLocales } from 'expo-localization'

export default function LanguageScreen(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  const current = getLocalePreference()
  const available = Object.keys(i18n.options.resources ?? {})

  const choose = (pref: string): void => {
    setLocalePreference(pref)
    const device = getLocales()[0]?.languageCode ?? undefined
    const resolved = resolveLanguage(pref, device, available)
    // Navigate back FIRST, then switch the language on the next tick.
    // i18n.changeLanguage() synchronously re-renders every useTranslation consumer
    // (including the navigators' screen titles); doing that before/around
    // router.back() corrupts the in-flight pop and ejects the user out to the OS
    // launcher. Deferring the language change until after the back navigation
    // avoids that race — the (already-active) settings screen simply re-renders in
    // the new language.
    router.back()
    setTimeout(() => {
      void i18n.changeLanguage(resolved)
    }, 0)
  }

  return (
    <ScreenContainer>
      <AppBar title={t('settings.language')} onBack={() => router.back()} />
      <ScrollView>
        <SettingsRow
          title={t('settings.systemLanguage')}
          trailing={current === LOCALE_SYSTEM ? 'check' : 'none'}
          onPress={() => choose(LOCALE_SYSTEM)}
        />
        {available.map(code => (
          <SettingsRow
            key={code}
            testID={`settings-language-${code}`}
            title={localeDisplayName(code)}
            trailing={current === code ? 'check' : 'none'}
            onPress={() => choose(code)}
          />
        ))}
      </ScrollView>
    </ScreenContainer>
  )
}
