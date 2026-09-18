import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { IconButton, List, Menu, useTheme } from 'react-native-paper'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { dateLocaleForLanguage } from '@/i18n/dateLocale'
import { formatFileSize } from '@/utils/formatters'
import { useFileSharingStatus } from '@/sharing/SharingProvider'
import { useIsOnline } from '@/network/useIsOnline'
import { PinnedBadge } from '@/offline/PinnedBadge'
import { useOfflineState } from '@/offline/useOfflineState'
import { isFavorite, toggleFavorite } from '@/files/favorites'
import { download } from '@/files/download'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { FileThumbnail } from './FileThumbnail'
import { FileActionsMenu } from './FileActionsMenu'
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
  cozyMetadata?: { favorite?: boolean }
}

interface Props {
  file: FileItem
  onPress: (file: FileItem) => void
  onLongPress?: (file: FileItem) => void
  /** Render the row in the "selected" state (tinted background). */
  selected?: boolean
  /** When any of `onShare` / `onRename` / `onDelete` is provided, a 3-dot
   *  menu is rendered on the right with the corresponding action(s).
   *  Without any, the row stays unadorned (the metadata sheet still
   *  surfaces these actions). The menu is hidden while `selected` to keep
   *  the row in pure selection mode. */
  onShare?: (file: FileItem) => void
  onRename?: (file: FileItem) => void
  onRestore?: (file: FileItem) => void
  onDelete?: (file: FileItem) => void
  onTogglePin?: (file: FileItem) => void
  /** Set inside a shared drive, so the row's actions use the drive routes. */
  driveId?: string
  onMove?: (file: FileItem) => void
  /** Opens the metadata/details sheet for this row. */
  onInfo?: (file: FileItem) => void
  /** Called after a favorite toggle so the parent can refetch its query — the
   * lists are non-reactive, so without this a removed favorite lingers. */
  onFavoriteChange?: () => void
  /** Stable id for E2E (Maestro) selection. */
  testID?: string
}

export const FileRow = ({
  file,
  onPress,
  onLongPress,
  selected,
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
}: Props) => {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const isOnline = useIsOnline()
  const [menuVisible, setMenuVisible] = useState(false)
  const offlineEntry = useOfflineState(file._id)
  const isPinned = !!offlineEntry
  // "Retirer du hors-ligne" can only apply to a DIRECT pin. A file that's offline
  // solely because its parent folder is pinned must show "Garder hors-ligne"
  // (which adds a direct pin) — showing "Retirer" there made onToggleFilePin fall
  // through and RE-PIN the file instead of removing it (opposite of the label).
  const isDirectPin = !!offlineEntry?.isDirectPin
  const size = formatFileSize(file.size)
  const dateLocale = dateLocaleForLanguage(i18n.language)
  const date = file.updated_at
    ? formatDistanceToNow(new Date(file.updated_at), { addSuffix: true, locale: dateLocale })
    : ''
  const offlineDescription =
    offlineEntry?.state === 'downloading' && offlineEntry.bytesDownloaded !== undefined
      ? `${formatFileSize(offlineEntry.bytesDownloaded)} / ${formatFileSize(file.size)}`
      : undefined
  const description = offlineDescription ?? (date ? `${size} · ${date}` : size)
  const sharingStatus = useFileSharingStatus(file._id)
  const hasMenu =
    (!!onShare ||
      !!onRename ||
      !!onRestore ||
      !!onDelete ||
      !!onTogglePin ||
      !!onMove ||
      !!onInfo) &&
    !selected

  return (
    <View
      style={[styles.rowContainer, selected && { backgroundColor: theme.colors.primaryContainer }]}
    >
      <List.Item
        style={styles.item}
        testID={testID}
        title={file.name}
        description={description}
        left={props => (
          <View style={[props.style, styles.leftSlot]}>
            {selected ? (
              <View style={[styles.checkmark, { backgroundColor: theme.colors.primary }]}>
                <CozyIcon name="check" size={24} color={theme.colors.onPrimary} />
              </View>
            ) : (
              <View style={styles.thumbWrap}>
                <FileThumbnail file={file} size={40} />
                <SharedBadge status={sharingStatus} />
                <PinnedBadge entry={offlineEntry} testID="pinned-badge" />
              </View>
            )}
          </View>
        )}
        onPress={() => onPress(file)}
        onLongPress={onLongPress ? () => onLongPress(file) : undefined}
      />
      <View style={styles.actionSlot} pointerEvents="box-none">
        {hasMenu ? (
          <FileActionsMenu
            file={file}
            onShare={onShare}
            onRename={onRename}
            onRestore={onRestore}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            driveId={driveId}
            onMove={onMove}
            onInfo={onInfo}
            onFavoriteChange={onFavoriteChange}
            testID="file-actions"
          />
        ) : null}
      </View>
    </View>
  )
}

// Width of the 3-dot IconButton (MD3: 24 icon + 2×8 padding) plus its 6px margins,
// and the title's right inset — Paper's own MD3 paddingRight, kept so the text
// wraps exactly where it did when the button was a flex sibling.
const ACTION_SLOT_WIDTH = 52
const TITLE_RIGHT_INSET = ACTION_SLOT_WIDTH + 24

const styles = StyleSheet.create({
  rowContainer: { position: 'relative' },
  item: { paddingVertical: 4, paddingRight: TITLE_RIGHT_INSET },
  actionSlot: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_SLOT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center'
  },
  leftSlot: { justifyContent: 'center', alignItems: 'center', width: 40, height: 40 },
  thumbWrap: { position: 'relative', width: 40, height: 40 },
  checkmark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
