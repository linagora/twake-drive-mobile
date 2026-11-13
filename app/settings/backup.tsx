import React, { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, HelperText, TextInput } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { AppBar } from '@/ui/AppBar'
import { InlineBanner } from '@/ui/InlineBanner'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { SettingsRow } from '@/ui/SettingsRow'
import { SettingsSection } from '@/ui/SettingsSection'
import { Switch } from '@/ui/Switch'
import { useSideInset } from '@/ui/useSideInset'
import { cozyTokens } from '@/ui/theme'
import {
  finishActivation,
  startActivation,
  stopBackup,
  type ActivationStep,
  type FolderChoice
} from '@/backup/activation'
import { readBackupSettings } from '@/backup/backupSettings'
import { runBackupPass } from '@/backup/backupPass'
import { BackupStatusSection } from '@/backup/BackupStatusSection'
import { BackupConditionsSection } from '@/backup/BackupConditionsSection'
import { adoptStoredToken } from '@/auth/adoptStoredToken'

type Choice = Extract<ActivationStep, { kind: 'choose' }>

export default function BackupScreen(): React.ReactElement {
  const { t } = useTranslation()
  const router = useRouter()
  const client = useClient()
  const sideInset = useSideInset()
  const [settings, setSettings] = useState(readBackupSettings)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const settle = (step: ActivationStep): void => {
    setChoice(step.kind === 'choose' ? step : null)
    if (step.kind === 'choose') setName(step.suggestedName)
    if (step.kind === 'denied') setNotice(t('backup.denied'))
    if (step.kind === 'unavailable') setNotice(t('backup.unavailable'))
    if (step.kind === 'ready') runBackupPass(client).catch(() => null)
    setSettings(readBackupSettings())
  }

  const run = async (action: () => Promise<ActivationStep>): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      settle(await action())
    } catch {
      setNotice(t('backup.error'))
    } finally {
      // The core refreshes in the keychain: the refresh token in hand may be spent.
      await adoptStoredToken(client).catch(() => false)
      setBusy(false)
    }
  }

  const toggle = (on: boolean): void => {
    if (on) {
      void run(startActivation)
      return
    }
    stopBackup()
    setChoice(null)
    setSettings(readBackupSettings())
  }

  // The names the stack refuses (checkFileName in cozy-stack).
  const invalidName = ['.', '..'].includes(name.trim()) || /[/\0\n\r]/.test(name)

  const pick = (folderChoice: FolderChoice): void => {
    void run(() => finishActivation(folderChoice))
  }

  return (
    <ScreenContainer bottomInset>
      <AppBar sheet title={t('backup.title')} onBack={() => router.back()} />
      <ScrollView style={{ marginHorizontal: sideInset }}>
        <SettingsRow
          testID="backup-enable"
          title={t('backup.enable')}
          description={
            settings.enabled && settings.folder
              ? t('backup.folder', { path: settings.folder.path })
              : t('backup.enableDescription')
          }
          descriptionLines={3}
          accessory={
            <Switch
              value={settings.enabled || choice !== null}
              disabled={busy}
              onValueChange={toggle}
              accessibilityLabel={t('backup.enable')}
              testID="backup-enable-switch"
            />
          }
        />
        {notice ? <InlineBanner tone="error" message={notice} testID="backup-notice" /> : null}
        {settings.enabled && !choice ? (
          <>
            <BackupStatusSection onTurnOff={() => toggle(false)} />
            <BackupConditionsSection />
            <SettingsSection title={t('backup.albums.title')}>
              <SettingsRow
                testID="backup-albums"
                title={t('backup.albums.open')}
                trailing="chevron"
                onPress={() => router.push('/settings/backup-albums')}
              />
            </SettingsSection>
          </>
        ) : null}
        {choice ? (
          <SettingsSection title={t('backup.chooseTitle')}>
            {choice.folders.map(folder => (
              <SettingsRow
                key={folder.id}
                testID={`backup-folder-${folder.id}`}
                title={folder.name}
                description={folder.path}
                trailing="chevron"
                onPress={busy ? undefined : () => pick({ adopt: folder })}
              />
            ))}
            <View style={styles.create}>
              <TextInput
                accessibilityLabel={t('backup.newFolderName')}
                testID="backup-new-folder-name"
                mode="outlined"
                label={t('backup.newFolderName')}
                value={name}
                onChangeText={setName}
                error={invalidName}
              />
              {invalidName ? (
                <HelperText type="error" testID="backup-name-invalid">
                  {t('backup.invalidName')}
                </HelperText>
              ) : null}
              <Button
                testID="backup-create-folder"
                mode="contained"
                disabled={busy || name.trim() === '' || invalidName}
                onPress={() => pick({ create: name, rootName: t('backup.rootFolder') })}
                style={styles.createButton}
              >
                {t('backup.create')}
              </Button>
            </View>
          </SettingsSection>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  create: { padding: cozyTokens.spacing.md },
  createButton: { marginTop: cozyTokens.spacing.sm }
})
