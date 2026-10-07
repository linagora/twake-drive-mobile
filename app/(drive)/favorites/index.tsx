import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Snackbar } from 'react-native-paper'
import { useFocusEffect, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { useGuardedPush } from '@/ui/useGuardedPush'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { FileListView } from '@/ui/FileListView'
import { FileRow } from '@/ui/FileRow'
import { FileGridItem } from '@/ui/FileGridItem'
import { FileListToolbar } from '@/ui/FileListToolbar'
import { useGridLayout } from '@/ui/useGridLayout'
import { FolderRow } from '@/ui/FolderRow'
import { useAuth } from '@/auth/useAuth'
import { favoritesQuery, favoritesQueryAs, FileQueryResult, TRASH_DIR_ID } from '@/client/queries'
import { isFavorite } from '@/files/favorites'
import { openFileFromList } from '@/files/openFromList'
import { surfaceOpenError } from '@/files/errors'
import { fetchNextPage } from '@/drive/paging'
import { isFirstLoad } from '@/client/queryLoading'

// A trashed folder keeps its cozyMetadata.favorite flag. cozy-stack does NOT
// reliably set a top-level `trashed` boolean on it, but a trashed item always
// sits directly under the trash dir (dir_id) or somewhere under the `/.cozy_trash`
// path — check all three so none leaks into Favoris.
const isInTrash = (d: FileQueryResult): boolean =>
  d.trashed === true ||
  d.dir_id === TRASH_DIR_ID ||
  (typeof d.path === 'string' && d.path.startsWith('/.cozy_trash'))

export default function FavoritesScreen() {
  const router = useRouter()
  const guardedPush = useGuardedPush()
  const { t } = useTranslation()
  const { logout } = useAuth()
  const client = useClient()
  const { isGrid, numColumns } = useGridLayout()
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const query = useQuery(favoritesQuery(), { as: favoritesQueryAs })

  const queryRef = useRef(query)
  queryRef.current = query

  // Optimistic removal: unfavoriting writes cozyMetadata.favorite=false to Pouch,
  // but the Mango index the query reads lags a beat, so an immediate refetch still
  // returns the (stale) favorite — the row would linger until the next focus. Track
  // just-unfavorited ids and hide them right away (mirrors trash.tsx). Not reset in
  // the focus effect (that would setState during render under the test's mock); the
  // entries become redundant anyway once isFavorite filters the refreshed data.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback((): void => {
    setRefreshing(true)
    void Promise.resolve(queryRef.current.fetch()).finally(() => setRefreshing(false))
  }, [])

  useFocusEffect(
    useCallback(() => {
      void queryRef.current.fetch()
    }, [])
  )

  const renderItem = ({ item }: { item: FileQueryResult }) => {
    if (item.type === 'directory') {
      return (
        <FolderRow
          folder={{
            _id: item._id,
            _type: item._type,
            _rev: item._rev,
            name: item.name,
            cozyMetadata: item.cozyMetadata
          }}
          onPress={() => guardedPush(`/(drive)/favorites/${item._id}`)}
          onShare={folder => router.push(`/share/${folder._id}`)}
          onMove={folder => router.push(`/move/${folder._id}`)}
          onFavoriteChange={() => {
            setRemovedIds(prev => new Set(prev).add(item._id))
            void query.fetch()
          }}
        />
      )
    }
    return (
      <FileRow
        file={{ ...item, size: item.size ?? null }}
        onPress={file => {
          if (!client) return
          void openFileFromList(client, router, file).catch(e =>
            surfaceOpenError(e, setSnackbar, t, 'FavoritesScreen')
          )
        }}
        onShare={file => router.push(`/share/${file._id}`)}
        onMove={file => router.push(`/move/${file._id}`)}
        onInfo={file => router.push(`/metadata/${file._id}`)}
        onFavoriteChange={() => {
          setRemovedIds(prev => new Set(prev).add(item._id))
          void query.fetch()
        }}
      />
    )
  }

  const renderGridItem = ({ item }: { item: FileQueryResult }) => {
    const isFolder = item.type === 'directory'
    return (
      <FileGridItem
        file={item}
        onPress={file => {
          if (isFolder) {
            guardedPush(`/(drive)/favorites/${file._id}`)
            return
          }
          if (!client) return
          void openFileFromList(client, router, file).catch(e =>
            surfaceOpenError(e, setSnackbar, t, 'FavoritesScreen')
          )
        }}
        onShare={file => router.push(`/share/${file._id}`)}
        onMove={file => router.push(`/move/${file._id}`)}
        onInfo={isFolder ? undefined : file => router.push(`/metadata/${file._id}`)}
        onFavoriteChange={() => {
          setRemovedIds(prev => new Set(prev).add(item._id))
          void query.fetch()
        }}
      />
    )
  }

  // favoritesQuery's nested-favourite filter is unreliable in the offline pouch
  // replica and returns every file (favourites sort first); filter it down to
  // real favourites here (isFavorite is a strict `=== true`).
  const data = ((query.data as FileQueryResult[] | null | undefined) ?? [])
    .filter(isFavorite)
    .filter(d => !isInTrash(d))
    .filter(d => !removedIds.has(d._id))

  return (
    <ScreenContainer surface>
      <AppBar title={t('drive.favorites')} onLogout={logout} />
      <FileListToolbar sortable={false} />
      <FileListView
        items={data}
        keyExtractor={item => item._id}
        renderItem={isGrid ? renderGridItem : renderItem}
        numColumns={numColumns}
        loading={isFirstLoad(query)}
        error={query.fetchStatus === 'failed' ? query.lastError : undefined}
        onRetry={() => query.fetch()}
        refreshing={refreshing}
        onRefresh={onRefresh}
        // The query over-fetches and isFavorite filters client-side, so a page
        // can yield few or no rows while more favourites remain further down
        // the index. Keep pulling pages instead of stopping at the first cap.
        onEndReached={() => {
          fetchNextPage(query)
        }}
        emptyMessage="drive.emptyFavorites"
        emptyIcon="star"
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ScreenContainer>
  )
}
