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

interface NoteModels {
  note: {
    fetchURL: (
      client: CozyClient,
      file: { id: string },
      options?: { driveId?: string }
    ) => Promise<string>
  }
}

const drivePath = (route: string, fileId: string, driveId?: string): string =>
  driveId
    ? `/${route}/${encodeURIComponent(driveId)}/${encodeURIComponent(fileId)}`
    : `/${route}/${encodeURIComponent(fileId)}`

/**
 * The address of the web editor a document is changed in, mirroring the routes
 * twake-drive serves: `#/onlyoffice/[driveId/]id`, `#/excalidraw/[driveId/]id`,
 * the notes app for a cozy note and the Docs bridge for a Docs document.
 */
export const webEditorUrl = async (
  client: CozyClient,
  file: EditableDocument,
  driveId?: string,
  sessionCode?: string
): Promise<string> => {
  const stackUri = client.getStackClient().uri as string
  const kind = webEditorKindOf(file)
  switch (kind) {
    case 'note':
      // A note of a shared drive lives on the owner's instance, which the
      // stack answers for with its URL and a sharecode.
      if (driveId) {
        return (models as unknown as NoteModels).note.fetchURL(
          client,
          { id: file._id },
          { driveId }
        )
      }
      return buildCozyAppUrl(stackUri, 'notes', `/n/${encodeURIComponent(file._id)}`, sessionCode)
    case 'docs': {
      const externalId = file.metadata?.externalId
      if (!externalId) throw new Error('This document has no Docs id')
      return buildCozyAppUrl(
        stackUri,
        'docs',
        `/bridge/docs/${encodeURIComponent(externalId)}`,
        sessionCode
      )
    }
    case 'office':
      return buildCozyAppUrl(
        stackUri,
        'drive',
        drivePath('onlyoffice', file._id, driveId),
        sessionCode
      )
    case 'excalidraw':
      return buildCozyAppUrl(
        stackUri,
        'drive',
        drivePath('excalidraw', file._id, driveId),
        sessionCode
      )
    default:
      throw new Error(`No web editor for ${file.name}`)
  }
}

/**
 * Opens a document in its web editor, in the in-app browser.
 *
 * `fetchSessionCode` is what signs the user into the web app: the stack only
 * hands a session code to a flagship-certified client, so the first editor
 * opened on a device is where the certification happens — not at login, where
 * it used to greet every new sign-in. A note of a shared drive needs none: the
 * stack answers for it with a sharecode of its own.
 */
export const openWebEditor = async (
  client: CozyClient,
  file: EditableDocument,
  driveId?: string,
  fetchSessionCode?: () => Promise<string>
): Promise<void> => {
  const needsSessionCode = !(webEditorKindOf(file) === 'note' && driveId)
  const sessionCode = fetchSessionCode && needsSessionCode ? await fetchSessionCode() : undefined
  const url = await webEditorUrl(client, file, driveId, sessionCode)
  await WebBrowser.openBrowserAsync(url)
  await refreshDocumentFromStack(client, file._id, driveId)
}
