import React, { useState } from 'react'
import { IconButton, Menu, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { useIsOnline } from '@/network/useIsOnline'
import { useOfflineState } from '@/offline/useOfflineState'
import { isFavorite, toggleFavorite } from '@/files/favorites'
import { download } from '@/files/download'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import type { FileItem } from './FileRow'

interface Props {
  file: FileItem
  onShare?: (file: FileItem) => void
  onRename?: (file: FileItem) => void
  onRestore?: (file: FileItem) => void
  onDelete?: (file: FileItem) => void
  onTogglePin?: (file: FileItem) => void
  /** Set inside a shared drive: the download goes through the drive route. */
  driveId?: string
  onMove?: (file: FileItem) => void
  onInfo?: (file: FileItem) => void
  onFavoriteChange?: () => void
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
  onDelete,
  onTogglePin,
  driveId,
  onMove,
  onInfo,
  onFavoriteChange,
  testID
}: Props): React.ReactElement => {
  const { t } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const isOnline = useIsOnline()
  const [menuVisible, setMenuVisible] = useState(false)
  const offlineEntry = useOfflineState(file._id)
  // "Remove from offline" only applies to a DIRECT pin: a file that is offline
  // because its parent folder is pinned must offer "Keep offline" instead.
  const isDirectPin = !!offlineEntry?.isDirectPin

  return (
    <Menu
      visible={menuVisible}
      onDismiss={() => setMenuVisible(false)}
      anchor={
        <IconButton
          icon={p => <CozyIcon name="dotsVertical" size={p?.size ?? 24} color={p?.color} />}
          onPress={() => setMenuVisible(true)}
          accessibilityLabel={t('a11y.fileActions')}
          testID={testID ?? 'file-actions'}
        />
      }
    >
      {onTogglePin ? (
        <Menu.Item
          leadingIcon={() => <CozyIcon name="cloud2" size={24} color={theme.colors.onSurface} />}
          title={t(isDirectPin ? 'drive.offline.unpin' : 'drive.offline.pin')}
          disabled={!isDirectPin && !isOnline}
          onPress={() => {
            setMenuVisible(false)
            onTogglePin(file)
          }}
        />
      ) : null}
      {onShare ? (
        <Menu.Item
          leadingIcon={() => (
            <CozyIcon name="shareExternal" size={24} color={theme.colors.onSurface} />
          )}
          title={t('drive.fileMeta.share')}
          disabled={!isOnline}
          onPress={() => {
            setMenuVisible(false)
            onShare(file)
          }}
        />
      ) : null}
      {onRename ? (
        <Menu.Item
          leadingIcon={() => <CozyIcon name="rename" size={24} color={theme.colors.onSurface} />}
          title={t('drive.fileMeta.rename')}
          disabled={!isOnline}
          onPress={() => {
            setMenuVisible(false)
            onRename(file)
          }}
        />
      ) : null}
      {onRestore ? (
        <Menu.Item
          leadingIcon={() => <CozyIcon name="restore" size={24} color={theme.colors.onSurface} />}
          title={t('drive.trashActions.restore')}
          disabled={!isOnline}
          onPress={() => {
            setMenuVisible(false)
            onRestore(file)
          }}
        />
      ) : null}
      {onDelete ? (
        <Menu.Item
          leadingIcon={() => <CozyIcon name="trash" size={24} color={theme.colors.onSurface} />}
          title={t('drive.fileMeta.delete')}
          disabled={!isOnline}
          onPress={() => {
            setMenuVisible(false)
            onDelete(file)
          }}
        />
      ) : null}
      {onMove ? (
        <Menu.Item
          leadingIcon={() => <CozyIcon name="moveto" size={24} color={theme.colors.onSurface} />}
          title={t('drive.fileMeta.move')}
          disabled={!isOnline}
          onPress={() => {
            setMenuVisible(false)
            onMove(file)
          }}
        />
      ) : null}
      {onInfo ? (
        <Menu.Item
          leadingIcon={() => <CozyIcon name="info" size={24} color={theme.colors.onSurface} />}
          title={t('drive.fileMeta.info')}
          onPress={() => {
            setMenuVisible(false)
            onInfo(file)
          }}
        />
      ) : null}
      <Menu.Item
        disabled={!isOnline}
        leadingIcon={() => (
          <CozyIcon
            name={isFavorite(file as Parameters<typeof isFavorite>[0]) ? 'star' : 'starOutline'}
            size={24}
            color={theme.colors.onSurface}
          />
        )}
        title={t(
          isFavorite(file as Parameters<typeof isFavorite>[0])
            ? 'drive.fileMeta.unfavorite'
            : 'drive.fileMeta.favorite'
        )}
        onPress={() => {
          setMenuVisible(false)
          if (!client) return
          const next = !isFavorite(file as Parameters<typeof isFavorite>[0])
          void toggleFavorite(client, file as Parameters<typeof toggleFavorite>[1], next)
            .then(() => {
              triggerPouchReplication(client)
              onFavoriteChange?.()
            })
            .catch(e => console.error('[FileRow] toggleFavorite failed', e))
        }}
      />
      <Menu.Item
        leadingIcon={() => <CozyIcon name="download" size={24} color={theme.colors.onSurface} />}
        title={t('drive.fileMeta.download')}
        onPress={() => {
          setMenuVisible(false)
          if (!client) return
          void download(client, file, driveId)
        }}
      />
    </Menu>
  )
}

/** Whether any action is available, i.e. whether the menu is worth rendering. */
export const hasFileActions = (props: Omit<Props, 'file' | 'testID'>): boolean =>
  !!props.onShare ||
  !!props.onRename ||
  !!props.onRestore ||
  !!props.onDelete ||
  !!props.onTogglePin ||
  !!props.onMove ||
  !!props.onInfo
