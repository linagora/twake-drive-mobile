import { Linking } from 'react-native'
import type CozyClient from 'cozy-client'
import type { Router } from 'expo-router'

import { isShortcutFile } from './fileTypes'
import { EditableDocument, webEditorKindOf } from '@/viewer/webEditor'
import { canPreviewInApp } from './streamUrl'
import { fetchShortcutUrl } from './shortcuts'
import { openFileNatively } from './openFile'
import { localViewerFor } from '@/viewer/documentKind'

interface FileLike {
  _id: string
  _rev?: string
  name: string
  mime?: string
  class?: string
  metadata?: { externalId?: string }
}

/**
 * Routes a file to its correct viewer when the user taps it in a list.
 * Mirrors the dispatch table that lived in FileMetadataSheet#onOpen, but
 * skips the intermediate metadata sheet — competitor Drives (Google Drive,
 * Apple Files, Dropbox, OneDrive, Proton Drive, Nextcloud) all open
 * straight into the viewer on tap. Metadata + actions are reached via the
 * row's 3-dot menu or long-press.
 *
 * Throws on failure; callers should catch + surface via Snackbar/Toast.
 */
export const openFileFromList = async (
  client: CozyClient,
  router: Router,
  file: FileLike,
  driveId?: string,
  openEditor?: (file: EditableDocument, driveId?: string) => Promise<void>
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
  if (webEditorKindOf(file) && openEditor) {
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
