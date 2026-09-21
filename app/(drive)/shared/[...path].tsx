import React, { useCallback, useContext, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SegmentedButtons } from 'react-native-paper'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { useGuardedPush } from '@/ui/useGuardedPush'
import { useTabBack } from '@/ui/useTabBack'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { FileListView } from '@/ui/FileListView'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { useAuth } from '@/auth/useAuth'
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
import { SharingContext } from '@/sharing/SharingProvider'
import { sharedFileLastUpdatedAt } from '@/sharing/lastUpdatedAt'
import { useSharedDrives } from '@/files/useSharedDrives'
import { registerSharedDrive } from '@/files/sharedDriveReplication'
import { querySharedDriveFile, SharedDriveEntry } from '@/files/sharedDrives'
import { buildSharingRows, drivesForTab, SharingRow, SharingsTab } from '@/files/sharingRows'
import { openFileFromList } from '@/files/openFromList'
import { useFileRowActions } from '@/files/useFileRowActions'
import { surfaceOpenError } from '@/files/errors'
import { cozyTokens } from '@/ui/theme'
import { SortControl } from '@/ui/SortControl'
import { useFolderSort } from '@/ui/useFolderSort'
import { fetchNextPage } from '@/drive/paging'

export default function SharedScreen() {
  const router = useRouter()
  const guardedPush = useGuardedPush()
  const goBack = useTabBack('/(drive)/shared')
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
  const client = useClient()
  // Renaming or trashing something someone shared with you is not offered here.
  const actions = useFileRowActions({
    screen: 'SharedScreen',
    can: { rename: false, delete: false }
  })

  const [tab, setTab] = useState<SharingsTab>('with-me')

  const isRoot = !path || path.length === 0
  const safeCurrentDirId = isRoot ? 'io.cozy.files.root-dir' : path![path!.length - 1]

  const { sort } = useFolderSort()
  const sharingContext = useContext(SharingContext)
  const { drives, refresh: refreshDrives } = useSharedDrives()
  const sharedIds = useSharedFileIds(tab === 'by-me' ? 'by-me' : 'with-me')
  const sharedFilesQuery = useQuery(filesByIdsQuery(sharedIds.ids), {
    as: filesByIdsQueryAs(sharedIds.ids),
    enabled: isRoot && tab !== 'drives' && sharedIds.status === 'loaded' && sharedIds.ids.length > 0
  })

  // The drive listing knows a drive's name and nothing else (see
  // linagora/cozy-stack#4930). When its root document is in the replica — a
  // drive the user owns, or one whose root was shared with them as a document
  // — that document is what carries the size, the date and the thumbnail.
  const driveRootIds = useMemo(
    () => drives.map(drive => drive.rootFolderId).filter((id): id is string => !!id),
    [drives]
  )
  const driveRootsQuery = useQuery(filesByIdsQuery(driveRootIds), {
    as: filesByIdsQueryAs(driveRootIds),
    enabled: isRoot && driveRootIds.length > 0
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

  const renderFileItem = ({ item }: { item: FileQueryResult }): React.ReactElement => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item}
          {...actions.folderProps(item)}
          onPress={folder =>
            guardedPush(`/(drive)/shared/${[...(path ?? []), folder._id].join('/')}`)
          }
        />
      )
    }
    return <FileRow file={{ ...item, size: item.size ?? null }} {...actions.fileProps(item)} />
  }

  // A drive whose root is a file opens that file, through the drive routes: it
  // is served by the owner instance, not by ours.
  const onDriveFilePress = async (drive: SharedDriveEntry): Promise<void> => {
    if (!client || !drive.rootFolderId) {
      actions.notify(t('errors.generic'))
      return
    }
    const scope = { driveId: drive.driveId, owner: drive.owner }
    try {
      if (!drive.owner) await registerSharedDrive(client, drive.driveId)
      const doc = await querySharedDriveFile(client, scope, drive.rootFolderId)
      if (!doc) {
        actions.notify(t('drive.sharings.driveFileSyncing'))
        return
      }
      await openFileFromList(client, router, doc, drive.owner ? undefined : drive.driveId)
    } catch (e) {
      surfaceOpenError(e, actions.notify, t, 'SharedScreen')
    }
  }

  const onDrivePress = (drive: SharedDriveEntry): void => {
    if (!drive.rootFolderId) {
      actions.notify(t('errors.generic'))
      return
    }
    guardedPush(`/(drive)/shared/drive/${drive.driveId}/${drive.rootFolderId}`)
  }

  const renderRow = ({
    item
  }: {
    item: SharingRow<FileQueryResult>
  }): React.ReactElement | null => {
    if (item.drive) {
      const drive = item.drive
      // The listing knows a drive's name and, for a file root, its mime — the
      // size and the dates are not part of it (linagora/cozy-stack#4930). When
      // the user also has the document itself, it is what the row is built on.
      const document = item.file
      // A drive whose root is a single file is a document, not a folder.
      if (drive.rootType === 'file') {
        return (
          <FileRow
            file={{
              ...(document ??
                ({
                  _id: drive.rootFolderId ?? drive.driveId,
                  name: drive.name,
                  mime: drive.mime
                } as unknown as FileQueryResult)),
              size: document?.size ?? null
            }}
            onPress={() => void onDriveFilePress(drive)}
            driveId={drive.owner ? undefined : drive.driveId}
          />
        )
      }
      return (
        <FolderRow
          folder={document ?? { _id: drive.driveId, name: drive.name }}
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
        files: [...data, ...((driveRootsQuery.data as FileQueryResult[] | null | undefined) ?? [])],
        drives: isRoot ? drives : [],
        tab,
        sortAttr: sort.attr,
        sortDir: sort.dir,
        getFileDate: file => sharedFileLastUpdatedAt(file, sharingContext.byId.get(file._id))
      }),
    [data, driveRootsQuery.data, drives, isRoot, sharingContext.byId, sort.attr, sort.dir, tab]
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
        onBack={isRoot ? undefined : goBack}
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
      <FileListView
        items={rows}
        keyExtractor={item => item.key}
        renderItem={renderRow}
        loading={isLoading}
        error={isFailed ? error : undefined}
        onRetry={retry}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        onEndReached={
          isRoot
            ? undefined
            : () => {
                fetchNextPage(subfoldersQuery)
                fetchNextPage(folderFilesQ)
              }
        }
        emptyMessage={
          showsDrives
            ? 'drive.emptySharedDrives'
            : tab === 'by-me'
              ? 'drive.emptySharedByMe'
              : 'drive.emptyShared'
        }
      />
      {actions.dialogs}
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
