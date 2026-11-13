import React, { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { Button } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { backupCore, batteryOptimization, type BackupConditions } from '@/native/twakeDriveCore'
import { SettingsRow } from '@/ui/SettingsRow'
import { SettingsSection } from '@/ui/SettingsSection'
import { Switch } from '@/ui/Switch'

const CHOICES: (keyof BackupConditions)[] = ['cellularPhotos', 'cellularVideos', 'onlyCharging']

/** When the backup may go. The core keeps the choices for the passes the system starts. */
export const BackupConditionsSection = (): React.ReactElement | null => {
  const { t } = useTranslation()
  const [conditions, setConditions] = useState<BackupConditions | null>(null)
  const battery = batteryOptimization()
  const [heldBack, setHeldBack] = useState(() => battery?.isOn() ?? false)

  useEffect(() => {
    void backupCore()
      ?.backupConditions()
      .then(setConditions)
      .catch(() => null)
    // The answer of the system dialog comes back with the app.
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') setHeldBack(batteryOptimization()?.isOn() ?? false)
    })
    return () => sub.remove()
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
      {battery ? (
        <SettingsRow
          testID="backup-instant"
          title={t('backup.conditions.instant')}
          description={t(
            heldBack ? 'backup.conditions.instantHeldBack' : 'backup.conditions.instantOn'
          )}
          descriptionLines={6}
          accessory={
            heldBack ? (
              // The native function takes no argument: not the press event.
              <Button testID="backup-allow-background" onPress={() => battery.openSettings()}>
                {t('backup.conditions.allowBackground')}
              </Button>
            ) : undefined
          }
        />
      ) : null}
    </SettingsSection>
  )
}
