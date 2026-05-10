import React, { useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { Snackbar } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FileMetadataSheet, FileMetadataSheetHandle } from '@/ui/FileMetadataSheet'
import { ShareSheet, ShareSheetHandle } from '@/ui/ShareSheet'
import { ConfirmDeleteDialog } from '@/ui/ConfirmDeleteDialog'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { recentQuery, recentQueryAs, FileQueryResult } from '@/client/queries'
import { softDeleteEntry } from '@/files/deleteFile'

export default function RecentScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const sheetRef = useRef<FileMetadataSheetHandle>(null)
  const shareRef = useRef<ShareSheetHandle>(null)
  const query = useQuery(recentQuery(), { as: recentQueryAs })
  const [pendingDelete, setPendingDelete] = useState<FileQueryResult | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const confirmDelete = async (): Promise<void> => {
    if (!client || !pendingDelete) return
    setDeleting(true)
    try {
      await softDeleteEntry(client, {
        _id: pendingDelete._id,
        _rev: (pendingDelete as unknown as { _rev?: string })._rev,
        name: pendingDelete.name,
        type: pendingDelete.type
      })
      setSnackbar(t('drive.delete.successFile'))
      setPendingDelete(null)
      await query.fetch()
    } catch (e) {
      console.error('[RecentScreen] delete failed', e)
      setSnackbar(t('drive.delete.errorGeneric'))
    } finally {
      setDeleting(false)
    }
  }

  const renderItem = ({ item }: { item: FileQueryResult }) => (
    <FileRow
      file={{ ...item, size: item.size ?? null }}
      onPress={file => {
        sheetRef.current?.present({ ...file, cozyMetadata: item.cozyMetadata, path: item.path })
      }}
      onShare={file =>
        shareRef.current?.present({ _id: file._id, name: file.name, type: 'file' })
      }
      onDelete={() => setPendingDelete(item)}
    />
  )

  const data = (query.data as FileQueryResult[] | null | undefined) ?? []

  return (
    <View style={styles.container}>
      <AppBar title={t('drive.recent')} onLogout={logout} />
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
      <FileMetadataSheet
        ref={sheetRef}
        onShareRequested={file => shareRef.current?.present(file)}
        onDeleteRequested={file => {
          const full = data.find(d => d._id === file._id)
          if (full) setPendingDelete(full)
        }}
      />
      <ShareSheet ref={shareRef} />
      <ConfirmDeleteDialog
        visible={!!pendingDelete}
        target={pendingDelete}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onDismiss={() => (deleting ? undefined : setPendingDelete(null))}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
