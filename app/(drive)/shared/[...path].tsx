import React, { useCallback, useContext, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { TabBar } from '@/ui/TabBar'
import { ConfirmDialog } from '@/ui/ConfirmDialog'
import { CreateMenu } from '@/drive/CreateMenu'
import { useHasWriteAccess } from '@/sharing/useHasWriteAccess'
import { canLeave, canReshare } from '@/sharing/writeAccess'
import { isNewSharingShortcut } from '@/sharing/newShares'
import {
  fileRowHandlersFor,
  folderRowHandlersFor,
  SharingRowAccess,
  SharingRowScope
} from '@/sharing/sharingRowActions'
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
import { leaveSharing } from '@/files/sharing'
import { downloadFolder, DownloadCancelledError } from '@/files/download'
import { registerSharedDrive } from '@/files/sharedDriveReplication'
import { querySharedDriveFile, sharedDriveRowId, SharedDriveEntry } from '@/files/sharedDrives'
import {
  buildSharingRows,
  driveRowMenu,
  drivesForTab,
  SharingRow,
  SharingsTab
} from '@/files/sharingRows'
import { openFileFromList } from '@/files/openFromList'
import { useFileRowActions } from '@/files/useFileRowActions'
import { surfaceOpenError } from '@/files/errors'
import { cozyTokens } from '@/ui/theme'
import { FileListToolbar } from '@/ui/FileListToolbar'
import { FileGridItem } from '@/ui/FileGridItem'
import { useGridLayout } from '@/ui/useGridLayout'
import { useFolderSort } from '@/ui/useFolderSort'
import { fetchNextPage } from '@/drive/paging'
import { isFirstLoad } from '@/client/queryLoading'

/** What the row handlers are called with. */
type SharedDoc = { _id: string; name: string }

/** A sharing the user is about to leave, and the line that stands for it. */
interface LeaveTarget {
  name: string
  sharingId: string
  rowKey: string
}

const driveLeaveTarget = (drive: SharedDriveEntry): LeaveTarget => ({
  name: drive.name,
  sharingId: drive.driveId,
  rowKey: `drive:${drive.driveId}`
})

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
  const [leaving, setLeaving] = useState<LeaveTarget | null>(null)
  // Rows of sharings being left: gone at once, back if the stack refuses.
  const [leftKeys, setLeftKeys] = useState<ReadonlySet<string>>(() => new Set())
  const client = useClient()
  // Which of these a row offers depends on whose sharing it is, see
  // `fileRowHandlersFor`: the owner renames and trashes, a recipient does not.
  const actions = useFileRowActions({ screen: 'SharedScreen' })

  const [tab, setTab] = useState<SharingsTab>('with-me')
  const instanceUri = (client?.getStackClient().uri as string | undefined) ?? ''

  const isRoot = !path || path.length === 0
  const safeCurrentDirId = isRoot ? 'io.cozy.files.root-dir' : path![path!.length - 1]

  // The root of this tab lists sharings, not a directory: there is nothing to
  // create in until a folder is opened.
  const canWrite = useHasWriteAccess(isRoot ? undefined : safeCurrentDirId)

  const { sort } = useFolderSort()
  const { isGrid, numColumns } = useGridLayout()
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
  const refreshDrivesRef = useRef(refreshDrives)
  refreshDrivesRef.current = refreshDrives
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
        // Revoking the last recipient turns the drive back into a plain
        // folder, and the share sheet is a route away: without this the row
        // would sit there until a pull to refresh.
        void refreshDrivesRef.current()
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
          {...folderHandlers(item)}
          isNewSharing={isNewSharingShortcut(item)}
          testID={`folder-row:${item.name}`}
          onPress={folder =>
            guardedPush(`/(drive)/shared/${[...(path ?? []), folder._id].join('/')}`)
          }
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        {...fileHandlers(item)}
        isNewSharing={isNewSharingShortcut(item)}
        testID={`file-row:${item.name}`}
      />
    )
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

  const confirmLeave = async (): Promise<void> => {
    const target = leaving
    if (!client || !target) return
    setLeaving(null)
    const setLeft = (left: boolean): void =>
      setLeftKeys(previous => {
        const next = new Set(previous)
        if (left) next.add(target.rowKey)
        else next.delete(target.rowKey)
        return next
      })
    setLeft(true)
    try {
      await leaveSharing(client, target.sharingId)
      actions.notify(t('drive.sharings.leave.success', { name: target.name }))
      await Promise.all([refreshDrives(), sharingContext.refresh()])
      setLeft(false)
    } catch (e) {
      console.error('[SharedScreen] leaving the sharing failed', e)
      setLeft(false)
      actions.notify(t('drive.sharings.leave.error'))
    }
  }

  const scopeOf = (): SharingRowScope =>
    !isRoot ? 'nested' : tab === 'by-me' ? 'by-me' : 'with-me'

  // The member's rights on a shared document, read the way cozy-sharing does.
  const accessOf = (item: FileQueryResult): SharingRowAccess => {
    const state = { byId: sharingContext.byId, sharings: sharingContext.sharings }
    return {
      canReshare: canReshare(state, item._id, instanceUri),
      canLeave: canLeave(state, item._id)
    }
  }

  const leaveTargetOf = (item: FileQueryResult): LeaveTarget | null => {
    const sharingId = sharingContext.byId.get(item._id)?.sharing?._id
    return sharingId ? { name: item.name, sharingId, rowKey: item._id } : null
  }

  const downloadSharedFolder = (folder: { _id: string; name: string }): void => {
    if (!client) return
    void downloadFolder(client, folder).catch(e => {
      if (e instanceof DownloadCancelledError) return
      console.error('[SharedScreen] folder download failed', e)
      actions.notify(t('errors.generic'))
    })
  }

  const fileHandlers = (item: FileQueryResult) => {
    const target = leaveTargetOf(item)
    return fileRowHandlersFor<SharedDoc, ReturnType<typeof actions.fileProps>>(
      scopeOf(),
      actions.fileProps(item),
      accessOf(item),
      () => target && setLeaving(target)
    )
  }

  const folderHandlers = (item: FileQueryResult) => {
    const target = leaveTargetOf(item)
    return folderRowHandlersFor<SharedDoc, ReturnType<typeof actions.folderProps>>(
      scopeOf(),
      actions.folderProps(item),
      accessOf(item),
      { leave: () => target && setLeaving(target), download: downloadSharedFolder }
    )
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
                  _id: sharedDriveRowId(drive),
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
      // The owner reopens the share sheet and revokes from there; a recipient
      // leaves instead. Same split as twake-drive web's shareSharedDrive and
      // leaveSharing. Favouriting is off: the row stands for a sharing.
      const menu = driveRowMenu(drive)
      const { onShare } = actions.folderProps(
        (document ?? { _id: drive.rootFolderId ?? drive.driveId }) as FileQueryResult
      )
      return (
        <FolderRow
          folder={document ?? { _id: sharedDriveRowId(drive), name: drive.name }}
          onPress={() => onDrivePress(drive)}
          onShare={menu.canShare ? onShare : undefined}
          onLeave={menu.canLeave ? () => setLeaving(driveLeaveTarget(drive)) : undefined}
          canFavorite={false}
        />
      )
    }
    return item.file ? renderFileItem({ item: item.file }) : null
  }

  const renderGridFileItem = ({ item }: { item: FileQueryResult }): React.ReactElement => {
    const isFolder = item.type === 'directory'
    const handlers = isFolder ? folderHandlers(item) : fileHandlers(item)
    return (
      <FileGridItem
        file={item}
        {...handlers}
        isNewSharing={isNewSharingShortcut(item)}
        onPress={file => {
          if (isFolder) guardedPush(`/(drive)/shared/${[...(path ?? []), file._id].join('/')}`)
          else (handlers as ReturnType<typeof actions.fileProps>).onPress(file)
        }}
      />
    )
  }

  // The grid counterpart of renderRow: same rows, same menus, drawn as tiles.
  const renderGridRow = ({
    item
  }: {
    item: SharingRow<FileQueryResult>
  }): React.ReactElement | null => {
    if (!item.drive) return item.file ? renderGridFileItem({ item: item.file }) : null
    const drive = item.drive
    const document = item.file
    if (drive.rootType === 'file') {
      return (
        <FileGridItem
          file={{
            ...(document ??
              ({
                _id: sharedDriveRowId(drive),
                _type: 'io.cozy.files',
                type: 'file',
                name: drive.name,
                mime: drive.mime
              } as FileQueryResult)),
            size: document?.size ?? null
          }}
          onPress={() => void onDriveFilePress(drive)}
        />
      )
    }
    const menu = driveRowMenu(drive)
    const { onShare } = actions.folderProps(
      (document ?? { _id: drive.rootFolderId ?? drive.driveId }) as FileQueryResult
    )
    return (
      <FileGridItem
        file={
          document ??
          ({
            _id: sharedDriveRowId(drive),
            _type: 'io.cozy.files',
            type: 'directory',
            name: drive.name
          } as FileQueryResult)
        }
        onPress={() => onDrivePress(drive)}
        onShare={menu.canShare ? onShare : undefined}
        onLeave={menu.canLeave ? () => setLeaving(driveLeaveTarget(drive)) : undefined}
        canFavorite={false}
      />
    )
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

  const builtRows = useMemo<SharingRow<FileQueryResult>[]>(
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

  const rows = useMemo(() => builtRows.filter(row => !leftKeys.has(row.key)), [builtRows, leftKeys])

  const showsDrives = isRoot && tab === 'drives'
  const isLoading = showsDrives
    ? false
    : isRoot
      ? sharedIds.status === 'loading' ||
        (sharedIds.status === 'loaded' && sharedIds.ids.length > 0 && isFirstLoad(sharedFilesQuery))
      : isFirstLoad(subfoldersQuery, folderFilesQ)
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
    <ScreenContainer surface>
      <AppBar
        title={currentDirName}
        onBack={isRoot ? undefined : goBack}
        onLogout={isRoot ? logout : undefined}
        showSearch
      />
      {isRoot ? (
        <TabBar<SharingsTab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'with-me', label: t('drive.sharings.withMe'), testID: 'sharings-tab-with-me' },
            { value: 'by-me', label: t('drive.sharings.byMe'), testID: 'sharings-tab-by-me' },
            ...(orgDrives.length > 0
              ? [
                  {
                    value: 'drives' as const,
                    label: t('drive.sharings.drives'),
                    testID: 'sharings-tab-drives'
                  }
                ]
              : [])
          ]}
        />
      ) : null}
      <FileListToolbar sortable={isRoot} />
      <FileListView
        items={rows}
        keyExtractor={item => item.key}
        renderItem={isGrid ? renderGridRow : renderRow}
        numColumns={numColumns}
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
      <CreateMenu dirId={safeCurrentDirId} canWrite={canWrite} notify={actions.notify} />
      <ConfirmDialog
        visible={leaving !== null}
        destructive
        title={t('drive.sharings.leave.confirmTitle')}
        message={t('drive.sharings.leave.confirmBody', { name: leaving?.name ?? '' })}
        confirmLabel={t('drive.sharings.leave.confirm')}
        testID="confirm-leave-drive"
        onConfirm={() => void confirmLeave()}
        onDismiss={() => setLeaving(null)}
      />
      {actions.dialogs}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { paddingVertical: 4 }
})
