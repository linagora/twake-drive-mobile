import { isCozyNoteFile, isDocsNoteFile, isOfficeFile } from '@/files/fileTypes'
import { isViewerEnabled, ViewerKind } from './viewerFlags'

export interface ViewableDocument {
  name: string
  mime?: string
}

const isMarkdownFile = (name?: string): boolean => !!name && /\.md$/i.test(name)
const isExcalidrawFile = (name?: string): boolean => !!name && /\.excalidraw$/i.test(name)

/** Which local viewer a document belongs to, whatever its flag says. */
export const viewerKindOf = (file: ViewableDocument): ViewerKind | null => {
  if (isCozyNoteFile(file.name)) return 'note'
  if (isDocsNoteFile(file.name)) return 'docsNote'
  if (isMarkdownFile(file.name)) return 'markdown'
  if (isExcalidrawFile(file.name)) return 'excalidraw'
  if (isOfficeFile(file.mime)) return 'office'
  return null
}

/** The viewers that render something today; the others are still being built. */
const IMPLEMENTED: ViewerKind[] = ['markdown', 'note', 'docsNote', 'office']

/** Whether the app renders the document itself or hands it to the OS viewer. */
export const rendersInApp = (kind: ViewerKind): boolean => kind !== 'office'

/**
 * The local viewer to open a document with, or null to leave it to the web
 * editor. A viewer has to be built and turned on for its instance.
 */
export const localViewerFor = (file: ViewableDocument): ViewerKind | null => {
  const kind = viewerKindOf(file)
  if (!kind || !IMPLEMENTED.includes(kind)) return null
  return isViewerEnabled(kind) ? kind : null
}

/** Whether this document also has a web editor to offer behind an Edit button. */
export const hasWebEditor = (file: ViewableDocument): boolean => {
  const kind = viewerKindOf(file)
  return kind === 'note' || kind === 'docsNote' || kind === 'office' || kind === 'excalidraw'
}
