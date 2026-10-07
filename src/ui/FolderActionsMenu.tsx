import React from 'react'
import { IconButton } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { BottomDrawer, BottomDrawerItem } from '@/ui/BottomDrawer'
import { useActionsDrawer } from '@/ui/useActionsDrawer'
import { CozyIcon } from '@/ui/icons/CozyIcon'
import { useIsOnline } from '@/network/useIsOnline'
import { useOfflineFolderState } from '@/offline/useOfflineState'
import { isKeepOfflineEnabled } from '@/offline/keepOfflineFlag'
import { isFavorite, toggleFavorite } from '@/files/favorites'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { FileTypeIcon } from '@/ui/icons/FileTypeIcon'
import type { FolderItem } from './FolderRow'

interface Props {
  folder: FolderItem
  onShare?: (folder: FolderItem) => void
  onRename?: (folder: FolderItem) => void
  onRestore?: (folder: FolderItem) => void
  /** Trash only: deletes the folder for good, after a confirmation. */
  onDestroy?: (folder: FolderItem) => void
  onDelete?: (folder: FolderItem) => void
  onTogglePin?: (folder: FolderItem) => void
  onMove?: (folder: FolderItem) => void
  /** Recipient side of a shared drive: the owner revokes from the share sheet,
   *  a recipient leaves instead. Mirrors twake-drive web's leaveSharedDrive. */
  onLeave?: (folder: FolderItem) => void
  onFavoriteChange?: () => void
  /** A shared drive row stands for a sharing, not for a document of ours:
   *  favouriting it would write on a doc the list does not really hold. */
  canFavorite?: boolean
  /** Anchor testID, so a list row and a grid tile can be told apart in tests. */
  testID?: string
}

/**
 * The 3-dot action menu for a folder, shared by the list row and the grid tile
 * so both offer the same actions.
 */
export const FolderActionsMenu = ({
  folder,
  onShare,
  onRename,
  onRestore,
  onDestroy,
  onDelete,
  onTogglePin,
  onMove,
  onLeave,
  onFavoriteChange,
  canFavorite = true,
  testID
}: Props): React.ReactElement => {
  const { t } = useTranslation()
  const client = useClient()
  const isOnline = useIsOnline()
  const drawer = useActionsDrawer()
  const isPinned = useOfflineFolderState(folder._id).pinned

  const favorite = isFavorite(folder as Parameters<typeof isFavorite>[0])

  return (
    <>
      <IconButton
        icon={p => <CozyIcon name="dotsHorizontal" size={p?.size ?? 24} color={p?.color} />}
        onPress={drawer.open}
        accessibilityLabel={t('a11y.folderActions', { name: folder.name })}
        testID={testID ?? `folder-actions:${folder.name}`}
      />
      <BottomDrawer
        visible={drawer.visible}
        onClose={drawer.close}
        onDismissed={drawer.onDismissed}
        title={folder.name}
        headerIcon={<FileTypeIcon icon="folder" size={32} />}
      >
        {onTogglePin && isKeepOfflineEnabled() ? (
          <BottomDrawerItem
            icon="cloudOutline"
            label={t(isPinned ? 'drive.offline.unpin' : 'drive.offline.pin')}
            testID={isPinned ? 'action-unpin' : 'action-pin'}
            disabled={!isPinned && !isOnline}
            onPress={() => drawer.run(() => onTogglePin(folder))}
          />
        ) : null}
        {onShare ? (
          <BottomDrawerItem
            icon="share"
            label={t('drive.fileMeta.share')}
            testID="action-share"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onShare(folder))}
          />
        ) : null}
        {onRename ? (
          <BottomDrawerItem
            icon="rename"
            label={t('drive.fileMeta.rename')}
            testID="action-rename"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onRename(folder))}
          />
        ) : null}
        {onRestore ? (
          <BottomDrawerItem
            icon="restore"
            label={t('drive.trashActions.restore')}
            testID="action-restore"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onRestore(folder))}
          />
        ) : null}
        {onDestroy ? (
          <BottomDrawerItem
            icon="trash"
            label={t('drive.trashActions.destroy')}
            testID="action-destroy"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onDestroy(folder))}
          />
        ) : null}
        {onDelete ? (
          <BottomDrawerItem
            icon="trash"
            label={t('drive.fileMeta.delete')}
            testID="action-delete"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onDelete(folder))}
          />
        ) : null}
        {onMove ? (
          <BottomDrawerItem
            icon="moveto"
            label={t('drive.fileMeta.move')}
            testID="action-move"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onMove(folder))}
          />
        ) : null}
        {canFavorite ? (
          <BottomDrawerItem
            icon={favorite ? 'star' : 'starOutline'}
            label={t(favorite ? 'drive.fileMeta.unfavorite' : 'drive.fileMeta.favorite')}
            testID="action-favorite"
            disabled={!isOnline}
            onPress={() =>
              drawer.run(() => {
                if (!client) return
                void toggleFavorite(
                  client,
                  folder as Parameters<typeof toggleFavorite>[1],
                  !favorite
                )
                  .then(() => {
                    triggerPouchReplication(client)
                    onFavoriteChange?.()
                  })
                  .catch(e => console.error('[FolderRow] toggleFavorite failed', e))
              })
            }
          />
        ) : null}
        {onLeave ? (
          <BottomDrawerItem
            icon="logout"
            label={t('drive.sharings.leave.action')}
            destructive
            testID="action-leave-drive"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onLeave(folder))}
          />
        ) : null}
      </BottomDrawer>
    </>
  )
}

/** Whether any action is available, i.e. whether the menu is worth rendering. */
export const hasFolderActions = (props: Omit<Props, 'folder' | 'testID'>): boolean =>
  !!props.onShare ||
  !!props.onRename ||
  !!props.onRestore ||
  !!props.onDestroy ||
  !!props.onDelete ||
  (!!props.onTogglePin && isKeepOfflineEnabled()) ||
  !!props.onMove ||
  !!props.onLeave
