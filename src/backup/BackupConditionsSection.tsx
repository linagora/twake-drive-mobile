import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { backupCore, type BackupConditions } from '@/native/twakeDriveCore'
import { SettingsRow } from '@/ui/SettingsRow'
import { SettingsSection } from '@/ui/SettingsSection'
import { Switch } from '@/ui/Switch'

const CHOICES: (keyof BackupConditions)[] = ['cellularPhotos', 'cellularVideos', 'onlyCharging']

/** When the backup may go. The core keeps the choices for the passes the system starts. */
export const BackupConditionsSection = (): React.ReactElement | null => {
  const { t } = useTranslation()
  const [conditions, setConditions] = useState<BackupConditions | null>(null)

  useEffect(() => {
    void backupCore()
      ?.backupConditions()
      .then(setConditions)
      .catch(() => null)
  }, [])

  if (!conditions) return null

  const change = (key: keyof BackupConditions, on: boolean): void => {
    const next = { ...conditions, [key]: on }
    setConditions(next)
    backupCore()
      ?.setBackupConditions(next.cellularPhotos, next.cellularVideos, next.onlyCharging)
      // What the core kept, another switch may have been saved since.
      .catch(() => backupCore()?.backupConditions().then(setConditions))
      .catch(() => null)
  }

  return (
    <SettingsSection title={t('backup.conditions.title')}>
      {CHOICES.map(key => (
        <SettingsRow
          key={key}
          testID={`backup-${key}`}
          title={t(`backup.conditions.${key}`)}
          accessory={
            <Switch
              value={conditions[key]}
              onValueChange={on => change(key, on)}
              accessibilityLabel={t(`backup.conditions.${key}`)}
              testID={`backup-${key}-switch`}
            />
          }
        />
      ))}
    </SettingsSection>
  )
}
