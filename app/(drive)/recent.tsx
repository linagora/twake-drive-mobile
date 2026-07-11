import React, { useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { Snackbar } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { ConfirmDeleteDialog } from '@/ui/ConfirmDeleteDialog'
import { RenameDialog } from '@/ui/RenameDialog'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import {
  recentQuery,
  recentQueryAs,
  FileQueryResult,
  HIDDEN_ROOT_DIR_IDS,
  TRASH_DIR_ID
} from '@/client/queries'
import { softDeleteEntry } from '@/files/deleteFile'
import { renameEntry } from '@/files/renameEntry'
import { optimisticFiles } from '@/files/optimisticFiles'
import { openFileFromList } from '@/files/openFromList'
import { surfaceOpenError } from '@/files/errors'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'

export default function RecentScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const query = useQuery(recentQuery(), { as: recentQueryAs })

  const [pendingDelete, setPendingDelete] = useState<FileQueryResult | null>(null)
  const [pendingRename, setPendingRename] = useState<FileQueryResult | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const isOnline = useIsOnline()
  const offlineActions = useOfflineActions()
  const onToggleFilePin = (file: { _id: string; name: string; size?: number | null }): void => {
    const entry = OfflineFilesStore.get(file._id)
    if (entry?.isDirectPin) void offlineActions.unpin(file._id)
    else offlineActions.pin({ _id: file._id, name: file.name, size: file.size ?? null })
  }

  const confirmDelete = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client || !pendingDelete) return
    const doc = pendingDelete
    const revert = optimisticFiles(client, [{ ...doc, dir_id: TRASH_DIR_ID, trashed: true }])
    setPendingDelete(null)
    setDeleting(true)
    try {
      await softDeleteEntry(client, {
        _id: doc._id,
        _rev: (doc as unknown as { _rev?: string })._rev,
        name: doc.name,
        type: doc.type
      })
      setSnackbar(t('drive.delete.successFile'))
    } catch (e) {
      console.error('[RecentScreen] delete failed', e)
      revert()
      setSnackbar(t('drive.delete.errorGeneric'))
    } finally {
      setDeleting(false)
    }
  }

  const submitRename = async (newName: string): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client || !pendingRename) return
    const doc = pendingRename
    const revert = optimisticFiles(client, [{ ...doc, name: newName }])
    setPendingRename(null)
    try {
      await renameEntry(client, doc._id, newName)
      setSnackbar(t('drive.rename.successFile'))
    } catch (e) {
      revert()
      throw e
    }
  }

  const renderItem = ({ item }: { item: FileQueryResult }) => (
    <FileRow
      file={{ ...item, size: item.size ?? null }}
      onPress={file => {
        if (!client) return
        void openFileFromList(client, router, file).catch(e =>
          surfaceOpenError(e, setSnackbar, t, 'RecentScreen')
        )
      }}
      onShare={file => {
        if (!requireOnline(isOnline, setSnackbar, t)) return
        router.push(`/share/${file._id}`)
      }}
      onRename={() => setPendingRename(item)}
      onDelete={() => setPendingDelete(item)}
      onMove={file => router.push(`/move/${file._id}`)}
      onTogglePin={onToggleFilePin}
      onInfo={file => router.push(`/metadata/${file._id}`)}
    />
  )

  // recentQuery is index-backed on updated_at only (no partial index — see its
  // definition); apply the file / not-trashed / not-hidden-dir filter here, then
  // cap at 50 for display.
  //
  // Also drop docs whose updated_at is in the FUTURE (beyond a 24h clock-skew
  // tolerance): a file can't be "recently modified" in the future, and such
  // migration/clock-skew artifacts otherwise dominate the updated_at-desc sort
  // (they render as "dans plus de 14 ans"). Dedup by _id defensively.
  const nowMs = Date.now()
  const seenIds = new Set<string>()
  const data = ((query.data as FileQueryResult[] | null | undefined) ?? [])
    .filter(d => d.type === 'file' && !d.trashed && !HIDDEN_ROOT_DIR_IDS.includes(d.dir_id ?? ''))
    .filter(d => !d.updated_at || new Date(d.updated_at).getTime() <= nowMs + 86_400_000)
    .filter(d => {
      if (seenIds.has(d._id)) return false
      seenIds.add(d._id)
      return true
    })
    .slice(0, 50)

  return (
    <ScreenContainer>
      <AppBar title={t('drive.recent')} onLogout={logout} showSearch />
      {query.fetchStatus === 'loading' && data.length === 0 ? (
        <LoadingState />
      ) : query.fetchStatus === 'failed' ? (
        <ErrorState
          message={t(getErrorMessageKey(query.lastError))}
          onRetry={() => query.fetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState message={t('drive.emptyRecent')} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={query.fetchStatus === 'loading'}
              onRefresh={() => query.fetch()}
            />
          }
        />
      )}
      <ConfirmDeleteDialog
        visible={!!pendingDelete}
        target={pendingDelete}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onDismiss={() => (deleting ? undefined : setPendingDelete(null))}
      />
      <RenameDialog
        visible={!!pendingRename}
        initialName={pendingRename?.name ?? ''}
        type={pendingRename?.type}
        onDismiss={() => setPendingRename(null)}
        onSubmit={submitRename}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
