import { Linking } from 'react-native'
import type CozyClient from 'cozy-client'
import type { Router } from 'expo-router'

import { isCozyNoteFile, isDocsNoteFile, isOfficeFile, isShortcutFile } from './fileTypes'
import { canPreviewInApp } from './streamUrl'
import { fetchShortcutUrl } from './shortcuts'
import { openFileNatively } from './openFile'

interface FileLike {
  _id: string
  name: string
  mime?: string
  class?: string
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
  file: FileLike
): Promise<void> => {
  if (isCozyNoteFile(file.name)) {
    router.push(`/note/${file._id}`)
    return
  }
  if (isDocsNoteFile(file.name)) {
    router.push(`/docs/${file._id}`)
    return
  }
  if (isOfficeFile(file.mime)) {
    router.push(`/onlyoffice/${file._id}`)
    return
  }
  if (canPreviewInApp(file)) {
    router.push(`/preview/${file._id}`)
    return
  }
  if (isShortcutFile(file)) {
    const url = await fetchShortcutUrl(client, file._id)
    if (!url) throw new Error('Shortcut has no target URL')
    await Linking.openURL(url)
    return
  }
  await openFileNatively(client, { _id: file._id, name: file.name, mime: file.mime })
}
