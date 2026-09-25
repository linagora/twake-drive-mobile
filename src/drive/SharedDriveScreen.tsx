import React, { useCallback, useState } from 'react'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { DriveChild, normalizeDriveChild } from './sharedDriveChild'

import { AppBar } from '@/ui/AppBar'
import { useGuardedPush } from '@/ui/useGuardedPush'
import { useTabBack } from '@/ui/useTabBack'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { FileListView } from '@/ui/FileListView'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { useAuth } from '@/auth/useAuth'
import { querySharedDriveFolder, sharedDriveRowId, SharedDriveEntry } from '@/files/sharedDrives'
import {
  getCachedSharedDrives,
  registerSharedDrive,
  syncSharedDrives
} from '@/files/sharedDriveReplication'
import { useIsOnline } from '@/network/useIsOnline'
import { FileQueryResult } from '@/client/queries'
import { useFileRowActions } from '@/files/useFileRowActions'

interface Props {
  /** Route prefix of the tab this screen is mounted in, so its own pushes stay
   *  inside that tab's stack. */
  basePath: string
}

export const SharedDriveScreen = ({ basePath }: Props): React.ReactElement => {
  const guardedPush = useGuardedPush()
  // The drive list lives on the tab this screen is mounted in, so backing out
  // of a drive returns there rather than to whatever tab came before.
  const goBack = useTabBack(basePath.replace(/\/drive$/, ''))
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const params = useLocalSearchParams<{ path?: string | string[] }>()
  const rawPath = params.path
  const path: string[] =
    rawPath === undefined
      ? []
      : Array.isArray(rawPath)
        ? rawPath.filter(s => !!s)
        : rawPath
          ? [rawPath]
          : []
  const [refreshing, setRefreshing] = useState(false)

  // path semantics:
  //   []                       → drives list (root)
  //   [driveId, folderId, ...] → inside a drive; driveId always first segment,
  //                              the last segment is the folder we render now.
  const isRoot = path.length === 0
  const driveId = path[0]
  const currentFolderId = path[path.length - 1]

  const isOnline = useIsOnline()
  const [drives, setDrives] = useState<SharedDriveEntry[] | null>(() => {
    const cached = getCachedSharedDrives()
    return cached.length > 0 ? cached : null
  })
  const [drivesError, setDrivesError] = useState<unknown>(null)
  const [drivesLoading, setDrivesLoading] = useState(false)

  const [folder, setFolder] = useState<{ name: string } | null>(null)
  const [children, setChildren] = useState<DriveChild[] | null>(null)
  const [folderError, setFolderError] = useState<unknown>(null)
  const [folderLoading, setFolderLoading] = useState(false)

  const currentDrive = (drives ?? []).find(drive => drive.driveId === driveId)
  const actions = useFileRowActions({
    screen: 'SharedDriveScreen',
    driveId: currentDrive?.owner ? undefined : driveId,
    can: { rename: false, delete: false }
  })

  const reloadDrives = useCallback(async () => {
    if (!client) return
    // The listing is a stack call: offline, the last one is all there is, and
    // it is enough to browse what already replicated.
    if (!isOnline) {
      setDrives(getCachedSharedDrives())
      return
    }
    setDrivesLoading(true)
    setDrivesError(null)
    try {
      setDrives(await syncSharedDrives(client))
    } catch (e) {
      console.error('[SharedDrives] syncSharedDrives failed', e)
      const cached = getCachedSharedDrives()
      if (cached.length > 0) setDrives(cached)
      else setDrivesError(e)
    } finally {
      setDrivesLoading(false)
    }
  }, [client, isOnline])

  const reloadFolder = useCallback(async () => {
    if (!client || !driveId || !currentFolderId) return
    setFolderLoading(true)
    setFolderError(null)
    try {
      const entry = { driveId, owner: currentDrive?.owner === true }
      if (!entry.owner) await registerSharedDrive(client, driveId)
      const res = await querySharedDriveFolder(client, entry, currentFolderId)
      if (res.folder) setFolder({ name: res.folder.name })
      setChildren(
        res.children.map(c => normalizeDriveChild(c as unknown as Record<string, unknown>))
      )
    } catch (e) {
      console.error('[SharedDrives] querySharedDriveFolder failed', e)
      setFolderError(e)
    } finally {
      setFolderLoading(false)
    }
  }, [client, driveId, currentFolderId, currentDrive?.owner])

  useFocusEffect(
    useCallback(() => {
      if (isRoot) void reloadDrives()
      else void reloadFolder()
    }, [isRoot, reloadDrives, reloadFolder])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (isRoot) await reloadDrives()
      else await reloadFolder()
    } finally {
      setRefreshing(false)
    }
  }, [isRoot, reloadDrives, reloadFolder])

  const onDrivePress = useCallback(
    (entry: SharedDriveEntry) => {
      if (!entry.rootFolderId) {
        console.error('[SharedDrives] drive without a root folder', entry.driveId)
        actions.notify(t('errors.generic'))
        return
      }
      guardedPush(`${basePath}/${entry.driveId}/${entry.rootFolderId}`)
    },
    [actions, basePath, guardedPush, t]
  )

  const renderDrive = ({ item }: { item: SharedDriveEntry }): React.ReactElement => (
    <FolderRow
      folder={{ _id: sharedDriveRowId(item), name: item.name }}
      onPress={() => onDrivePress(item)}
    />
  )

  const renderChild = ({ item }: { item: DriveChild }): React.ReactElement => {
    const doc = item as unknown as FileQueryResult
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={{ _id: item._id, name: item.name }}
          {...actions.folderProps(doc)}
          onPress={folderItem => guardedPush(`${basePath}/${[...path, folderItem._id].join('/')}`)}
        />
      )
    }
    return <FileRow file={{ ...doc, size: item.size ?? null }} {...actions.fileProps(doc)} />
  }

  // The drive's own root folder is not part of what replicates, so its name
  // comes from the drive listing.
  const title = isRoot ? t('drive.sharedDrives') : (folder?.name ?? currentDrive?.name ?? '')

  return (
    <ScreenContainer>
      <AppBar
        title={title}
        onBack={isRoot ? undefined : goBack}
        onLogout={isRoot ? logout : undefined}
      />
      {isRoot ? (
        <FileListView
          items={drives ?? []}
          keyExtractor={item => item.driveId}
          renderItem={renderDrive}
          loading={drivesLoading && drives === null}
          error={drivesError}
          onRetry={() => void reloadDrives()}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          emptyMessage="drive.emptySharedDrives"
        />
      ) : (
        <FileListView
          items={children ?? []}
          keyExtractor={item => item._id}
          renderItem={renderChild}
          loading={folderLoading && children === null}
          error={folderError}
          onRetry={() => void reloadFolder()}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          emptyMessage="drive.emptyFolder"
        />
      )}
      {actions.dialogs}
    </ScreenContainer>
  )
}
