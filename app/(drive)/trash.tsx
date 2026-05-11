import React, { useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import {
  Button,
  Dialog,
  FAB,
  Portal,
  Snackbar,
  Text,
  useTheme
} from 'react-native-paper'
import { useQuery } from 'cozy-client'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { FileMetadataSheet, FileMetadataSheetHandle } from '@/ui/FileMetadataSheet'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { trashQuery, trashQueryAs, FileQueryResult } from '@/client/queries'
import { restoreEntry, emptyTrash } from '@/files/trashActions'
import { useSyncStatus } from '@/sync/useSyncStatus'
import { requireOnline } from '@/sync/requireOnline'

export default function TrashScreen() {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const theme = useTheme()
  const sheetRef = useRef<FileMetadataSheetHandle>(null)
  const query = useQuery(trashQuery(), { as: trashQueryAs })
  const { status: syncStatus } = useSyncStatus()
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [emptyDialogVisible, setEmptyDialogVisible] = useState(false)
  const [emptying, setEmptying] = useState(false)
  // After a successful `emptyTrash`, hide the list locally even though
  // the polling replication hasn't yet reconciled the local SQLite with
  // the stack's purge (cozy-stack's `DELETE /files/trash` is async +
  // its changes feed lag can leave the local Pouch stale for tens of
  // seconds). The 30s polling will catch up; until then, this flag
  // keeps the UI honest. Cleared on the next pull-to-refresh.
  const [optimisticallyEmpty, setOptimisticallyEmpty] = useState(false)

  const rawData = (query.data as FileQueryResult[] | null | undefined) ?? []
  const data = optimisticallyEmpty ? [] : rawData

  const handleRestore = async (item: FileQueryResult): Promise<void> => {
    if (!requireOnline(syncStatus, m => setSnackbar(m), t)) return
    if (!client) return
    try {
      await restoreEntry(client, item._id)
      setSnackbar(t('drive.trashActions.restoreSuccess'))
      await query.fetch()
    } catch (e) {
      console.error('[TrashScreen] restore failed', e)
      setSnackbar(t('drive.trashActions.restoreError'))
    }
  }

  const handleEmpty = async (): Promise<void> => {
    if (!requireOnline(syncStatus, m => setSnackbar(m), t)) return
    if (!client) return
    setEmptying(true)
    try {
      await emptyTrash(client)
      setSnackbar(t('drive.trashActions.emptySuccess'))
      setEmptyDialogVisible(false)
      // The stack has accepted the purge but the polling replication
      // won't reconcile the local SQLite until the changes feed picks
      // up the deletions (can take seconds). Show the empty state
      // locally so the user gets immediate feedback; pull-to-refresh
      // (below) drops this flag once they ask for the real state.
      setOptimisticallyEmpty(true)
    } catch (e) {
      console.error('[TrashScreen] empty failed', e)
      setSnackbar(t('drive.trashActions.emptyError'))
    } finally {
      setEmptying(false)
    }
  }

  const onRefresh = (): void => {
    setOptimisticallyEmpty(false)
    void query.fetch()
  }

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item}
          onPress={() => undefined}
          onRestore={() => void handleRestore(item)}
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => {
          sheetRef.current?.present({
            ...file,
            cozyMetadata: item.cozyMetadata,
            path: item.path
          })
        }}
        onRestore={() => void handleRestore(item)}
      />
    )
  }

  return (
    <View style={styles.container}>
      <AppBar title={t('drive.trash')} onLogout={logout} />
      {query.fetchStatus === 'loading' && rawData.length === 0 ? (
        <LoadingState />
      ) : query.fetchStatus === 'failed' ? (
        <ErrorState
          message={t(getErrorMessageKey(query.lastError))}
          onRetry={onRefresh}
        />
      ) : (
        // Always render the FlatList (even when empty) so the
        // RefreshControl stays available — that's how the user drops
        // the `optimisticallyEmpty` flag after an emptyTrash.
        <FlatList
          data={data}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          ListEmptyComponent={<EmptyState message={t('drive.emptyTrash')} />}
          contentContainerStyle={data.length === 0 ? styles.emptyContent : undefined}
          refreshControl={
            <RefreshControl
              refreshing={query.fetchStatus === 'loading'}
              onRefresh={onRefresh}
            />
          }
        />
      )}
      <FileMetadataSheet ref={sheetRef} />
      {data.length > 0 ? (
        <FAB
          icon="delete-sweep"
          label={t('drive.trashActions.emptyButton')}
          style={styles.fab}
          onPress={() => setEmptyDialogVisible(true)}
        />
      ) : null}
      <Portal>
        <Dialog
          visible={emptyDialogVisible}
          onDismiss={emptying ? undefined : () => setEmptyDialogVisible(false)}
          dismissable={!emptying}
        >
          <Dialog.Title>{t('drive.trashActions.emptyConfirmTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('drive.trashActions.emptyConfirmBody')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEmptyDialogVisible(false)} disabled={emptying}>
              {t('common.cancel')}
            </Button>
            <Button
              onPress={() => void handleEmpty()}
              loading={emptying}
              disabled={emptying}
              textColor={theme.colors.error}
            >
              {t('drive.trashActions.emptyConfirm')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' }
})
