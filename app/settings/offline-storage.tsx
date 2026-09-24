import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InteractionManager, SectionList, View, StyleSheet } from 'react-native'
import { Button, Switch } from 'react-native-paper'
import { Redirect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { SettingsRow } from '@/ui/SettingsRow'
import { SettingsSection, SettingsSectionEmpty, SettingsSectionHeader } from '@/ui/SettingsSection'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { InlineBanner } from '@/ui/InlineBanner'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { Downloader } from '@/offline/Downloader'
import { OfflineSettingsAPI } from '@/offline/offlineSettings'
import { isKeepOfflineEnabled } from '@/offline/keepOfflineFlag'
import { reconcileFolderPins } from '@/offline/reconcileFolderPins'
import { offlineDisplayName } from '@/offline/displayName'
import { formatFileSize } from '@/utils/formatters'
import { cozyTokens } from '@/ui/theme'
import type { OfflineFileEntry, OfflineFolderEntry } from '@/offline/types'

/** A store mutation wakes every subscriber, and a download burst produces one
 *  per finished file. Reading the whole store on each is what made the screen
 *  stay busy long after it appeared. */
const REFRESH_COALESCE_MS = 200

interface FolderAggregate {
  count: number
  bytes: number
}

type Row =
  | { kind: 'failed'; file: OfflineFileEntry }
  | { kind: 'folder'; folder: OfflineFolderEntry }
  | { kind: 'file'; file: OfflineFileEntry }

const byNewestPin = <T extends { pinnedAt: number }>(a: T, b: T): number => b.pinnedAt - a.pinnedAt

/** Space a pinned file actually takes: what landed on disk, nothing for what
 *  has not been downloaded yet. */
const diskBytes = (entry: OfflineFileEntry): number => entry.localBytes ?? 0

const FailedRow = React.memo(
  ({
    file,
    onRetry,
    retryLabel,
    fallbackError
  }: {
    file: OfflineFileEntry
    onRetry: (fileId: string) => void
    retryLabel: string
    fallbackError: string
  }): React.ReactElement => (
    <SettingsRow
      title={offlineDisplayName(file)}
      description={file.lastError ?? fallbackError}
      accessory={
        <Button mode="text" onPress={() => onRetry(file.fileId)}>
          {retryLabel}
        </Button>
      }
    />
  )
)
FailedRow.displayName = 'FailedRow'

const FolderRow = React.memo(
  ({
    folder,
    aggregate,
    summary,
    unpinLabel
  }: {
    folder: OfflineFolderEntry
    aggregate: FolderAggregate | undefined
    summary: (count: number, size: string) => string
    unpinLabel: string
  }): React.ReactElement => (
    <SettingsRow
      title={offlineDisplayName({ fileId: folder.dirId, name: folder.name })}
      description={summary(aggregate?.count ?? 0, formatFileSize(aggregate?.bytes ?? 0))}
      accessory={
        <Button mode="text" onPress={() => void OfflineFilesStore.unpinFolder(folder.dirId)}>
          {unpinLabel}
        </Button>
      }
    />
  )
)
FolderRow.displayName = 'FolderRow'

const FileRow = React.memo(
  ({
    file,
    truncated,
    unpinLabel
  }: {
    file: OfflineFileEntry
    truncated: (size: string, localSize: string) => string
    unpinLabel: string
  }): React.ReactElement => {
    // A downloaded file whose local blob is far smaller than the server size is
    // a truncated download, not a usable cache entry.
    const isSuspect =
      file.state === 'downloaded' &&
      file.localBytes !== undefined &&
      file.size > 0 &&
      file.localBytes < file.size * 0.5
    return (
      <SettingsRow
        title={offlineDisplayName(file)}
        description={
          isSuspect
            ? truncated(formatFileSize(file.size), formatFileSize(file.localBytes))
            : formatFileSize(file.size)
        }
        accessory={
          <Button mode="text" onPress={() => void OfflineFilesStore.unpin(file.fileId)}>
            {unpinLabel}
          </Button>
        }
      />
    )
  }
)
FileRow.displayName = 'FileRow'

export default function OfflineStorageScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const client = useClient()
  const [files, setFiles] = useState<OfflineFileEntry[]>([])
  const [folders, setFolders] = useState<OfflineFolderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [wifiOnly, setWifiOnly] = useState<boolean>(OfflineSettingsAPI.get().wifiOnly)
  const [diskFull, setDiskFull] = useState<boolean>(OfflineSettingsAPI.status.get().diskFull)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refresh = useCallback((): void => {
    setFiles(OfflineFilesStore.getAll())
    setFolders(OfflineFilesStore.getAllFolders())
    setLoading(false)
  }, [])

  const coalesced = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    refresh()
    const scheduleRefresh = (): void => {
      if (coalesced.current) clearTimeout(coalesced.current)
      coalesced.current = setTimeout(refresh, REFRESH_COALESCE_MS)
    }
    const off1 = OfflineFilesStore.subscribeAll(scheduleRefresh)
    const off2 = OfflineSettingsAPI.subscribe(() => setWifiOnly(OfflineSettingsAPI.get().wifiOnly))
    const off3 = OfflineSettingsAPI.status.subscribe(() =>
      setDiskFull(OfflineSettingsAPI.status.get().diskFull)
    )
    return () => {
      if (coalesced.current) clearTimeout(coalesced.current)
      off1()
      off2()
      off3()
    }
  }, [refresh])

  // Reconciling stale folder pins queries the database once per pinned folder
  // and can enqueue downloads, so it waits for the screen to be on its feet.
  useEffect(() => {
    if (!client) return
    const task = InteractionManager.runAfterInteractions(() => {
      void reconcileFolderPins(client)
    })
    return () => task.cancel()
  }, [client])

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + diskBytes(f), 0), [files])

  // One pass over the files rather than one filter per folder.
  const folderAggregates = useMemo(() => {
    const byDirId = new Map<string, FolderAggregate>()
    for (const file of files) {
      for (const dirId of file.parentFolderPins) {
        const current = byDirId.get(dirId)
        if (current) {
          current.count += 1
          current.bytes += file.size
        } else {
          byDirId.set(dirId, { count: 1, bytes: file.size })
        }
      }
    }
    return byDirId
  }, [files])

  const downloading = useMemo(() => files.filter(f => f.state === 'downloading').length, [files])
  const failed = useMemo(() => files.filter(f => f.state === 'failed').sort(byNewestPin), [files])
  const isEmpty = files.length === 0 && folders.length === 0

  const sections = useMemo(() => {
    const sortedFolders = folders.slice().sort(byNewestPin)
    const sortedFiles = files.slice().sort(byNewestPin)
    return [
      ...(failed.length > 0
        ? [
            {
              key: 'failed',
              title: t('drive.offline.errorsSection'),
              emptyMessage: null,
              data: failed.map((file): Row => ({ kind: 'failed', file }))
            }
          ]
        : []),
      {
        key: 'folders',
        title: t('drive.offline.foldersSection'),
        emptyMessage: t('drive.offline.noFolders'),
        data: sortedFolders.map((folder): Row => ({ kind: 'folder', folder }))
      },
      {
        key: 'files',
        title: t('drive.offline.filesSection'),
        emptyMessage: t('drive.offline.noFiles'),
        data: sortedFiles.map((file): Row => ({ kind: 'file', file }))
      }
    ]
  }, [failed, folders, files, t])

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
      refresh()
    } finally {
      setDeleting(false)
      setConfirmDeleteAll(false)
    }
  }

  const retryDownload = useCallback((fileId: string): void => {
    OfflineFilesStore.update(fileId, e => ({ ...e, retryCount: 0, state: 'pending' }))
    Downloader.enqueue(fileId)
  }, [])

  const folderSummary = useCallback(
    (count: number, size: string) => t('drive.offline.folderSummary', { count, size }),
    [t]
  )
  const truncatedLabel = useCallback(
    (size: string, localSize: string) => t('drive.offline.truncated', { size, localSize }),
    [t]
  )

  const renderItem = useCallback(
    ({ item }: { item: Row }): React.ReactElement => {
      if (item.kind === 'failed') {
        return (
          <FailedRow
            file={item.file}
            onRetry={retryDownload}
            retryLabel={t('drive.offline.retry')}
            fallbackError={t('drive.offline.failed')}
          />
        )
      }
      if (item.kind === 'folder') {
        return (
          <FolderRow
            folder={item.folder}
            aggregate={folderAggregates.get(item.folder.dirId)}
            summary={folderSummary}
            unpinLabel={t('drive.offline.unpin')}
          />
        )
      }
      return (
        <FileRow
          file={item.file}
          truncated={truncatedLabel}
          unpinLabel={t('drive.offline.unpin')}
        />
      )
    },
    [folderAggregates, folderSummary, retryDownload, t, truncatedLabel]
  )

  const header = (
    <View>
      <SettingsRow title={t('drive.offline.totalUsed')} description={formatFileSize(totalBytes)} />
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
        {downloading > 0 ? (
          <SettingsRow
            title={t('drive.offline.downloading')}
            description={`${files.length - downloading}/${files.length}`}
          />
        ) : null}
      </SettingsSection>
    </View>
  )

  if (!isKeepOfflineEnabled()) return <Redirect href="/settings" />

  return (
    <ScreenContainer>
      <AppBar sheet title={t('drive.offline.storageTitle')} onBack={() => router.back()} />
      {loading ? (
        <LoadingState />
      ) : (
        <SectionList
          sections={sections}
          testID="offline-storage-list"
          keyExtractor={item =>
            item.kind === 'folder'
              ? `folder-${item.folder.dirId}`
              : `${item.kind}-${item.file.fileId}`
          }
          renderItem={renderItem}
          renderSectionHeader={({ section }) => <SettingsSectionHeader title={section.title} />}
          renderSectionFooter={({ section }) =>
            section.data.length === 0 && section.emptyMessage ? (
              <SettingsSectionEmpty message={section.emptyMessage} />
            ) : null
          }
          ListHeaderComponent={header}
          stickySectionHeadersEnabled={false}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
        />
      )}

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
