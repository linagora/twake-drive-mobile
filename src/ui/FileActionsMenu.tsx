import React from 'react'
import { IconButton } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { BottomDrawer, BottomDrawerItem } from '@/ui/BottomDrawer'
import { useActionsDrawer } from '@/ui/useActionsDrawer'
import { CozyIcon } from '@/ui/icons/CozyIcon'
import { useIsOnline } from '@/network/useIsOnline'
import { useOfflineState } from '@/offline/useOfflineState'
import { isKeepOfflineEnabled } from '@/offline/keepOfflineFlag'
import { isFavorite, toggleFavorite } from '@/files/favorites'
import { download, DownloadCancelledError } from '@/files/download'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { FileThumbnail } from './FileThumbnail'
import type { FileItem } from './FileRow'

interface Props {
  file: FileItem
  onShare?: (file: FileItem) => void
  onRename?: (file: FileItem) => void
  onRestore?: (file: FileItem) => void
  /** Trash only: deletes the file for good, after a confirmation. */
  onDestroy?: (file: FileItem) => void
  onDelete?: (file: FileItem) => void
  onTogglePin?: (file: FileItem) => void
  /** Set inside a shared drive: the download goes through the drive route. */
  driveId?: string
  onMove?: (file: FileItem) => void
  onInfo?: (file: FileItem) => void
  /** A file somebody shared with us: leaves the sharing (`revokeSelf`). */
  onLeave?: (file: FileItem) => void
  onFavoriteChange?: () => void
  /** Off for a trashed file: it has to be restored before it can be a favorite. */
  canFavorite?: boolean
  /** Anchor testID, so a list row and a grid tile can be told apart in tests. */
  testID?: string
}

/**
 * The 3-dot action menu for a file, shared by the list row and the grid tile
 * so both offer the same actions.
 */
export const FileActionsMenu = ({
  file,
  onShare,
  onRename,
  onRestore,
  onDestroy,
  onDelete,
  onTogglePin,
  driveId,
  onMove,
  onInfo,
  onLeave,
  onFavoriteChange,
  canFavorite = true,
  testID
}: Props): React.ReactElement => {
  const { t } = useTranslation()
  const client = useClient()
  const isOnline = useIsOnline()
  const drawer = useActionsDrawer()
  const offlineEntry = useOfflineState(file._id)
  // "Remove from offline" only applies to a DIRECT pin: a file that is offline
  // because its parent folder is pinned must offer "Keep offline" instead.
  const isDirectPin = !!offlineEntry?.isDirectPin
  // A download reads the blob of a file kept offline and falls back to the
  // stack for anything else, so offline it is offered only for the first.
  const isDownloadable = isOnline || offlineEntry?.state === 'downloaded'

  const favorite = isFavorite(file as Parameters<typeof isFavorite>[0])

  return (
    <>
      <IconButton
        icon={p => <CozyIcon name="dotsHorizontal" size={p?.size ?? 24} color={p?.color} />}
        onPress={drawer.open}
        accessibilityLabel={t('a11y.fileActions', { name: file.name })}
        testID={testID ?? `file-actions:${file.name}`}
      />
      <BottomDrawer
        visible={drawer.visible}
        onClose={drawer.close}
        onDismissed={drawer.onDismissed}
        title={file.name}
        headerIcon={<FileThumbnail file={file} size={32} />}
      >
        {onTogglePin && isKeepOfflineEnabled() ? (
          <BottomDrawerItem
            icon="cloudOutline"
            label={t(isDirectPin ? 'drive.offline.unpin' : 'drive.offline.pin')}
            testID={isDirectPin ? 'action-unpin' : 'action-pin'}
            disabled={!isDirectPin && !isOnline}
            onPress={() => drawer.run(() => onTogglePin(file))}
          />
        ) : null}
        {onShare ? (
          <BottomDrawerItem
            icon="shareOutline"
            label={t('drive.fileMeta.share')}
            testID="action-share"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onShare(file))}
          />
        ) : null}
        {onRename ? (
          <BottomDrawerItem
            icon="renameOutline"
            label={t('drive.fileMeta.rename')}
            testID="action-rename"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onRename(file))}
          />
        ) : null}
        {onRestore ? (
          <BottomDrawerItem
            icon="restoreOutline"
            label={t('drive.trashActions.restore')}
            testID="action-restore"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onRestore(file))}
          />
        ) : null}
        {onDestroy ? (
          <BottomDrawerItem
            icon="trashOutline"
            label={t('drive.trashActions.destroy')}
            testID="action-destroy"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onDestroy(file))}
          />
        ) : null}
        {onDelete ? (
          <BottomDrawerItem
            icon="trashOutline"
            label={t('drive.fileMeta.delete')}
            testID="action-delete"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onDelete(file))}
          />
        ) : null}
        {onMove ? (
          <BottomDrawerItem
            icon="movetoOutline"
            label={t('drive.fileMeta.move')}
            testID="action-move"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onMove(file))}
          />
        ) : null}
        {onInfo ? (
          <BottomDrawerItem
            icon="infoOutline"
            label={t('drive.fileMeta.info')}
            testID="action-info"
            onPress={() => drawer.run(() => onInfo(file))}
          />
        ) : null}
        {canFavorite ? (
          <BottomDrawerItem
            icon="starOutline"
            label={t(favorite ? 'drive.fileMeta.unfavorite' : 'drive.fileMeta.favorite')}
            testID="action-favorite"
            disabled={!isOnline}
            onPress={() =>
              drawer.run(() => {
                if (!client) return
                void toggleFavorite(client, file as Parameters<typeof toggleFavorite>[1], !favorite)
                  .then(() => {
                    triggerPouchReplication(client)
                    onFavoriteChange?.()
                  })
                  .catch(e => console.error('[FileRow] toggleFavorite failed', e))
              })
            }
          />
        ) : null}
        <BottomDrawerItem
          icon="downloadOutline"
          label={t('drive.fileMeta.download')}
          testID="action-download"
          disabled={!isDownloadable}
          onPress={() =>
            drawer.run(() => {
              if (!client) return
              void download(client, file, driveId).catch(e => {
                if (e instanceof DownloadCancelledError) return
                console.error('[FileActionsMenu] download failed', e)
              })
            })
          }
        />
        {onLeave ? (
          <BottomDrawerItem
            icon="logoutOutline"
            label={t('drive.sharings.leave.action')}
            destructive
            testID="action-leave"
            disabled={!isOnline}
            onPress={() => drawer.run(() => onLeave(file))}
          />
        ) : null}
      </BottomDrawer>
    </>
  )
}

/** Whether any action is available, i.e. whether the menu is worth rendering. */
export const hasFileActions = (props: Omit<Props, 'file' | 'testID'>): boolean =>
  !!props.onShare ||
  !!props.onRename ||
  !!props.onRestore ||
  !!props.onDestroy ||
  !!props.onDelete ||
  (!!props.onTogglePin && isKeepOfflineEnabled()) ||
  !!props.onMove ||
  !!props.onInfo ||
  !!props.onLeave
