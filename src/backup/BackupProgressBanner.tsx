import React, { useCallback, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import type { StopCause } from '@/native/twakeDriveCore'
import { InlineBanner } from '@/ui/InlineBanner'

import { readBackupSettings } from './backupSettings'
import { savedShare, useBackupStatus } from './useBackupStatus'

const CAUSES: Partial<Record<StopCause, string>> = {
  WaitingForWifi: 'backup.banner.waitingWifi',
  WaitingForPower: 'backup.banner.waitingPower',
  QuotaExceeded: 'backup.banner.quota',
  FolderGone: 'backup.banner.folderGone'
}

/** How many photos are left to back up, on top of the drive. */
export const BackupProgressBanner = (): React.ReactElement | null => {
  const { t } = useTranslation()
  const router = useRouter()
  const { status, access } = useBackupStatus()
  // Read again on coming back from the settings, where the backup may be turned off.
  const [enabled, setEnabled] = useState(false)
  useFocusEffect(useCallback(() => setEnabled(readBackupSettings().enabled), []))
  // Media the phone cannot read wait for no one: they are not left to do.
  const left = status ? status.pending - status.unavailable : 0
  if (!status || left <= 0 || !enabled) return null
  const cause =
    access === 'denied' || access === 'restricted'
      ? 'backup.banner.noAccess'
      : status.stoppedBy
        ? (CAUSES[status.stoppedBy] ?? 'backup.banner.paused')
        : undefined
  return (
    <InlineBanner
      testID="backup-progress"
      message={t('backup.banner.remaining', { count: left })}
      detail={cause ? t(cause) : undefined}
      progress={savedShare(status)}
      progressTestID="backup-progress-bar"
      onPress={() => router.push('/settings/backup')}
      accessibilityHint={t('backup.banner.hint')}
    />
  )
}
