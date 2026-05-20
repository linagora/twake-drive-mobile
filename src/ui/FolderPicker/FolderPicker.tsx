import React, { useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { Appbar, Button, Portal, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { EmptyState } from '@/ui/EmptyState'
import { ErrorState } from '@/ui/ErrorState'
import { CreateFolderDialog } from '@/ui/CreateFolderDialog'
import { createFolder } from '@/files/createFolder'
import {
  FileQueryResult,
  fileByIdQuery,
  fileByIdQueryAs,
  folderFilesQuery,
  folderFilesQueryAs,
  folderSubfoldersQuery,
  folderSubfoldersQueryAs
} from '@/client/queries'
import { FolderPickerRow, FolderPickerRowItem } from './FolderPickerRow'

export interface FolderPickerSelection {
  _id: string
  name: string
}

export interface FolderPickerProps {
  initialFolderId: string
  excludeIds: Set<string>
  confirmLabel: string
  isBusy: boolean
  onConfirm: (folder: FolderPickerSelection) => void
  onCancel: () => void
}

interface StackEntry {
  id: string
  name: string
}

export const FolderPicker = ({
  initialFolderId,
  excludeIds,
  confirmLabel,
  isBusy,
  onConfirm,
  onCancel
}: FolderPickerProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const client = useClient()
  const [stack, setStack] = useState<StackEntry[]>([{ id: initialFolderId, name: '' }])
  const [creatingFolder, setCreatingFolder] = useState(false)
  const current = stack[stack.length - 1]

  const folderLookup = useQuery(fileByIdQuery(current.id), {
    as: fileByIdQueryAs(current.id)
  })
  const folderDoc = (
    Array.isArray(folderLookup.data) ? folderLookup.data[0] : folderLookup.data
  ) as FileQueryResult | null | undefined

  const subfoldersQuery = useQuery(folderSubfoldersQuery(current.id), {
    as: folderSubfoldersQueryAs(current.id)
  })
  const filesQuery = useQuery(folderFilesQuery(current.id), {
    as: folderFilesQueryAs(current.id)
  })

  const subfolders = (subfoldersQuery.data as FileQueryResult[] | null | undefined) ?? []
  const files = (filesQuery.data as FileQueryResult[] | null | undefined) ?? []
  const items: FolderPickerRowItem[] = [
    ...subfolders.map(d => ({ _id: d._id, name: d.name, type: 'directory' as const })),
    ...files.map(f => ({ _id: f._id, name: f.name, type: 'file' as const }))
  ]

  const isAtRoot = stack.length === 1
  const isLoading =
    (folderLookup.fetchStatus === 'loading' && !folderDoc) ||
    (subfoldersQuery.fetchStatus === 'loading' && subfolders.length === 0)
  const hasError = folderLookup.fetchStatus === 'failed' || subfoldersQuery.fetchStatus === 'failed'

  const title = folderDoc?.name ?? current.name ?? ''

  const navigateInto = (item: FolderPickerRowItem): void => {
    if (item.type !== 'directory') return
    setStack(prev => [...prev, { id: item._id, name: item.name }])
  }

  const navigateBack = (): void => {
    setStack(prev => prev.slice(0, -1))
  }

  const onCreateFolder = async (name: string): Promise<void> => {
    if (!client) throw new Error('No client')
    const created = await createFolder(client, name, current.id)
    setCreatingFolder(false)
    // Auto drill into the newly created folder
    setStack(prev => [...prev, { id: created._id, name: created.name }])
    void subfoldersQuery.fetch()
  }

  const confirmDisabled = isBusy || excludeIds.has(current.id)

  return (
    // Portal.Host scopes Paper's <Portal> (used by CreateFolderDialog) to the
    // picker's view tree. Without it, the dialog mounts into the app-level
    // PortalHost (below the iOS native pageSheet), and the user only sees the
    // dimmed backdrop without the dialog itself.
    <Portal.Host>
      <ScreenContainer>
        {/* statusBarHeight={0}: inside a pageSheet the modal already starts
            below the system status bar, so Paper's default top inset
            doubles up the spacing. */}
        <Appbar.Header statusBarHeight={0}>
          {isAtRoot ? null : (
            <Appbar.BackAction onPress={navigateBack} accessibilityLabel={t('common.back')} />
          )}
          <Appbar.Content title={title} />
          <Appbar.Action
            icon="folder-plus"
            accessibilityLabel={t('drive.move.newFolder')}
            onPress={() => setCreatingFolder(true)}
          />
        </Appbar.Header>
        {hasError ? (
          <ErrorState
            message={t('drive.preview.loadFailed')}
            onRetry={() => {
              void folderLookup.fetch()
              void subfoldersQuery.fetch()
              void filesQuery.fetch()
            }}
          />
        ) : isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState message={t('drive.emptyFolder')} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={i => i._id}
            renderItem={({ item }) => (
              <FolderPickerRow
                item={item}
                disabled={item.type === 'file' || excludeIds.has(item._id)}
                onPress={navigateInto}
              />
            )}
          />
        )}
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.colors.surfaceVariant, borderTopColor: theme.colors.outline }
          ]}
        >
          <Button mode="outlined" onPress={onCancel} style={styles.footerButton}>
            {t('common.cancel')}
          </Button>
          <Button
            mode="contained"
            disabled={confirmDisabled}
            loading={isBusy}
            onPress={() => onConfirm({ _id: current.id, name: title })}
            style={styles.footerButton}
          >
            {confirmLabel}
          </Button>
        </View>
        <CreateFolderDialog
          visible={creatingFolder}
          onDismiss={() => setCreatingFolder(false)}
          onSubmit={onCreateFolder}
        />
      </ScreenContainer>
    </Portal.Host>
  )
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  footerButton: { flex: 1 }
})
