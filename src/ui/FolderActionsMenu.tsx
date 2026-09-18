import React, { useState } from 'react'
import { IconButton, Menu, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { useIsOnline } from '@/network/useIsOnline'
import { useOfflineFolderState } from '@/offline/useOfflineState'
import { isKeepOfflineEnabled } from '@/offline/keepOfflineFlag'
import { isFavorite, toggleFavorite } from '@/files/favorites'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import type { FolderItem } from './FolderRow'

interface Props {
  folder: FolderItem
  onShare?: (folder: FolderItem) => void
  onRename?: (folder: FolderItem) => void
  onRestore?: (folder: FolderItem) => void
  onDelete?: (folder: FolderItem) => void
  onTogglePin?: (folder: FolderItem) => void
  onMove?: (folder: FolderItem) => void
  onFavoriteChange?: () => void
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
  onDelete,
  onTogglePin,
  onMove,
  onFavoriteChange,
  testID
}: Props): React.ReactElement => {
  const { t } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const isOnline = useIsOnline()
  const [menuVisible, setMenuVisible] = useState(false)
  const isPinned = useOfflineFolderState(folder._id).pinned

  return (
    <Menu
      visible={menuVisible}
      onDismiss={() => setMenuVisible(false)}
      anchor={
        <IconButton
          icon={p => <CozyIcon name="dotsVertical" size={p?.size ?? 24} color={p?.color} />}
          onPress={() => setMenuVisible(true)}
          accessibilityLabel={t('a11y.folderActions')}
          testID={testID ?? `folder-actions:${folder.name}`}
        />
      }
    >
      {onTogglePin && isKeepOfflineEnabled() ? (
        <Menu.Item
          leadingIcon={() => <CozyIcon name="cloud2" size={24} color={theme.colors.onSurface} />}
          title={t(isPinned ? 'drive.offline.unpin' : 'drive.offline.pin')}
          disabled={!isPinned && !isOnline}
          onPress={() => {
            setMenuVisible(false)
            onTogglePin(folder)
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
            onShare(folder)
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
            onRename(folder)
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
            onRestore(folder)
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
            onDelete(folder)
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
            onMove(folder)
          }}
        />
      ) : null}
      <Menu.Item
        disabled={!isOnline}
        leadingIcon={() => (
          <CozyIcon
            name={isFavorite(folder as Parameters<typeof isFavorite>[0]) ? 'star' : 'starOutline'}
            size={24}
            color={theme.colors.onSurface}
          />
        )}
        title={t(
          isFavorite(folder as Parameters<typeof isFavorite>[0])
            ? 'drive.fileMeta.unfavorite'
            : 'drive.fileMeta.favorite'
        )}
        onPress={() => {
          setMenuVisible(false)
          if (!client) return
          const next = !isFavorite(folder as Parameters<typeof isFavorite>[0])
          void toggleFavorite(client, folder as Parameters<typeof toggleFavorite>[1], next)
            .then(() => {
              triggerPouchReplication(client)
              onFavoriteChange?.()
            })
            .catch(e => console.error('[FolderRow] toggleFavorite failed', e))
        }}
      />
    </Menu>
  )
}

/** Whether any action is available, i.e. whether the menu is worth rendering. */
export const hasFolderActions = (props: Omit<Props, 'folder' | 'testID'>): boolean =>
  !!props.onShare ||
  !!props.onRename ||
  !!props.onRestore ||
  !!props.onDelete ||
  (!!props.onTogglePin && isKeepOfflineEnabled()) ||
  !!props.onMove
