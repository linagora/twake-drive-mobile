import { Linking } from 'react-native'
import type CozyClient from 'cozy-client'
import type { Router } from 'expo-router'

import { isShortcutFile } from './fileTypes'
import { EditableDocument, webEditorKindOf } from '@/viewer/webEditor'
import { canPreviewInApp } from './streamUrl'
import { fetchShortcutUrl } from './shortcuts'
import { openFileNatively } from './openFile'
import { localViewerFor } from '@/viewer/documentKind'

export interface DriveFile {
  _id: string
  _rev?: string
  name: string
  mime?: string
  class?: string
  metadata?: { externalId?: string }
}

export interface OpenDriveFileOptions {
  openEditor: (file: EditableDocument, driveId?: string) => Promise<void>
  driveId?: string
}

/**
 * Opens a file in what it opens with: a local viewer, its web editor, the
 * in-app preview, a shortcut's target, or another app on the device.
 *
 * Throws on failure; callers surface the error.
 */
export const openDriveFile = async (
  client: CozyClient,
  router: Router,
  file: DriveFile,
  { openEditor, driveId }: OpenDriveFileOptions
): Promise<void> => {
  // A file inside a shared drive is served by the owner instance through the
  // drive routes, so every viewer has to be told which drive it came from.
  const scope = driveId ? `?driveId=${encodeURIComponent(driveId)}` : ''
  // A type with a local viewer opens in it, online or not; the web editor is
  // then one tap away from the viewer.
  if (localViewerFor(file)) {
    router.push(`/preview/${file._id}${scope}`)
    return
  }
  if (webEditorKindOf(file)) {
    await openEditor(
      { _id: file._id, name: file.name, mime: file.mime, metadata: file.metadata },
      driveId
    )
    return
  }
  if (canPreviewInApp(file)) {
    router.push(`/preview/${file._id}${scope}`)
    return
  }
  if (isShortcutFile(file)) {
    const url = await fetchShortcutUrl(client, file._id)
    if (!url) throw new Error('Shortcut has no target URL')
    await Linking.openURL(url)
    return
  }
  await openFileNatively(
    client,
    { _id: file._id, _rev: file._rev, name: file.name, mime: file.mime },
    driveId
  )
}
