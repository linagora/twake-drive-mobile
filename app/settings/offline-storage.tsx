import React, { useEffect, useMemo, useState } from 'react'
import { ScrollView, View, StyleSheet } from 'react-native'
import { Button, Switch } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { SettingsRow } from '@/ui/SettingsRow'
import { SettingsSection, SettingsSectionEmpty } from '@/ui/SettingsSection'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { InlineBanner } from '@/ui/InlineBanner'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { Downloader } from '@/offline/Downloader'
import { OfflineSettingsAPI } from '@/offline/offlineSettings'
import { reconcileFolderPins } from '@/offline/reconcileFolderPins'
import { formatFileSize } from '@/utils/formatters'
import { cozyTokens } from '@/ui/theme'
import type { OfflineFileEntry, OfflineFolderEntry } from '@/offline/types'

export default function OfflineStorageScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const client = useClient()
  const [totalBytes, setTotalBytes] = useState<number>(0)
  const [files, setFiles] = useState<OfflineFileEntry[]>([])
  const [folders, setFolders] = useState<OfflineFolderEntry[]>([])
  const [wifiOnly, setWifiOnly] = useState<boolean>(OfflineSettingsAPI.get().wifiOnly)
  const [diskFull, setDiskFull] = useState<boolean>(OfflineSettingsAPI.status.get().diskFull)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refresh = async (): Promise<void> => {
    setFiles(OfflineFilesStore.getAll())
    setFolders(OfflineFilesStore.getAllFolders())
    setTotalBytes(await FileSystemRepo.totalBytes())
  }

  useEffect(() => {
    void refresh()
    // Reconcile any stale folder pins (folder entry survives, child file
    // entries were dropped) — they auto-repopulate.
    if (client) void reconcileFolderPins(client)
    const off1 = OfflineFilesStore.subscribeAll(() => void refresh())
    const off2 = OfflineSettingsAPI.subscribe(() => setWifiOnly(OfflineSettingsAPI.get().wifiOnly))
    const off3 = OfflineSettingsAPI.status.subscribe(() =>
      setDiskFull(OfflineSettingsAPI.status.get().diskFull)
    )
    return () => {
      off1()
      off2()
      off3()
    }
  }, [client])

  // Show every pinned file, regardless of how it was pinned (direct vs via folder).
  // The user expects to see what's actually cached, not just direct pins.
  const inProgress = useMemo(() => files.filter(f => f.state === 'downloading'), [files])
  const failed = useMemo(() => files.filter(f => f.state === 'failed'), [files])
  const isEmpty = files.length === 0 && folders.length === 0

  const deleteAll = async (): Promise<void> => {
    setDeleting(true)
    try {
      // Unpin every folder first so the auto-purge of any file pinned
      // only via that folder happens through unpinFolder's bookkeeping.
      for (const folder of OfflineFilesStore.getAllFolders()) {
        await OfflineFilesStore.unpinFolder(folder.dirId)
      }
      // Then purge any leftover directly-pinned files.
      for (const f of OfflineFilesStore.getAll()) {
        await OfflineFilesStore.purge(f.fileId)
      }
      await refresh()
    } finally {
      setDeleting(false)
      setConfirmDeleteAll(false)
    }
  }

  const retryDownload = (fileId: string): void => {
    OfflineFilesStore.update(fileId, e => ({ ...e, retryCount: 0, state: 'pending' }))
    Downloader.enqueue(fileId)
  }

  return (
    <ScreenContainer>
      <AppBar title={t('drive.offline.storageTitle')} onBack={() => router.back()} />
      <ScrollView>
        <SettingsRow
          title={t('drive.offline.totalUsed')}
          description={formatFileSize(totalBytes)}
        />
        <View style={styles.actionRow}>
          <Button
            mode="outlined"
            testID="offline-delete-all"
            disabled={isEmpty}
            onPress={() => setConfirmDeleteAll(true)}
          >
            {t('drive.offline.deleteAll')}
          </Button>
        </View>

        {diskFull ? <InlineBanner tone="error" message={t('drive.offline.diskFull')} /> : null}

        <SettingsSection title={t('settings.general')}>
          <SettingsRow
            title={t('drive.offline.wifiOnly')}
            accessory={
              <Switch
                value={wifiOnly}
                onValueChange={v => OfflineSettingsAPI.set({ wifiOnly: v })}
                testID="offline-wifi-only"
              />
            }
          />
          {inProgress.length > 0 ? (
            <SettingsRow
              title={t('drive.offline.downloading')}
              description={`${files.length - inProgress.length}/${files.length}`}
            />
          ) : null}
        </SettingsSection>

        {failed.length > 0 ? (
          <SettingsSection title={t('drive.offline.errorsSection')}>
            {failed.map(f => (
              <SettingsRow
                key={f.fileId}
                title={f.name || f.fileId}
                description={f.lastError ?? t('drive.offline.failed')}
                accessory={
                  <Button mode="text" onPress={() => retryDownload(f.fileId)}>
                    {t('drive.offline.retry')}
                  </Button>
                }
              />
            ))}
          </SettingsSection>
        ) : null}

        <SettingsSection title={t('drive.offline.foldersSection')}>
          {folders.length === 0 ? (
            <SettingsSectionEmpty message={t('drive.offline.noFolders')} />
          ) : (
            folders
              .slice()
              .sort((a, b) => b.pinnedAt - a.pinnedAt)
              .map(f => {
                const childEntries = files.filter(file => file.parentFolderPins.includes(f.dirId))
                const childBytes = childEntries.reduce((a, file) => a + file.size, 0)
                return (
                  <SettingsRow
                    key={f.dirId}
                    title={f.name}
                    description={t('drive.offline.folderSummary', {
                      count: childEntries.length,
                      size: formatFileSize(childBytes)
                    })}
                    accessory={
                      <Button
                        mode="text"
                        onPress={() => void OfflineFilesStore.unpinFolder(f.dirId)}
                      >
                        {t('drive.offline.unpin')}
                      </Button>
                    }
                  />
                )
              })
          )}
        </SettingsSection>

        <SettingsSection title={t('drive.offline.filesSection')}>
          {files.length === 0 ? (
            <SettingsSectionEmpty message={t('drive.offline.noFiles')} />
          ) : (
            files
              .slice()
              .sort((a, b) => b.pinnedAt - a.pinnedAt)
              .map(f => {
                // A downloaded file whose local blob is far smaller than the
                // server size is a truncated download, not a usable cache entry.
                const isSuspect =
                  f.state === 'downloaded' &&
                  f.localBytes !== undefined &&
                  f.size > 0 &&
                  f.localBytes < f.size * 0.5
                return (
                  <SettingsRow
                    key={f.fileId}
                    title={f.name || f.fileId}
                    description={
                      isSuspect
                        ? t('drive.offline.truncated', {
                            size: formatFileSize(f.size),
                            localSize: formatFileSize(f.localBytes)
                          })
                        : formatFileSize(f.size)
                    }
                    accessory={
                      <Button mode="text" onPress={() => void OfflineFilesStore.unpin(f.fileId)}>
                        {t('drive.offline.unpin')}
                      </Button>
                    }
                  />
                )
              })
          )}
        </SettingsSection>
      </ScrollView>

      <ConfirmDialog
        visible={confirmDeleteAll}
        testID="offline-delete-all-dialog"
        title={t('drive.offline.deleteAll')}
        message={t('drive.offline.deleteAllConfirm', {
          count: files.length,
          size: formatFileSize(totalBytes)
        })}
        confirmLabel={t('drive.delete.confirm')}
        destructive
        loading={deleting}
        onConfirm={() => void deleteAll()}
        onDismiss={() => setConfirmDeleteAll(false)}
      />
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  actionRow: { paddingHorizontal: cozyTokens.spacing.md, paddingBottom: cozyTokens.spacing.sm }
})
