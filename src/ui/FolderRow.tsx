import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { IconButton, List, Menu } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { FileTypeIcon } from '@/ui/icons/FileTypeIcon'
import { useFileSharingStatus } from '@/sharing/SharingProvider'
import { SharedBadge } from './SharedBadge'

export interface FolderItem {
  _id: string
  name: string
}

interface Props {
  folder: FolderItem
  onPress: (folder: FolderItem) => void
  /**
   * When provided, a 3-dot menu is rendered with a "Share" item that calls
   * this callback. Without this prop, the chevron-right is shown (current
   * behaviour is preserved for callers that don't wire sharing in).
   */
  onShare?: (folder: FolderItem) => void
}

export const FolderRow = ({ folder, onPress, onShare }: Props) => {
  const { t } = useTranslation()
  const [menuVisible, setMenuVisible] = useState(false)
  const sharingStatus = useFileSharingStatus(folder._id)

  return (
    <List.Item
      title={folder.name}
      // Honour the `style` Paper passes to `left` so the folder icon aligns
      // with file thumbnails in the same list (matching column widths).
      left={props => (
        <View style={[props.style, styles.leftSlot]}>
          <FileTypeIcon icon="folder" size={40} />
          <SharedBadge status={sharingStatus} />
        </View>
      )}
      right={props =>
        onShare ? (
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
            <Menu.Item
              leadingIcon="share-variant"
              title={t('drive.fileMeta.share')}
              onPress={() => {
                setMenuVisible(false)
                onShare(folder)
              }}
            />
          </Menu>
        ) : (
          <List.Icon {...props} icon="chevron-right" />
        )
      }
      onPress={() => onPress(folder)}
      style={styles.row}
    />
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 4 },
  leftSlot: { justifyContent: 'center', alignItems: 'center', width: 40, height: 40 }
})
