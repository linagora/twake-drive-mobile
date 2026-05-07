import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { FileMetadataSheet, FileMetadataSheetHandle } from '@/ui/FileMetadataSheet'
import { ShareSheet, ShareSheetHandle } from '@/ui/ShareSheet'
import { useAuth } from '@/auth/useAuth'
import { getErrorMessageKey } from '@/utils/errorMessages'
import { fetchSharedDrives, SharedDriveEntry } from '@/files/sharedDrives'
import {
  fileByIdQuery,
  fileByIdQueryAs,
  folderContentsQuery,
  folderContentsQueryAs,
  FileQueryResult
} from '@/client/queries'

export default function SharedDrivesScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
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
  const sheetRef = useRef<FileMetadataSheetHandle>(null)
  const shareRef = useRef<ShareSheetHandle>(null)
  const [refreshing, setRefreshing] = useState(false)

  const isRoot = !path || path.length === 0
  // At the root of the Drives tab the cozy-stack returns shortcut docs in
  // shared-drives-dir; the real list of shared drives comes from the dedicated
  // `/sharings/drives` endpoint (mirrors twake-drive web's useSharedDrives).
  // Inside a drive we fall back to the regular folder listing on the drive's
  // root folder _id.
  const currentDirId = isRoot ? null : path![path!.length - 1]

  const folderQuery = useQuery(
    currentDirId ? folderContentsQuery(currentDirId) : folderContentsQuery('__noop__'),
    {
      as: currentDirId ? folderContentsQueryAs(currentDirId) : folderContentsQueryAs('__noop__'),
      enabled: !isRoot
    }
  )

  const currentDirLookup = useQuery(fileByIdQuery(currentDirId ?? '__noop__'), {
    as: fileByIdQueryAs(currentDirId ?? '__noop__'),
    enabled: !isRoot
  })
  const lookupData = currentDirLookup.data
  const lookupDoc = Array.isArray(lookupData) ? lookupData[0] : lookupData
  const currentDirName = isRoot
    ? t('drive.sharedDrives')
    : ((lookupDoc as { name?: string } | null | undefined)?.name ?? '')

  const [drives, setDrives] = useState<SharedDriveEntry[] | null>(null)
  const [drivesError, setDrivesError] = useState<unknown>(null)
  const [drivesLoading, setDrivesLoading] = useState(false)

  const reloadDrives = useCallback(async () => {
    if (!client) return
    setDrivesLoading(true)
    setDrivesError(null)
    try {
      const list = await fetchSharedDrives(client)
      setDrives(list)
    } catch (e) {
      console.error('[SharedDrivesScreen] fetchSharedDrives failed', e)
      setDrivesError(e)
    } finally {
      setDrivesLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (isRoot) void reloadDrives()
  }, [isRoot, reloadDrives])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (isRoot) {
        await reloadDrives()
      } else {
        await folderQuery.fetch()
      }
    } finally {
      setRefreshing(false)
    }
  }, [isRoot, reloadDrives, folderQuery])

  const renderItem = ({ item }: { item: FileQueryResult | SharedDriveEntry }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={item as FileQueryResult}
          onPress={folder =>
            router.push(`/(drive)/shareddrives/${[...(path ?? []), folder._id].join('/')}`)
          }
          onShare={folder =>
            shareRef.current?.present({
              _id: folder._id,
              name: folder.name,
              type: 'directory'
            })
          }
        />
      )
    }
    const fileItem = item as FileQueryResult
    return (
      <FileRow
        file={{ ...fileItem, size: fileItem.size ?? null }}
        onPress={file =>
          sheetRef.current?.present({
            ...file,
            cozyMetadata: fileItem.cozyMetadata,
            path: fileItem.path
          })
        }
      />
    )
  }

  const isLoading = isRoot ? drivesLoading && drives === null : folderQuery.fetchStatus === 'loading'
  const hasFailed = isRoot ? !!drivesError : folderQuery.fetchStatus === 'failed'
  const errorObj = isRoot ? drivesError : folderQuery.lastError
  const data: Array<FileQueryResult | SharedDriveEntry> = isRoot
    ? (drives ?? [])
    : ((folderQuery.data as FileQueryResult[] | null | undefined) ?? [])

  return (
    <View style={styles.container}>
      <AppBar
        title={currentDirName}
        onBack={isRoot ? undefined : () => router.back()}
        onLogout={isRoot ? logout : undefined}
      />
      {isLoading && data.length === 0 ? (
        <LoadingState />
      ) : hasFailed ? (
        <ErrorState
          message={t(getErrorMessageKey(errorObj))}
          onRetry={() => (isRoot ? void reloadDrives() : folderQuery.fetch())}
        />
      ) : data.length === 0 ? (
        <EmptyState message={t('drive.emptySharedDrives')} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => (isRoot ? undefined : folderQuery.fetchMore?.())}
        />
      )}
      <FileMetadataSheet
        ref={sheetRef}
        onShareRequested={file => shareRef.current?.present(file)}
      />
      <ShareSheet ref={shareRef} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
