import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Dialog, FAB, Portal, Snackbar, Text, useTheme } from 'react-native-paper'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery } from 'cozy-client'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { fetchNextPage } from '@/drive/paging'
import { cozyTokens } from '@/ui/theme'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { FileListView } from '@/ui/FileListView'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { useAuth } from '@/auth/useAuth'
import {
  trashFoldersQuery,
  trashFoldersQueryAs,
  trashFilesQuery,
  trashFilesQueryAs,
  FileQueryResult
} from '@/client/queries'
import { restoreEntry, emptyTrash } from '@/files/trashActions'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'

export default function TrashScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const theme = useTheme()
  const foldersQuery = useQuery(trashFoldersQuery(), { as: trashFoldersQueryAs })
  const filesQuery = useQuery(trashFilesQuery(), { as: trashFilesQueryAs })

  const foldersQueryRef = useRef(foldersQuery)
  const filesQueryRef = useRef(filesQuery)
  foldersQueryRef.current = foldersQuery
  filesQueryRef.current = filesQuery

  useFocusEffect(
    useCallback(() => {
      void foldersQueryRef.current.fetch()
      void filesQueryRef.current.fetch()
    }, [])
  )

  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [emptyDialogVisible, setEmptyDialogVisible] = useState(false)
  const [emptying, setEmptying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Emptying the trash leaves a list that is empty AND refetching. Swapping the
  // whole list for the loading state on every background refetch made the empty
  // state blink in and out; only the very first load gets it.
  const [loadedOnce, setLoadedOnce] = useState(false)
  const isOnline = useIsOnline()
  // Optimistic removal: restoreEntry / emptyTrash hit the server only (they
  // bypass local Pouch), so an immediate refetch races the async replication and
  // re-shows the still-trashed doc. Hide locally-actioned ids at once; the
  // focus/pull refetch reconciles the list once replication lands.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())

  const folderDocs = (foldersQuery.data as FileQueryResult[] | null | undefined) ?? []
  const fileDocs = (filesQuery.data as FileQueryResult[] | null | undefined) ?? []
  // Folders first, then files — same display order as the regular folder
  // listing and as twake-drive-web's trash view.
  const items = [...folderDocs, ...fileDocs].filter(d => !removedIds.has(d._id))
  const data = items

  useEffect(() => {
    if (foldersQuery.fetchStatus === 'loaded' || filesQuery.fetchStatus === 'loaded') {
      setLoadedOnce(true)
    }
  }, [foldersQuery.fetchStatus, filesQuery.fetchStatus])

  const handleRestore = async (item: FileQueryResult): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client) return
    try {
      await restoreEntry(client, item._id)
      setRemovedIds(prev => new Set(prev).add(item._id))
      setSnackbar(t('drive.trashActions.restoreSuccess'))
    } catch (e) {
      console.error('[TrashScreen] restore failed', e)
      setSnackbar(t('drive.trashActions.restoreError'))
    }
  }

  const handleEmpty = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client) return
    setEmptying(true)
    try {
      await emptyTrash(client)
      setRemovedIds(prev => {
        const next = new Set(prev)
        ;[...folderDocs, ...fileDocs].forEach(d => next.add(d._id))
        return next
      })
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
   * Pull-to-refresh: re-run both queries through the link chain.
   * useQuery handles the initial fetch on mount on its own.
   */
  const onRefresh = useCallback((): void => {
    setRefreshing(true)
    void Promise.all([foldersQuery.fetch(), filesQuery.fetch()]).finally(() => setRefreshing(false))
  }, [foldersQuery, filesQuery])

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
        onPress={file => router.push(`/metadata/${file._id}`)}
        onRestore={() => void handleRestore(item)}
      />
    )
  }

  return (
    <ScreenContainer>
      <AppBar title={t('drive.trash')} onLogout={logout} />
      <FileListView
        items={data}
        keyExtractor={item => item._id}
        renderItem={renderItem}
        loading={
          !loadedOnce &&
          (foldersQuery.fetchStatus === 'loading' || filesQuery.fetchStatus === 'loading')
        }
        error={
          foldersQuery.fetchStatus === 'failed' || filesQuery.fetchStatus === 'failed'
            ? (foldersQuery.lastError ?? filesQuery.lastError)
            : undefined
        }
        onRetry={onRefresh}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={() => {
          fetchNextPage(foldersQuery)
          fetchNextPage(filesQuery)
        }}
        emptyMessage="drive.emptyTrash"
        contentContainerStyle={styles.listContent}
      />
      {data.length > 0 ? (
        <FAB
          icon="delete-sweep"
          label={t('drive.trashActions.emptyButton')}
          style={styles.fab}
          disabled={!isOnline}
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
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
  // The empty-trash FAB floats over the list; leave room for the last row.
  listContent: { paddingBottom: cozyTokens.fabClearance }
})
