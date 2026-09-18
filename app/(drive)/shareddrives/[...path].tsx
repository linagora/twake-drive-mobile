import React, { useCallback, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'
import { Snackbar } from 'react-native-paper'

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
import { querySharedDriveFolder, SharedDriveEntry } from '@/files/sharedDrives'
import {
  getCachedSharedDrives,
  registerSharedDrive,
  syncSharedDrives
} from '@/files/sharedDriveReplication'
import { useIsOnline } from '@/network/useIsOnline'
import { FileQueryResult } from '@/client/queries'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { BigFolderConfirmDialog } from '@/offline/BigFolderConfirmDialog'
import { openFileFromList } from '@/files/openFromList'
import { surfaceOpenError } from '@/files/errors'

interface DriveChild {
  _id: string
  name: string
  type: 'file' | 'directory'
  size?: number | null
  mime?: string
  class?: string
  updated_at?: string
  path?: string
  cozyMetadata?: { createdBy?: { account?: string } }
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

const normalizeChild = (raw: Record<string, unknown>): DriveChild => {
  const attrs = (raw.attributes ?? {}) as Record<string, unknown>
  const id = (raw._id ?? raw.id ?? '') as string
  const type = (attrs.type ?? raw.type ?? 'file') as 'file' | 'directory'
  return {
    _id: id,
    name: (attrs.name ?? raw.name ?? '') as string,
    type,
    size:
      typeof attrs.size === 'number'
        ? (attrs.size as number)
        : typeof attrs.size === 'string'
          ? Number(attrs.size)
          : null,
    mime: (attrs.mime ?? raw.mime) as string | undefined,
    class: (attrs.class ?? raw.class) as string | undefined,
    updated_at: (attrs.updated_at ?? raw.updated_at) as string | undefined,
    path: (attrs.path ?? raw.path) as string | undefined,
    cozyMetadata: (attrs.cozyMetadata ?? raw.cozyMetadata) as DriveChild['cozyMetadata'],
    links: raw.links as DriveChild['links']
  }
}

export default function SharedDrivesScreen() {
  const router = useRouter()
  const guardedPush = useGuardedPush()
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
  const [resolveError, setResolveError] = useState<string | null>(null)
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
      setChildren(res.children.map(c => normalizeChild(c as unknown as Record<string, unknown>)))
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
        setResolveError(t('errors.generic'))
        return
      }
      guardedPush(`/(drive)/shareddrives/${entry.driveId}/${entry.rootFolderId}`)
    },
    [guardedPush, t]
  )

  const renderDrive = ({ item }: { item: SharedDriveEntry }) => (
    <FolderRow folder={{ _id: item.driveId, name: item.name }} onPress={() => onDrivePress(item)} />
  )

  const renderChild = ({ item }: { item: DriveChild }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={{ _id: item._id, name: item.name }}
          onPress={folderItem =>
            guardedPush(`/(drive)/shareddrives/${[...path, folderItem._id].join('/')}`)
          }
          onShare={folderItem => router.push(`/share/${folderItem._id}`)}
          onMove={folderItem => router.push(`/move/${folderItem._id}`)}
          onTogglePin={onToggleFolderPin}
        />
      )
    }
    return (
      <FileRow
        file={{ ...(item as unknown as FileQueryResult), size: item.size ?? null }}
        onPress={file => {
          if (!client) return
          void openFileFromList(
            client,
            router,
            file,
            currentDrive?.owner ? undefined : driveId
          ).catch(e => surfaceOpenError(e, setResolveError, t, 'SharedDrives'))
        }}
        onMove={file => router.push(`/move/${file._id}`)}
        onTogglePin={onToggleFilePin}
        onInfo={file => router.push(`/metadata/${file._id}`)}
        driveId={currentDrive?.owner ? undefined : driveId}
      />
    )
  }

  const isLoading = isRoot ? drivesLoading && drives === null : folderLoading && children === null
  const hasFailed = isRoot ? !!drivesError : !!folderError
  const errorObj = isRoot ? drivesError : folderError
  const dataLength = isRoot ? (drives?.length ?? 0) : (children?.length ?? 0)
  // The drive's own root folder is not part of what replicates, so its name
  // comes from the drive listing.
  const title = isRoot ? t('drive.sharedDrives') : (folder?.name ?? currentDrive?.name ?? '')

  return (
    <ScreenContainer>
      <AppBar
        title={title}
        onBack={isRoot ? undefined : () => router.back()}
        onLogout={isRoot ? logout : undefined}
      />
      {isLoading ? (
        <LoadingState />
      ) : hasFailed ? (
        <ErrorState
          message={t(getErrorMessageKey(errorObj))}
          onRetry={() => (isRoot ? void reloadDrives() : void reloadFolder())}
        />
      ) : dataLength === 0 ? (
        <EmptyState message={t(isRoot ? 'drive.emptySharedDrives' : 'drive.emptyFolder')} />
      ) : isRoot ? (
        <FlatList
          data={drives ?? []}
          keyExtractor={item => item.driveId}
          renderItem={renderDrive}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      ) : (
        <FlatList
          data={children ?? []}
          keyExtractor={item => item._id}
          renderItem={renderChild}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
      <BigFolderConfirmDialog
        visible={!!offlineActions.pendingConfirmation}
        count={offlineActions.pendingConfirmation?.count ?? 0}
        bytes={offlineActions.pendingConfirmation?.bytes ?? 0}
        onConfirm={() => void offlineActions.confirmPending()}
        onCancel={offlineActions.cancelPending}
      />
      <Snackbar visible={!!resolveError} onDismiss={() => setResolveError(null)} duration={3000}>
        {resolveError ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
