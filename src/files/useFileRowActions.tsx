import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import { Snackbar } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { ConfirmDeleteDialog } from '@/ui/ConfirmDeleteDialog'
import { RenameDialog } from '@/ui/RenameDialog'
import { BigFolderConfirmDialog } from '@/offline/BigFolderConfirmDialog'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { useOfflineActions } from '@/offline/useOfflineActions'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'
import { softDeleteEntry } from './deleteFile'
import { renameEntry } from './renameEntry'
import { optimisticFiles } from './optimisticFiles'
import { openFileFromList } from './openFromList'
import { useWebEditor } from '@/viewer/useWebEditor'
import { surfaceOpenError } from './errors'
import { FileQueryResult, TRASH_DIR_ID } from '@/client/queries'
import { cozyTokens } from '@/ui/theme'

type Entry = FileQueryResult

interface FileHandlers {
  onPress: (file: { _id: string; name: string; mime?: string; class?: string }) => void
  onShare?: (file: { _id: string }) => void
  onRename?: () => void
  onDelete?: () => void
  onMove?: (file: { _id: string }) => void
  onInfo?: (file: { _id: string }) => void
  onTogglePin?: (file: { _id: string; name: string; size?: number | null }) => void
  driveId?: string
}

interface FolderHandlers {
  onShare?: (folder: { _id: string }) => void
  onRename?: () => void
  onDelete?: () => void
  onMove?: (folder: { _id: string }) => void
  onTogglePin?: (folder: { _id: string; name: string }) => void
}

export interface FileRowActions {
  fileProps: (item: Entry) => FileHandlers
  folderProps: (item: Entry) => FolderHandlers
  /** The dialogs and the snackbar these actions need; render once per screen. */
  dialogs: React.ReactElement
  notify: (message: string) => void
}

export interface FileRowActionsOptions {
  /** Name used in the logs of a failed open. */
  screen: string
  /** Set inside a shared drive, so opening and downloading use its routes. */
  driveId?: string
  /** Actions the screen offers. Everything is on by default. */
  can?: {
    share?: boolean
    rename?: boolean
    delete?: boolean
    move?: boolean
    info?: boolean
    pin?: boolean
  }
}

/**
 * The actions a file row offers, in one place: opening, sharing, renaming,
 * trashing, moving, keeping offline, and the dialogs they need.
 *
 * Every list screen used to carry its own copy of this, which is how they
 * drifted apart — see the size a shared drive stopped showing, and the back
 * button that left its tab.
 */
export const useFileRowActions = ({
  screen,
  driveId,
  can = {}
}: FileRowActionsOptions): FileRowActions => {
  const { t } = useTranslation()
  const router = useRouter()
  const client = useClient()
  const openEditor = useWebEditor()
  const isOnline = useIsOnline()
  const offlineActions = useOfflineActions()
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [pendingRename, setPendingRename] = useState<Entry | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null)
  const [deleting, setDeleting] = useState(false)

  const allowed = {
    share: can.share ?? true,
    rename: can.rename ?? true,
    delete: can.delete ?? true,
    move: can.move ?? true,
    info: can.info ?? true,
    pin: can.pin ?? true
  }

  const togglePin = (file: { _id: string; name: string; size?: number | null }): void => {
    const entry = OfflineFilesStore.get(file._id)
    if (entry?.isDirectPin) void offlineActions.unpin(file._id)
    else offlineActions.pin({ _id: file._id, name: file.name, size: file.size ?? null })
  }

  const toggleFolderPin = (folder: { _id: string; name: string }): void => {
    if (OfflineFilesStore.getFolder(folder._id)) void offlineActions.unpinFolder(folder._id)
    else void offlineActions.pinFolder({ _id: folder._id, name: folder.name })
  }

  const share = (id: string): void => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    router.push(`/share/${id}`)
  }

  const open = (file: { _id: string; name: string; mime?: string; class?: string }): void => {
    if (!client) return
    void openFileFromList(client, router, file, driveId, openEditor).catch(e =>
      surfaceOpenError(e, setSnackbar, t, screen)
    )
  }

  const confirmDelete = async (): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client || !pendingDelete) return
    const doc = pendingDelete
    const revert = optimisticFiles(client, [{ ...doc, dir_id: TRASH_DIR_ID, trashed: true }])
    setPendingDelete(null)
    setDeleting(true)
    try {
      await softDeleteEntry(client, {
        _id: doc._id,
        _rev: (doc as unknown as { _rev?: string })._rev,
        name: doc.name,
        type: doc.type
      })
      setSnackbar(
        t(doc.type === 'directory' ? 'drive.delete.successFolder' : 'drive.delete.successFile')
      )
    } catch (e) {
      console.error(`[${screen}] delete failed`, e)
      revert()
      setSnackbar(t('drive.delete.errorGeneric'))
    } finally {
      setDeleting(false)
    }
  }

  const submitRename = async (newName: string): Promise<void> => {
    if (!requireOnline(isOnline, setSnackbar, t)) return
    if (!client || !pendingRename) return
    const doc = pendingRename
    const revert = optimisticFiles(client, [{ ...doc, name: newName }])
    setPendingRename(null)
    try {
      await renameEntry(client, doc._id, newName)
      setSnackbar(
        t(doc.type === 'directory' ? 'drive.rename.successFolder' : 'drive.rename.successFile')
      )
    } catch (e) {
      revert()
      throw e
    }
  }

  const fileProps = (item: Entry): FileHandlers => ({
    onPress: open,
    onShare: allowed.share ? file => share(file._id) : undefined,
    onRename: allowed.rename ? () => setPendingRename(item) : undefined,
    onDelete: allowed.delete ? () => setPendingDelete(item) : undefined,
    onMove: allowed.move ? file => router.push(`/move/${file._id}`) : undefined,
    onInfo: allowed.info ? file => router.push(`/metadata/${file._id}`) : undefined,
    onTogglePin: allowed.pin ? togglePin : undefined,
    driveId
  })

  const folderProps = (item: Entry): FolderHandlers => ({
    onShare: allowed.share ? folder => share(folder._id) : undefined,
    onRename: allowed.rename ? () => setPendingRename(item) : undefined,
    onDelete: allowed.delete ? () => setPendingDelete(item) : undefined,
    onMove: allowed.move ? folder => router.push(`/move/${folder._id}`) : undefined,
    onTogglePin: allowed.pin ? toggleFolderPin : undefined
  })

  const dialogs = (
    <>
      <ConfirmDeleteDialog
        visible={!!pendingDelete}
        target={pendingDelete}
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onDismiss={() => (deleting ? undefined : setPendingDelete(null))}
      />
      <RenameDialog
        visible={!!pendingRename}
        initialName={pendingRename?.name ?? ''}
        type={pendingRename?.type}
        onDismiss={() => setPendingRename(null)}
        onSubmit={submitRename}
      />
      <BigFolderConfirmDialog
        visible={!!offlineActions.pendingConfirmation}
        count={offlineActions.pendingConfirmation?.count ?? 0}
        bytes={offlineActions.pendingConfirmation?.bytes ?? 0}
        onConfirm={() => void offlineActions.confirmPending()}
        onCancel={offlineActions.cancelPending}
      />
      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={3000}
        wrapperStyle={styles.snackbar}
      >
        {snackbar ?? ''}
      </Snackbar>
    </>
  )

  return { fileProps, folderProps, dialogs, notify: setSnackbar }
}

const styles = StyleSheet.create({
  snackbar: { zIndex: cozyTokens.zIndex.snackbar }
})
