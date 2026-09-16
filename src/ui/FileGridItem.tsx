import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'react-native-paper'

import { FileThumbnail } from './FileThumbnail'
import { FileActionsMenu, hasFileActions } from './FileActionsMenu'
import { FolderActionsMenu, hasFolderActions } from './FolderActionsMenu'
import { PinnedBadge } from '@/offline/PinnedBadge'
import { folderBadgeEntry } from '@/offline/folderBadgeEntry'
import { useOfflineState, useOfflineFolderState } from '@/offline/useOfflineState'
import type { FileQueryResult } from '@/client/queries'

interface Props {
  file: FileQueryResult
  onPress: (file: FileQueryResult) => void
  onLongPress?: (file: FileQueryResult) => void
  /** Render the tile in the "selected" state (tinted background). */
  selected?: boolean
  /** Same action set as the list rows: the tile renders the same 3-dot menu
   *  when any of these is provided, and none of them while selected. */
  onShare?: (file: FileQueryResult) => void
  onRename?: (file: FileQueryResult) => void
  onRestore?: (file: FileQueryResult) => void
  onDelete?: (file: FileQueryResult) => void
  onTogglePin?: (file: FileQueryResult) => void
  onMove?: (file: FileQueryResult) => void
  onInfo?: (file: FileQueryResult) => void
  onFavoriteChange?: () => void
}

const THUMBNAIL_SIZE = 64

/**
 * A grid tile for a single file or folder.
 * Shows a thumbnail/icon at the top and the entry name (up to 2 lines) below.
 * Mirrors the press/long-press/selected contract of FileRow and FolderRow.
 */
export function FileGridItem({
  file,
  onPress,
  onLongPress,
  selected,
  onShare,
  onRename,
  onRestore,
  onDelete,
  onTogglePin,
  onMove,
  onInfo,
  onFavoriteChange
}: Props) {
  const { colors, roundness } = useTheme()
  const isFolder = file.type === 'directory'
  // Offline/pinned indicator — mirror the LIST rows so the badge also shows in
  // grid. Each hook is a no-op when given `undefined`, so only the relevant one
  // subscribes (file → useOfflineState, folder → useOfflineFolderState).
  const fileEntry = useOfflineState(isFolder ? undefined : file._id)
  const folderState = useOfflineFolderState(isFolder ? file._id : undefined)
  const badgeEntry = isFolder
    ? folderState.pinned && folderState.aggregate
      ? folderBadgeEntry(folderState.aggregate)
      : undefined
    : fileEntry

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asItem = (fn?: (f: FileQueryResult) => void) => (fn ? (f: any) => fn(f) : undefined)
  const fileActions = {
    onShare: asItem(onShare),
    onRename: asItem(onRename),
    onRestore: asItem(onRestore),
    onDelete: asItem(onDelete),
    onTogglePin: asItem(onTogglePin),
    onMove: asItem(onMove),
    onInfo: asItem(onInfo),
    onFavoriteChange
  }
  const { onInfo: onInfoAction, ...folderActions } = fileActions
  const showActions =
    !selected && (isFolder ? hasFolderActions(folderActions) : hasFileActions(fileActions))

  const containerStyle = [
    styles.container,
    { borderRadius: roundness },
    selected && { backgroundColor: colors.primaryContainer }
  ]

  return (
    <Pressable
      testID="file-grid-item"
      onPress={() => onPress(file)}
      onLongPress={onLongPress ? () => onLongPress(file) : undefined}
      style={({ pressed }) => [
        ...containerStyle,
        pressed && !selected && { backgroundColor: colors.surfaceVariant }
      ]}
      accessibilityRole="button"
      accessibilityLabel={file.name}
    >
      <View testID="file-grid-icon" style={styles.iconWrapper}>
        <FileThumbnail file={file} size={THUMBNAIL_SIZE} />
        <PinnedBadge entry={badgeEntry} testID="pinned-badge" />
      </View>
      <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={2}>
        {file.name}
      </Text>
      {showActions ? (
        <View style={styles.actionSlot}>
          {isFolder ? (
            <FolderActionsMenu
              folder={file}
              onShare={fileActions.onShare}
              onRename={fileActions.onRename}
              onRestore={fileActions.onRestore}
              onDelete={fileActions.onDelete}
              onTogglePin={fileActions.onTogglePin}
              onMove={fileActions.onMove}
              onFavoriteChange={onFavoriteChange}
              testID="folder-grid-actions"
            />
          ) : (
            <FileActionsMenu
              file={{ ...file, size: file.size ?? null }}
              onShare={fileActions.onShare}
              onRename={fileActions.onRename}
              onRestore={fileActions.onRestore}
              onDelete={fileActions.onDelete}
              onTogglePin={fileActions.onTogglePin}
              onMove={fileActions.onMove}
              onInfo={onInfoAction}
              onFavoriteChange={onFavoriteChange}
              testID="file-grid-actions"
            />
          )}
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: 4,
    padding: 8,
    alignItems: 'center'
  },
  iconWrapper: {
    position: 'relative',
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  actionSlot: {
    position: 'absolute',
    top: 0,
    right: 0
  },
  name: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16
  }
})
