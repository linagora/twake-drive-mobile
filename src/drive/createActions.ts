export type CreateActionName =
  | 'folder'
  | 'note'
  | 'docs'
  | 'text'
  | 'sheet'
  | 'slide'
  | 'excalidraw'
  | 'shortcut'
  | 'upload'

export interface CreateActionsOptions {
  /** Set when the folder is browsed through `/sharings/drives/<id>`. */
  driveId?: string
  docsEnabled: boolean
  officeEnabled: boolean
  excalidrawEnabled: boolean
  /** The Notes app is installed: a note is created and edited in it. */
  notesInstalled: boolean
}

/**
 * Which entries the create menu offers, in order.
 *
 * Inside a shared drive two entries drop out, as they do on twake-drive web:
 *
 * - `shortcut`: cozy-stack-client's ShortcutsCollection throws outright on a
 *   drive-scoped create, and the web hides the item on `isSharedDriveDoc`.
 * - `upload`: the upload path posts to our own instance's `/files/<dir>`, which
 *   does not address a directory hosted by the owner.
 * - `docs`: the document is created by our own instance's Docs backend through
 *   its bridge route, which cannot reach a directory hosted by the owner.
 */
export const createActionNames = ({
  driveId,
  docsEnabled,
  officeEnabled,
  excalidrawEnabled,
  notesInstalled
}: CreateActionsOptions): CreateActionName[] => {
  const inSharedDrive = !!driveId
  return [
    'folder' as const,
    ...(notesInstalled ? (['note'] as const) : []),
    ...(docsEnabled && !inSharedDrive ? (['docs'] as const) : []),
    ...(officeEnabled ? (['text', 'sheet', 'slide'] as const) : []),
    ...(excalidrawEnabled ? (['excalidraw'] as const) : []),
    ...(inSharedDrive ? [] : (['shortcut', 'upload'] as const))
  ]
}
