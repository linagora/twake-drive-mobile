import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { IconButton, List, Menu, useTheme } from 'react-native-paper'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'

import { formatFileSize } from '@/utils/formatters'
import { useFileSharingStatus } from '@/sharing/SharingProvider'
import { FileThumbnail } from './FileThumbnail'
import { SharedBadge } from './SharedBadge'

export interface FileItem {
  _id: string
  name: string
  type?: 'file' | 'directory'
  size: number | null
  mime?: string
  class?: string
  updated_at?: string
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

interface Props {
  file: FileItem
  onPress: (file: FileItem) => void
  onLongPress?: (file: FileItem) => void
  /** Render the row in the "selected" state (tinted background). */
  selected?: boolean
  /** When `onShare` or `onDelete` is provided, a 3-dot menu is rendered on
   *  the right with the corresponding action(s). Without any, the row stays
   *  unadorned (the metadata sheet still surfaces these actions). The menu
   *  is hidden while `selected` to keep the row in pure selection mode. */
  onShare?: (file: FileItem) => void
  onDelete?: (file: FileItem) => void
}

export const FileRow = ({
  file,
  onPress,
  onLongPress,
  selected,
  onShare,
  onDelete
}: Props) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const [menuVisible, setMenuVisible] = useState(false)
  const size = formatFileSize(file.size)
  const date = file.updated_at
    ? formatDistanceToNow(new Date(file.updated_at), { addSuffix: true })
    : ''
  const description = date ? `${size} · ${date}` : size
  const sharingStatus = useFileSharingStatus(file._id)
  const hasMenu = (!!onShare || !!onDelete) && !selected

  return (
    <List.Item
      title={file.name}
      description={description}
      // Honour the `style` Paper passes to `left` (margins, etc.) so the
      // thumbnail aligns with `<List.Icon>` columns elsewhere in the app.
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
              <FileThumbnail file={file} size={40} />
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
                accessibilityLabel="file actions"
              />
            }
          >
            {onShare ? (
              <Menu.Item
                leadingIcon="share-variant"
                title={t('drive.fileMeta.share')}
                onPress={() => {
                  setMenuVisible(false)
                  onShare(file)
                }}
              />
            ) : null}
            {onDelete ? (
              <Menu.Item
                leadingIcon="trash-can-outline"
                title={t('drive.fileMeta.delete')}
                onPress={() => {
                  setMenuVisible(false)
                  onDelete(file)
                }}
              />
            ) : null}
          </Menu>
        ) : null
      }
      onPress={() => onPress(file)}
      onLongPress={onLongPress ? () => onLongPress(file) : undefined}
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
