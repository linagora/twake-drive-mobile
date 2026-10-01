import React, { useCallback, useMemo, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { CreateMenu } from '@/drive/CreateMenu'
import { useHasWriteAccess } from '@/sharing/useHasWriteAccess'
import { fetchNextPage } from '@/drive/paging'
import { withoutSharedDriveRoots } from '@/files/sharedDriveDocuments'
import { useGuardedPush } from '@/ui/useGuardedPush'
import { FileListView } from '@/ui/FileListView'
import { useFileRowActions } from '@/files/useFileRowActions'
import { useTabBack } from '@/ui/useTabBack'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { isFirstLoad } from '@/client/queryLoading'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { FileGridItem } from '@/ui/FileGridItem'
import { ViewSwitcher } from '@/ui/ViewSwitcher'
import { useViewMode } from '@/ui/useViewMode'
import { cozyTokens } from '@/ui/theme'
import { SortControl } from '@/ui/SortControl'
import { useFolderSort } from '@/ui/useFolderSort'
import { SyncBanner } from '@/ui/SyncBanner'
import { ConfirmDeleteDialog } from '@/ui/ConfirmDeleteDialog'
import { RenameDialog } from '@/ui/RenameDialog'
import { useMultiSelect } from '@/ui/useMultiSelect'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { softDeleteEntry } from '@/files/deleteFile'
import { optimisticFiles } from '@/files/optimisticFiles'
import { renameEntry } from '@/files/renameEntry'
import { openFileFromList } from '@/files/openFromList'
import { surfaceOpenError } from '@/files/errors'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { BigFolderConfirmDialog } from '@/offline/BigFolderConfirmDialog'
import {
  fileByIdQuery,
  fileByIdQueryAs,
  folderFilesQuery,
  folderFilesQueryAs,
  folderSubfoldersQuery,
  folderSubfoldersQueryAs,
  ROOT_DIR_ID,
  TRASH_DIR_ID,
  FileQueryResult
} from '@/client/queries'

interface FilesScreenProps {
  /** Route prefix the folder navigation pushes onto, so the screen stays in
   *  the tab stack it was opened from. */
  basePath: '/(drive)/files' | '/(drive)/favorites'
}

export const FilesScreen = ({ basePath }: FilesScreenProps): React.ReactElement => {
  const router = useRouter()
  const guardedPush = useGuardedPush()
  const goBack = useTabBack(basePath)
  const { t } = useTranslation()
  const { logout } = useAuth()
  const params = useLocalSearchParams<{ path?: string | string[] }>()
  const rawPath = params.path
  const path: string[] | undefined =
    rawPath === undefined
      ? undefined
      : Array.isArray(rawPath)
        ? rawPath.filter(s => !!s)
        : rawPath
          ? [rawPath]
          : undefined
  const [refreshing, setRefreshing] = useState(false)
  const [bulkConfirmVisible, setBulkConfirmVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const actions = useFileRowActions({ screen: 'FilesScreen' })
  const { mode } = useViewMode()
  const { sort } = useFolderSort()
  const selection = useMultiSelect()
  const offlineActions = useOfflineActions()
  const onToggleFilePin = useCallback(
    (file: { _id: string; name: string; size?: number | null }) => {
      const entry = OfflineFilesStore.get(file._id)
      if (entry?.isDirectPin) void offlineActions.unpin(file._id)
      else offlineActions.pin({ _id: file._id, name: file.name, size: file.size ?? null })
    },
    [offlineActions]
  )
  const onToggleFolderPin = useCallback(
    (folder: { _id: string; name: string }) => {
      if (OfflineFilesStore.getFolder(folder._id)) void offlineActions.unpinFolder(folder._id)
      else void offlineActions.pinFolder({ _id: folder._id, name: folder.name })
    },
    [offlineActions]
  )
  const client = useClient()
  const isOnline = useIsOnline()

  const isRoot = !path || path.length === 0
  const currentDirId = isRoot ? ROOT_DIR_ID : path![path!.length - 1]
  // Received shares list here too, and the stack refuses a create in one that
  // was shared read only.
  const canWrite = useHasWriteAccess(currentDirId)

  // The sort is part of the query: sorting a page that was fetched in another
  // order would only sort what is already on screen.
  const foldersQuery = useQuery(folderSubfoldersQuery(currentDirId, sort), {
    as: folderSubfoldersQueryAs(currentDirId, sort)
  })
  const filesQuery = useQuery(folderFilesQuery(currentDirId, sort), {
    as: folderFilesQueryAs(currentDirId, sort)
  })

  const currentDirLookup = useQuery(fileByIdQuery(currentDirId), {
    as: fileByIdQueryAs(currentDirId),
    enabled: !isRoot
  })

  const lookupData = currentDirLookup.data
  const lookupDoc = Array.isArray(lookupData) ? lookupData[0] : lookupData
  const currentDirName = isRoot
    ? t('drive.myDrive')
    : ((lookupDoc as { name?: string } | null | undefined)?.name ?? '')

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([foldersQuery.fetch(), filesQuery.fetch()])
    } finally {
      setRefreshing(false)
    }
  }, [foldersQuery, filesQuery])

  const confirmBulkDelete = async (): Promise<void> => {
    if (!requireOnline(isOnline, actions.notify, t)) return
    if (!client) return
    const items = data.filter(d => selection.isSelected(d._id))
    if (items.length === 0) return
    const revert = optimisticFiles(
      client,
      items.map(item => ({ ...item, dir_id: TRASH_DIR_ID, trashed: true }))
    )
    selection.clear()
    setBulkConfirmVisible(false)
    setDeleting(true)
    try {
      // Sequential rather than parallel: cozy-stack can race on concurrent
      // dir_id mutations and we want to surface any single failure.
      for (const item of items) {
        await softDeleteEntry(client, {
          _id: item._id,
          _rev: (item as unknown as { _rev?: string })._rev,
          name: item.name,
          type: item.type
        })
      }
      actions.notify(t('drive.delete.successBulk', { count: items.length }))
    } catch (e) {
      console.error('[FilesScreen] bulk delete failed', e)
      revert()
      actions.notify(t('drive.delete.errorGeneric'))
    } finally {
      setDeleting(false)
    }
  }

  // In selection mode a row selects instead of acting: its menu is dropped and
  // a tap toggles the row.
  const renderItem = ({ item }: { item: FileQueryResult }): React.ReactElement => {
    const isSelected = selection.isSelected(item._id)
    const selecting = selection.isSelecting
    if (item.type === 'directory') {
      const folderHandlers = selecting
        ? ({} as Partial<ReturnType<typeof actions.folderProps>>)
        : actions.folderProps(item)
      return (
        <FolderRow
          folder={item}
          testID={`folder-row:${item.name}`}
          selected={selecting ? isSelected : undefined}
          {...folderHandlers}
          onPress={folder => {
            if (selecting) selection.toggle(folder._id)
            else guardedPush(`${basePath}/${[...(path ?? []), folder._id].join('/')}`)
          }}
          onLongPress={folder => selection.select(folder._id)}
        />
      )
    }
    const fileHandlers = selecting
      ? ({} as Partial<ReturnType<typeof actions.fileProps>>)
      : actions.fileProps(item)
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        testID={`file-row:${item.name}`}
        selected={selecting ? isSelected : undefined}
        {...fileHandlers}
        onPress={file => {
          if (selecting) selection.toggle(file._id)
          else fileHandlers.onPress?.(file)
        }}
        onLongPress={file => selection.select(file._id)}
      />
    )
  }

  const renderGridItem = ({ item }: { item: FileQueryResult }): React.ReactElement => {
    if (item._id.startsWith('__ph_')) return <View style={styles.gridPlaceholder} />
    const isSelected = selection.isSelected(item._id)
    const selecting = selection.isSelecting
    const isFolder = item.type === 'directory'
    const handlers = selecting
      ? ({} as Partial<ReturnType<typeof actions.fileProps>>)
      : isFolder
        ? actions.folderProps(item)
        : actions.fileProps(item)
    return (
      <FileGridItem
        file={item}
        selected={selecting ? isSelected : undefined}
        {...handlers}
        onInfo={selecting || isFolder ? undefined : file => router.push(`/metadata/${file._id}`)}
        onPress={file => {
          if (selecting) {
            selection.toggle(file._id)
            return
          }
          if (isFolder) guardedPush(`${basePath}/${[...(path ?? []), file._id].join('/')}`)
          else (handlers as ReturnType<typeof actions.fileProps>).onPress?.(file)
        }}
        onLongPress={file => selection.select(file._id)}
      />
    )
  }

  // Folders first, then files — same display order as twake-drive-web.
  const folderDocs = withoutSharedDriveRoots(
    (foldersQuery.data as FileQueryResult[] | null | undefined) ?? []
  )
  const fileDocs = withoutSharedDriveRoots(
    (filesQuery.data as FileQueryResult[] | null | undefined) ?? []
  )
  // shared-drives-dir + trash-dir are already filtered server-side by
  // buildDriveQuery (see src/client/queries.ts); a shared drive's own root is
  // not, since a replicated drive keeps the dir_id it has on its owner's
  // instance.
  // Sort within each group (folders / files) separately to preserve grouping.
  const data = useMemo(() => {
    const direction = sort.dir === 'asc' ? 1 : -1
    const compare = (a: FileQueryResult, b: FileQueryResult): number =>
      sort.attr === 'updated_at'
        ? direction * (a.updated_at ?? '').localeCompare(b.updated_at ?? '')
        : direction * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    const sorted = (arr: FileQueryResult[]): FileQueryResult[] => [...arr].sort(compare)
    return [...sorted(folderDocs), ...sorted(fileDocs)]
  }, [folderDocs, fileDocs, sort.attr, sort.dir])

  // In grid mode, pad the last row to a full 3 columns with invisible
  // placeholders so a lone item stays left-aligned (flex:1 would otherwise
  // stretch it across the whole row).
  const gridData = useMemo<FileQueryResult[]>(() => {
    if (mode !== 'grid') return data
    const remainder = data.length % 3
    if (remainder === 0) return data
    const pad = Array.from(
      { length: 3 - remainder },
      (_, i) => ({ _id: `__ph_${i}` }) as FileQueryResult
    )
    return [...data, ...pad]
  }, [data, mode])

  return (
    <ScreenContainer>
      <AppBar
        title={currentDirName}
        onBack={isRoot ? undefined : goBack}
        onLogout={isRoot ? logout : undefined}
        showSearch
        selection={
          selection.isSelecting
            ? {
                count: selection.count,
                onCancel: () => selection.clear(),
                actions: [
                  {
                    icon: 'folder-move-outline',
                    onPress: () => {
                      const ids = data
                        .filter(d => selection.isSelected(d._id))
                        .map(d => d._id)
                        .join(',')
                      if (ids) {
                        selection.clear()
                        router.push(`/move/${ids}`)
                      }
                    },
                    accessibilityLabel: t('drive.selection.move')
                  },
                  {
                    icon: 'trash-can-outline',
                    onPress: () => setBulkConfirmVisible(true),
                    accessibilityLabel: t('drive.fileMeta.delete'),
                    destructive: true,
                    testID: 'selection-delete'
                  }
                ]
              }
            : undefined
        }
      />
      <View style={styles.toolbar}>
        <SortControl />
        <ViewSwitcher />
      </View>
      <View style={styles.content}>
        <SyncBanner />
        <FileListView
          items={mode === 'grid' ? gridData : data}
          keyExtractor={(item: FileQueryResult) => item._id}
          renderItem={mode === 'grid' ? renderGridItem : renderItem}
          numColumns={mode === 'grid' ? 3 : undefined}
          loading={isFirstLoad(foldersQuery, filesQuery)}
          error={
            foldersQuery.fetchStatus === 'failed' || filesQuery.fetchStatus === 'failed'
              ? (foldersQuery.lastError ?? filesQuery.lastError)
              : undefined
          }
          onRetry={() => {
            void foldersQuery.fetch()
            void filesQuery.fetch()
          }}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          onEndReached={() => {
            fetchNextPage(foldersQuery)
            fetchNextPage(filesQuery)
          }}
          emptyMessage="drive.emptyFolder"
          // The FAB floats over the list, so the last rows need room to be
          // scrolled clear of it: their 3 dot menu sat under it otherwise.
          contentContainerStyle={styles.listContent}
        />
      </View>
      <CreateMenu
        dirId={currentDirId}
        canWrite={canWrite}
        hidden={selection.isSelecting}
        notify={actions.notify}
      />
      <ConfirmDeleteDialog
        visible={bulkConfirmVisible}
        bulkCount={selection.count}
        loading={deleting}
        onConfirm={() => void confirmBulkDelete()}
        onDismiss={() => (deleting ? undefined : setBulkConfirmVisible(false))}
      />
      {actions.dialogs}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  listContent: { paddingBottom: cozyTokens.fabClearance },
  gridPlaceholder: { flex: 1, margin: 4 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4
  }
})
