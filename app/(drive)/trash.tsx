import React, { useCallback, useRef, useState } from 'react'
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
import { useFocusEffect } from 'expo-router'
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
import { pouchLink } from '@/client/createClient'

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

  const data = (query.data as FileQueryResult[] | null | undefined) ?? []

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
    } catch (e) {
      console.error('[TrashScreen] empty failed', e)
      setSnackbar(t('drive.trashActions.emptyError'))
    } finally {
      setEmptying(false)
    }
  }

  /**
   * Pull-to-refresh / focus refresh: run a real Pouch replication and
   * AWAIT it to completion (not the fire-and-forget `syncImmediately`),
   * then re-read.
   *
   * `pouchLink.syncImmediately()` only schedules an immediate task on
   * the replication loop and returns void — we can't tell when "our"
   * sync actually finishes. The `pouchlink:sync:end` event fires for
   * every sync, including ones that started before our pull, so
   * waiting on it can resolve too early.
   *
   * Reaching into `pouchLink.pouches.replicateOnce()` lets us await
   * the actual replication promise. That's the only way to be sure
   * the local SQLite reflects the server state before we re-query.
   */
  const onRefresh = useCallback(async (): Promise<void> => {
    if (!client) return
    const internal = pouchLink as unknown as {
      pouches?: { replicateOnce?: () => Promise<unknown> }
    }
    try {
      await internal.pouches?.replicateOnce?.()
    } catch (e) {
      console.error('[TrashScreen] replicateOnce failed', e)
    }
    await query.fetch()
  }, [client, query])

  useFocusEffect(
    useCallback(() => {
      void onRefresh()
    }, [onRefresh])
  )

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
      {query.fetchStatus === 'loading' && data.length === 0 ? (
        <LoadingState />
      ) : query.fetchStatus === 'failed' ? (
        <ErrorState
          message={t(getErrorMessageKey(query.lastError))}
          onRetry={onRefresh}
        />
      ) : (
        // Always render the FlatList (even when empty, via
        // ListEmptyComponent) so the RefreshControl stays reachable —
        // otherwise the user can't pull-to-refresh to ask Pouch to
        // sync a freshly-trashed doc that hasn't replicated yet.
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
