import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { IconButton, List, Menu, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { FileTypeIcon } from '@/ui/icons/FileTypeIcon'
import { useFileSharingStatus } from '@/sharing/SharingProvider'
import { useIsOnline } from '@/network/useIsOnline'
import { useOfflineFolderPinned } from '@/offline/useOfflineState'
import { SharedBadge } from './SharedBadge'

export interface FolderItem {
  _id: string
  name: string
}

interface Props {
  folder: FolderItem
  onPress: (folder: FolderItem) => void
  onLongPress?: (folder: FolderItem) => void
  /** Render the row in the "selected" state (tinted background). */
  selected?: boolean
  /**
   * When any of `onShare` / `onRename` / `onDelete` is provided, a 3-dot
   * menu is rendered with the corresponding action(s). Without any, the
   * chevron-right is shown. The menu is hidden while `selected` to keep
   * the row in pure selection mode.
   */
  onShare?: (folder: FolderItem) => void
  onRename?: (folder: FolderItem) => void
  onRestore?: (folder: FolderItem) => void
  onDelete?: (folder: FolderItem) => void
  onTogglePin?: (folder: FolderItem) => void
}

export const FolderRow = ({
  folder,
  onPress,
  onLongPress,
  selected,
  onShare,
  onRename,
  onRestore,
  onDelete,
  onTogglePin
}: Props) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isOnline = useIsOnline()
  const [menuVisible, setMenuVisible] = useState(false)
  const sharingStatus = useFileSharingStatus(folder._id)
  const isPinned = useOfflineFolderPinned(folder._id)
  const hasMenu = (!!onShare || !!onRename || !!onRestore || !!onDelete || !!onTogglePin) && !selected

  return (
    <List.Item
      title={folder.name}
      // Honour the `style` Paper passes to `left` so the folder icon aligns
      // with file thumbnails in the same list (matching column widths).
      left={props => (
        <View style={[props.style, styles.leftSlot]}>
          {selected ? (
            <View
              style={[styles.checkmark, { backgroundColor: theme.colors.primary }]}
            >
              <List.Icon icon="check" color={theme.colors.onPrimary} />
            </View>
          ) : (
            <>
              <FileTypeIcon icon="folder" size={40} />
              <SharedBadge status={sharingStatus} />
            </>
          )}
        </View>
      )}
      right={props =>
        hasMenu ? (
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <IconButton
                {...props}
                icon="dots-vertical"
                onPress={() => setMenuVisible(true)}
                accessibilityLabel="folder actions"
              />
            }
          >
            {onTogglePin ? (
              <Menu.Item
                leadingIcon={isPinned ? 'cloud-off-outline' : 'cloud-download-outline'}
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
                leadingIcon="share-variant"
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
                leadingIcon="pencil-outline"
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
                leadingIcon="restore"
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
                leadingIcon="trash-can-outline"
                title={t('drive.fileMeta.delete')}
                disabled={!isOnline}
                onPress={() => {
                  setMenuVisible(false)
                  onDelete(folder)
                }}
              />
            ) : null}
          </Menu>
        ) : (
          <List.Icon {...props} icon="chevron-right" />
        )
      }
      onPress={() => onPress(folder)}
      onLongPress={onLongPress ? () => onLongPress(folder) : undefined}
      style={[
        styles.row,
        selected && { backgroundColor: theme.colors.primaryContainer }
      ]}
    />
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4 },
  leftSlot: { justifyContent: 'center', alignItems: 'center', width: 40, height: 40 },
  checkmark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
