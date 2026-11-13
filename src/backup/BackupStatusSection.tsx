import React, { useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { Button } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { useClient } from 'cozy-client'

import { dateLocaleForLanguage } from '@/i18n/dateLocale'
import { InlineBanner } from '@/ui/InlineBanner'
import { QuotaPaywall } from '@/ui/QuotaPaywall'
import { SettingsRow } from '@/ui/SettingsRow'
import { SettingsSection } from '@/ui/SettingsSection'
import { cozyTokens } from '@/ui/theme'

import { runBackupPass } from './backupPass'
import { readBackupSettings, writeBackupSettings } from './backupSettings'
import { useBackupStatus } from './useBackupStatus'

/** How far the backup is, and what holds it back. */
export const BackupStatusSection = (): React.ReactElement | null => {
  const { t, i18n } = useTranslation()
  const client = useClient()
  const { status, access, retryFailed } = useBackupStatus()
  // The paywall comes back with each pass a full Drive stops, as on the web after each upload.
  const [paywallClosedFor, setPaywallClosedFor] = useState(
    () => readBackupSettings().paywallClosedFor
  )
  if (!status) return null
  const passEnd = status.lastPassAt ?? 0
  const lastPass = status.lastPassAt
    ? t('backup.status.lastPass', {
        when: formatDistanceToNow(new Date(status.lastPassAt * 1000), {
          addSuffix: true,
          locale: dateLocaleForLanguage(i18n.language)
        })
      })
    : t('backup.status.neverRun')
  const openSettings = {
    label: t('backup.status.openSettings'),
    onPress: () => void Linking.openSettings().catch(() => null),
    testID: 'backup-open-settings'
  }
  return (
    <SettingsSection title={t('backup.status.title')}>
      {access === 'denied' || access === 'restricted' ? (
        <InlineBanner
          tone="error"
          message={t('backup.status.noAccess')}
          // A restricted access (parental controls, a managed phone) is not the user's to change.
          action={access === 'denied' ? openSettings : undefined}
          testID="backup-no-access"
        />
      ) : access === 'limited' ? (
        <InlineBanner
          message={t('backup.status.limitedAccess')}
          action={openSettings}
          testID="backup-limited-access"
        />
      ) : null}
      {status.stoppedBy === 'QuotaExceeded' ? (
        <>
          <InlineBanner tone="error" message={t('backup.status.quota')} testID="backup-quota" />
          {paywallClosedFor !== passEnd ? (
            <QuotaPaywall
              onClose={() => {
                writeBackupSettings({ paywallClosedFor: passEnd })
                setPaywallClosedFor(passEnd)
              }}
            />
          ) : null}
        </>
      ) : status.stoppedBy === 'WaitingForWifi' ? (
        <InlineBanner message={t('backup.status.waitingWifi')} testID="backup-waiting-wifi" />
      ) : status.stoppedBy === 'WaitingForPower' ? (
        <InlineBanner message={t('backup.status.waitingPower')} testID="backup-waiting-power" />
      ) : status.stoppedBy ? (
        <InlineBanner message={t('backup.status.stopped')} testID="backup-stopped" />
      ) : null}
      <SettingsRow
        testID="backup-counts"
        title={t('backup.status.counts', { done: status.done, pending: status.pending })}
        description={lastPass}
      />
      {status.unavailable > 0 ? (
        <SettingsRow
          testID="backup-unavailable"
          title={t('backup.status.unavailable', { count: status.unavailable })}
          descriptionLines={3}
        />
      ) : null}
      {status.skipped > 0 ? (
        <SettingsRow
          testID="backup-too-large"
          title={t('backup.status.tooLarge', { count: status.skipped })}
        />
      ) : null}
      {status.failed > 0 ? (
        <View style={styles.failed}>
          <SettingsRow
            testID="backup-failed"
            title={t('backup.status.failed', { count: status.failed })}
          />
          <Button
            testID="backup-retry"
            mode="outlined"
            onPress={() => void retryFailed().then(() => runBackupPass(client).catch(() => null))}
          >
            {t('backup.status.retry')}
          </Button>
        </View>
      ) : null}
    </SettingsSection>
  )
}

const styles = StyleSheet.create({
  failed: { paddingBottom: cozyTokens.spacing.sm }
})
