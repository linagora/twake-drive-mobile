import React, { useCallback, useMemo, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { SegmentedButtons, Snackbar } from 'react-native-paper'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { useGuardedPush } from '@/ui/useGuardedPush'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import {
  fileByIdQuery,
  fileByIdQueryAs,
  filesByIdsQuery,
  filesByIdsQueryAs,
  folderFilesQuery,
  folderFilesQueryAs,
  folderSubfoldersQuery,
  folderSubfoldersQueryAs,
  FileQueryResult
} from '@/client/queries'
import { useSharedFileIds } from '@/client/useSharedFiles'
import { useSharedDrives } from '@/files/useSharedDrives'
import { registerSharedDrive } from '@/files/sharedDriveReplication'
import { querySharedDriveFile, SharedDriveEntry } from '@/files/sharedDrives'
import { buildSharingRows, drivesForTab, SharingRow, SharingsTab } from '@/files/sharingRows'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { BigFolderConfirmDialog } from '@/offline/BigFolderConfirmDialog'
import { openFileFromList } from '@/files/openFromList'
import { surfaceOpenError } from '@/files/errors'
import { cozyTokens } from '@/ui/theme'
import { SortControl } from '@/ui/SortControl'
import { useFolderSort } from '@/ui/useFolderSort'

export default function SharedScreen() {
  const router = useRouter()
  const guardedPush = useGuardedPush()
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
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const client = useClient()
  const offlineActions = useOfflineActions()
  const onToggleFilePin = (file: { _id: string; name: string; size?: number | null }): void => {
    const entry = OfflineFilesStore.get(file._id)
    if (entry?.isDirectPin) void offlineActions.unpin(file._id)
    else offlineActions.pin({ _id: file._id, name: file.name, size: file.size ?? null })
  }
  const onToggleFolderPin = (folder: { _id: string; name: string }): void => {
    if (OfflineFilesStore.getFolder(folder._id)) void offlineActions.unpinFolder(folder._id)
    else void offlineActions.pinFolder({ _id: folder._id, name: folder.name })
  }

  const [tab, setTab] = useState<SharingsTab>('with-me')

  const isRoot = !path || path.length === 0
  const safeCurrentDirId = isRoot ? 'io.cozy.files.root-dir' : path![path!.length - 1]

  const { sort } = useFolderSort()
  const { drives, refresh: refreshDrives } = useSharedDrives()
  const sharedIds = useSharedFileIds(tab === 'by-me' ? 'by-me' : 'with-me')
  const sharedFilesQuery = useQuery(filesByIdsQuery(sharedIds.ids), {
    as: filesByIdsQueryAs(sharedIds.ids),
    enabled: isRoot && tab !== 'drives' && sharedIds.status === 'loaded' && sharedIds.ids.length > 0
  })

  const subfoldersQuery = useQuery(folderSubfoldersQuery(safeCurrentDirId, sort), {
    as: folderSubfoldersQueryAs(safeCurrentDirId, sort),
    enabled: !isRoot
  })
  const folderFilesQ = useQuery(folderFilesQuery(safeCurrentDirId, sort), {
    as: folderFilesQueryAs(safeCurrentDirId, sort),
    enabled: !isRoot
  })

  const currentDirLookup = useQuery(fileByIdQuery(safeCurrentDirId), {
    as: fileByIdQueryAs(safeCurrentDirId),
    enabled: !isRoot
  })

  const sharedIdsRef = useRef(sharedIds)
  const sharedFilesQueryRef = useRef(sharedFilesQuery)
  const subfoldersQueryRef = useRef(subfoldersQuery)
  const folderFilesQRef = useRef(folderFilesQ)
  sharedIdsRef.current = sharedIds
  sharedFilesQueryRef.current = sharedFilesQuery
  subfoldersQueryRef.current = subfoldersQuery
  folderFilesQRef.current = folderFilesQ

  useFocusEffect(
    useCallback(() => {
      if (isRoot) {
        sharedIdsRef.current.refresh()
        // The query is disabled while the tab has no id to look up, and
        // fetching a disabled query runs it with no definition at all.
        if (sharedIdsRef.current.ids.length > 0) void sharedFilesQueryRef.current.fetch?.()
      } else {
        void subfoldersQueryRef.current.fetch()
        void folderFilesQRef.current.fetch()
      }
    }, [isRoot])
  )

  const lookupData = currentDirLookup.data
  const lookupDoc = Array.isArray(lookupData) ? lookupData[0] : lookupData
  const currentDirName = isRoot
    ? t('drive.shares')
    : ((lookupDoc as { name?: string } | null | undefined)?.name ?? '')

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (isRoot) {
        sharedIds.refresh()
        await Promise.all([
          sharedIds.ids.length > 0 ? sharedFilesQuery.fetch?.() : Promise.resolve(),
          refreshDrives()
        ])
      } else {
        await Promise.all([subfoldersQuery.fetch(), folderFilesQ.fetch()])
      }
    } finally {
      setRefreshing(false)
    }
  }, [isRoot, sharedIds, sharedFilesQuery, subfoldersQuery, folderFilesQ, refreshDrives])

  const renderFileItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item}
          onPress={folder =>
            guardedPush(`/(drive)/shared/${[...(path ?? []), folder._id].join('/')}`)
          }
          onShare={folder => router.push(`/share/${folder._id}`)}
          onMove={folder => router.push(`/move/${folder._id}`)}
          onTogglePin={onToggleFolderPin}
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => {
          if (!client) return
          void openFileFromList(client, router, file).catch(e =>
            surfaceOpenError(e, setSnackbar, t, 'SharedScreen')
          )
        }}
        onShare={file => router.push(`/share/${file._id}`)}
        onMove={file => router.push(`/move/${file._id}`)}
        onTogglePin={onToggleFilePin}
        onInfo={file => router.push(`/metadata/${file._id}`)}
      />
    )
  }

  // A drive whose root is a file opens that file, through the drive routes: it
  // is served by the owner instance, not by ours.
  const onDriveFilePress = async (drive: SharedDriveEntry): Promise<void> => {
    if (!client || !drive.rootFolderId) {
      setSnackbar(t('errors.generic'))
      return
    }
    const scope = { driveId: drive.driveId, owner: drive.owner }
    try {
      if (!drive.owner) await registerSharedDrive(client, drive.driveId)
      const doc = await querySharedDriveFile(client, scope, drive.rootFolderId)
      if (!doc) {
        setSnackbar(t('drive.sharings.driveFileSyncing'))
        return
      }
      await openFileFromList(client, router, doc, drive.owner ? undefined : drive.driveId)
    } catch (e) {
      surfaceOpenError(e, setSnackbar, t, 'SharedScreen')
    }
  }

  const onDrivePress = (drive: SharedDriveEntry): void => {
    if (!drive.rootFolderId) {
      setSnackbar(t('errors.generic'))
      return
    }
    guardedPush(`/(drive)/shareddrives/${drive.driveId}/${drive.rootFolderId}`)
  }

  const renderRow = ({
    item
  }: {
    item: SharingRow<FileQueryResult>
  }): React.ReactElement | null => {
    if (item.drive) {
      const drive = item.drive
      // A drive whose root is a single file is a document, not a folder. Its
      // content lives on the owner's instance and the viewers still resolve
      // files on ours, so opening it is not there yet (see #207).
      if (drive.rootType === 'file') {
        return (
          <FileRow
            file={{
              ...({
                _id: drive.rootFolderId ?? drive.driveId,
                name: drive.name
              } as unknown as FileQueryResult),
              size: null
            }}
            onPress={() => void onDriveFilePress(drive)}
            driveId={drive.owner ? undefined : drive.driveId}
          />
        )
      }
      return (
        <FolderRow
          folder={{ _id: drive.driveId, name: drive.name }}
          onPress={() => onDrivePress(drive)}
        />
      )
    }
    return item.file ? renderFileItem({ item: item.file }) : null
  }

  const folderListing: FileQueryResult[] = isRoot
    ? []
    : [
        ...((subfoldersQuery.data as FileQueryResult[] | null | undefined) ?? []),
        ...((folderFilesQ.data as FileQueryResult[] | null | undefined) ?? [])
      ]
  const data: FileQueryResult[] = isRoot
    ? ((sharedFilesQuery.data as FileQueryResult[] | null | undefined) ?? [])
    : folderListing

  const orgDrives = useMemo(() => drivesForTab(drives, 'drives'), [drives])

  const rows = useMemo<SharingRow<FileQueryResult>[]>(
    () =>
      buildSharingRows({
        files: data,
        drives: isRoot ? drives : [],
        tab,
        sortAttr: sort.attr,
        sortDir: sort.dir
      }),
    [data, drives, isRoot, sort.attr, sort.dir, tab]
  )

  const showsDrives = isRoot && tab === 'drives'
  const isLoading = showsDrives
    ? false
    : isRoot
      ? sharedIds.status === 'loading' ||
        (sharedIds.status === 'loaded' &&
          sharedIds.ids.length > 0 &&
          sharedFilesQuery.fetchStatus === 'loading' &&
          data.length === 0)
      : subfoldersQuery.fetchStatus === 'loading' || folderFilesQ.fetchStatus === 'loading'
  // Note: SharingProvider swallows its own fetch errors, so sharedIds no
  // longer surfaces a 'failed' state — failures of the secondary
  // filesByIdsQuery fetch still drive the failed UI here.
  const isFailed = showsDrives
    ? false
    : isRoot
      ? sharedFilesQuery.fetchStatus === 'failed'
      : subfoldersQuery.fetchStatus === 'failed' || folderFilesQ.fetchStatus === 'failed'
  const error = isRoot
    ? sharedFilesQuery.lastError
    : (subfoldersQuery.lastError ?? folderFilesQ.lastError)
  const hasNothingYet = rows.length === 0
  const retry = () => {
    if (isRoot) {
      sharedIds.refresh()
      void sharedFilesQuery.fetch?.()
    } else {
      void subfoldersQuery.fetch()
      void folderFilesQ.fetch()
    }
  }

  return (
    <ScreenContainer>
      <AppBar
        title={currentDirName}
        onBack={isRoot ? undefined : () => router.back()}
        onLogout={isRoot ? logout : undefined}
      />
      {isRoot ? (
        <SegmentedButtons
          value={tab}
          onValueChange={value => setTab(value as SharingsTab)}
          style={styles.tabs}
          buttons={[
            { value: 'with-me', label: t('drive.sharings.withMe'), testID: 'sharings-tab-with-me' },
            { value: 'by-me', label: t('drive.sharings.byMe'), testID: 'sharings-tab-by-me' },
            ...(orgDrives.length > 0
              ? [
                  {
                    value: 'drives',
                    label: t('drive.sharings.drives'),
                    testID: 'sharings-tab-drives'
                  }
                ]
              : [])
          ]}
        />
      ) : null}
      {isRoot ? (
        <View style={styles.toolbar}>
          <SortControl />
        </View>
      ) : null}
      {isLoading && hasNothingYet ? (
        <LoadingState />
      ) : isFailed ? (
        <ErrorState message={t(getErrorMessageKey(error))} onRetry={retry} />
      ) : hasNothingYet ? (
        <EmptyState
          message={t(
            showsDrives
              ? 'drive.emptySharedDrives'
              : tab === 'by-me'
                ? 'drive.emptySharedByMe'
                : 'drive.emptyShared'
          )}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.key}
          renderItem={renderRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.5}
          onEndReached={
            isRoot
              ? undefined
              : () => {
                  void subfoldersQuery.fetchMore?.()
                  void folderFilesQ.fetchMore?.()
                }
          }
        />
      )}
      <BigFolderConfirmDialog
        visible={!!offlineActions.pendingConfirmation}
        count={offlineActions.pendingConfirmation?.count ?? 0}
        bytes={offlineActions.pendingConfirmation?.bytes ?? 0}
        onConfirm={() => void offlineActions.confirmPending()}
        onCancel={offlineActions.cancelPending}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { marginHorizontal: cozyTokens.spacing.md, marginVertical: cozyTokens.spacing.sm },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: cozyTokens.spacing.sm
  },
  row: { paddingVertical: 4 }
})
