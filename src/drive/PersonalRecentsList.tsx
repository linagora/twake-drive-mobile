import React from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/auth/useAuth'
import { FileQueryResult } from '@/client/queries'
import { surfaceOpenError } from '@/files/errors'
import { makeFolderRoute } from '@/files/folderRoute'
import { isInTrash } from '@/files/isInTrash'
import { hasRecentActions, isUnreadableRecent, makeNoAccessRoute } from '@/files/personalRecents'
import { useFileRowActions } from '@/files/useFileRowActions'
import { useOpenFile } from '@/files/useOpenFile'
import { AppBar } from '@/ui/AppBar'
import { EmptyState } from '@/ui/EmptyState'
import { FileGridItem } from '@/ui/FileGridItem'
import { FileListToolbar } from '@/ui/FileListToolbar'
import { FileListView } from '@/ui/FileListView'
import { FileRow } from '@/ui/FileRow'
import { FolderRow } from '@/ui/FolderRow'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { useGridLayout } from '@/ui/useGridLayout'

const SCREEN = 'PersonalRecentsScreen'

interface PersonalRecentsListProps {
  rows: FileQueryResult[]
  isLoading: boolean
  isRefreshing: boolean
  /** The stack serves the recents and they are not kept on the device. */
  isOffline: boolean
  /** Shown instead of the list, which has no row to keep. */
  error: unknown
  onRetry: () => void
  onRefresh: () => void
  onEndReached: () => void
}

export const PersonalRecentsList = ({
  rows,
  isLoading,
  isRefreshing,
  isOffline,
  error,
  onRetry,
  onRefresh,
  onEndReached
}: PersonalRecentsListProps): React.ReactElement => {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const router = useRouter()
  const openFile = useOpenFile()
  const actions = useFileRowActions({ screen: SCREEN })
  const { isGrid, numColumns } = useGridLayout()

  const openRow = (item: FileQueryResult): void => {
    if (isUnreadableRecent(item)) {
      router.push(makeNoAccessRoute(item))
      return
    }
    if (item.type === 'directory') {
      if (!isInTrash(item)) router.push(makeFolderRoute(item))
      return
    }
    void openFile(item, { driveId: item.driveId }).catch(e =>
      surfaceOpenError(e, actions.notify, t, SCREEN)
    )
  }

  const renderItem = ({ item }: { item: FileQueryResult }): React.ReactElement => {
    const handlers = !hasRecentActions(item)
      ? {}
      : item.type === 'directory'
        ? actions.folderProps(item)
        : actions.fileProps(item)
    const handlePress = (): void => openRow(item)
    if (isGrid) return <FileGridItem file={item} {...handlers} onPress={handlePress} />
    if (item.type === 'directory') {
      return <FolderRow folder={item} {...handlers} onPress={handlePress} />
    }
    return (
      <FileRow file={{ ...item, size: item.size ?? null }} {...handlers} onPress={handlePress} />
    )
  }

  return (
    <ScreenContainer surface>
      <AppBar title={t('drive.recent')} onLogout={logout} />
      <FileListToolbar sortable={false} />
      {isOffline && <EmptyState message={t('drive.recentsUnavailableOffline')} />}
      {!isOffline && (
        <FileListView
          items={rows}
          keyExtractor={item => item._id}
          numColumns={numColumns}
          renderItem={renderItem}
          loading={isLoading}
          error={error}
          refreshing={isRefreshing}
          emptyMessage="drive.emptyRecent"
          onRetry={onRetry}
          onRefresh={onRefresh}
          onEndReached={onEndReached}
        />
      )}
      {actions.dialogs}
    </ScreenContainer>
  )
}
