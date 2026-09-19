import CozyClient, { models } from 'cozy-client'
import * as WebBrowser from 'expo-web-browser'

import { buildCozyAppUrl } from '@/files/cozyAppLink'
import { isCozyNoteFile, isDocsNoteFile, isOfficeFile } from '@/files/fileTypes'
import { refreshDocumentFromStack } from '@/files/refreshDocument'

export interface EditableDocument {
  _id: string
  name: string
  mime?: string
  metadata?: { externalId?: string }
}

export type WebEditorKind = 'note' | 'docs' | 'office' | 'excalidraw'

const OFFICE_EXTENSIONS = /\.(docx|xlsx|pptx|odt|ods|odp)$/i

export const webEditorKindOf = (file: EditableDocument): WebEditorKind | null => {
  if (isCozyNoteFile(file.name)) return 'note'
  if (isDocsNoteFile(file.name)) return 'docs'
  if (isOfficeFile(file.mime) || OFFICE_EXTENSIONS.test(file.name)) return 'office'
  if (/\.excalidraw$/i.test(file.name)) return 'excalidraw'
  return null
}

const drivePath = (route: string, fileId: string, driveId?: string): string =>
  driveId
    ? `/${route}/${encodeURIComponent(driveId)}/${encodeURIComponent(fileId)}`
    : `/${route}/${encodeURIComponent(fileId)}`

interface NoteModels {
  note: {
    fetchURL: (
      client: CozyClient,
      file: { id: string },
      options?: { driveId?: string }
    ) => Promise<string>
  }
}

/**
 * The address of the web editor a document is changed in, mirroring the routes
 * twake-drive serves: `#/onlyoffice/[driveId/]id`, `#/excalidraw/[driveId/]id`,
 * the notes app for a cozy note and the Docs bridge for a Docs document.
 */
export const webEditorUrl = async (
  client: CozyClient,
  file: EditableDocument,
  driveId?: string
): Promise<string> => {
  const stackUri = client.getStackClient().uri as string
  const kind = webEditorKindOf(file)
  switch (kind) {
    case 'note':
      // The stack answers with the notes app URL, and with a sharecode when the
      // note belongs to a shared drive.
      return (models as unknown as NoteModels).note.fetchURL(
        client,
        { id: file._id },
        driveId ? { driveId } : {}
      )
    case 'docs': {
      const externalId = file.metadata?.externalId
      if (!externalId) throw new Error('This document has no Docs id')
      return buildCozyAppUrl(stackUri, 'docs', `/bridge/docs/${encodeURIComponent(externalId)}`)
    }
    case 'office':
      return buildCozyAppUrl(stackUri, 'drive', drivePath('onlyoffice', file._id, driveId))
    case 'excalidraw':
      return buildCozyAppUrl(stackUri, 'drive', drivePath('excalidraw', file._id, driveId))
    default:
      throw new Error(`No web editor for ${file.name}`)
  }
}

/**
 * Opens a document in its web editor, in the browser of the system: it holds
 * the session cookie, so the user is already signed in, and it never sees a
 * credential of ours. Closing it is what says the editing is over, so the
 * document is read back from the stack at that point.
 */
export const openWebEditor = async (
  client: CozyClient,
  file: EditableDocument,
  driveId?: string
): Promise<void> => {
  const url = await webEditorUrl(client, file, driveId)
  await WebBrowser.openBrowserAsync(url)
  await refreshDocumentFromStack(client, file._id, driveId)
}
