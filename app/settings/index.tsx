import React from 'react'
import { ScrollView } from 'react-native'
import { Switch } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import * as WebBrowser from 'expo-web-browser'

import { AccountHeader } from '@/ui/AccountHeader'
import { AppBar } from '@/ui/AppBar'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { SettingsRow } from '@/ui/SettingsRow'
import { SettingsSection } from '@/ui/SettingsSection'
import { useCurrentUser } from '@/account/useCurrentUser'
import { useDeleteAccount } from '@/account/useDeleteAccount'
import { setCrashReportsEnabled, useCrashReportsEnabled } from '@/monitoring/crashReportsPreference'
import { useLegalNoticeUrl } from '@/account/useLegalNotice'
import { getLocalePreference, LOCALE_SYSTEM } from '@/preferences/localePreference'
import { localeDisplayName } from '@/i18n/localeNames'
import { useThemePreference, ThemePref } from '@/preferences/themePreference'
import { useAuth } from '@/auth/useAuth'
import { isKeepOfflineEnabled } from '@/offline/keepOfflineFlag'

export default function SettingsIndex(): React.ReactElement {
  const keepOfflineEnabled = isKeepOfflineEnabled()
  const { t } = useTranslation()
  const router = useRouter()
  const { name, email, initials } = useCurrentUser()
  const { logout } = useAuth()
  const deleteAccount = useDeleteAccount()
  const crashReports = useCrashReportsEnabled()
  const legalNoticeUrl = useLegalNoticeUrl()
  const [deleteAccountAsked, setDeleteAccountAsked] = React.useState(false)
  const localePref = getLocalePreference()
  const languageValue =
    localePref === LOCALE_SYSTEM ? t('settings.systemLanguage') : localeDisplayName(localePref)
  const { pref: themePref, setPref: setThemePref } = useThemePreference()
  const themeOptions: { key: ThemePref; label: string }[] = [
    { key: 'system', label: t('settings.themeSystem') },
    { key: 'light', label: t('settings.themeLight') },
    { key: 'dark', label: t('settings.themeDark') }
  ]
  const version = Constants.expoConfig?.version ?? ''
  return (
    <ScreenContainer>
      <AppBar title={t('settings.title')} onClose={() => router.back()} />
      <ScrollView>
        <AccountHeader
          name={name}
          email={email}
          initials={initials}
          fallbackLabel={t('settings.account')}
        />

        <SettingsSection title={t('settings.general')} first>
          <SettingsRow
            testID="settings-language"
            title={t('settings.language')}
            description={languageValue}
            icon="translate"
            trailing="chevron"
            onPress={() => router.push('/settings/language')}
          />
          {keepOfflineEnabled ? (
            <SettingsRow
              testID="settings-offline-storage"
              title={t('drive.offline.storageTitle')}
              icon="download"
              trailing="chevron"
              onPress={() => router.push('/settings/offline-storage')}
            />
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('settings.privacy')}>
          <SettingsRow
            testID="settings-crash-reports"
            title={t('settings.crashReports')}
            description={t('settings.crashReportsDescription')}
            descriptionLines={4}
            icon="info"
            accessory={
              <Switch
                value={crashReports}
                onValueChange={setCrashReportsEnabled}
                testID="settings-crash-reports-switch"
              />
            }
          />
        </SettingsSection>

        <SettingsSection title={t('settings.theme')}>
          {themeOptions.map(o => (
            <SettingsRow
              key={o.key}
              testID={`settings-theme-${o.key}`}
              title={o.label}
              trailing={themePref === o.key ? 'check' : 'none'}
              onPress={() => setThemePref(o.key)}
            />
          ))}
        </SettingsSection>

        <SettingsSection title={t('settings.about')}>
          <SettingsRow title={t('settings.version')} description={version} />
          {legalNoticeUrl ? (
            <SettingsRow
              testID="settings-legal-notice"
              title={t('settings.legalNotice')}
              icon="info"
              trailing="chevron"
              onPress={() => void WebBrowser.openBrowserAsync(legalNoticeUrl)}
            />
          ) : null}
          <SettingsRow
            testID="settings-logout"
            title={t('common.logout')}
            icon="logout"
            onPress={() => void logout()}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.account')}>
          <SettingsRow
            testID="settings-delete-account"
            title={t('settings.deleteAccount')}
            icon="trash"
            destructive
            onPress={() => setDeleteAccountAsked(true)}
          />
        </SettingsSection>
      </ScrollView>

      <ConfirmDialog
        visible={deleteAccountAsked}
        testID="delete-account-dialog"
        title={t('settings.deleteAccount')}
        message={t('settings.deleteAccountMessage')}
        confirmLabel={t('settings.deleteAccountContinue')}
        destructive
        onConfirm={() => {
          setDeleteAccountAsked(false)
          void deleteAccount()
        }}
        onDismiss={() => setDeleteAccountAsked(false)}
      />
    </ScreenContainer>
  )
}
