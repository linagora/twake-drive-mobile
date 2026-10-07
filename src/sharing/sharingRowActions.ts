/**
 * What a line of the Sharing tab offers, depending on whose sharing it is.
 *
 * - shared by the user ("by me"): the same actions as on the other tabs;
 * - shared with the user ("with me"): download, share when the member may
 *   share further (cozy-sharing's `canReshare`), details for a file, and
 *   leaving the sharing (`revokeSelf`, gated by `canLeave`). Renaming, moving,
 *   trashing, keeping offline and favouriting belong to the owner;
 * - inside a folder opened from the tab: the content of a sharing, which the
 *   screen has always kept from being renamed or trashed.
 */
export type SharingRowScope = 'with-me' | 'by-me' | 'nested'

export interface SharingRowAccess {
  canReshare: boolean
  canLeave: boolean
}

interface FileRowHandlers<F> {
  onShare?: (file: F) => void
  onRename?: () => void
  onDelete?: () => void
  onMove?: (file: F) => void
  onInfo?: (file: F) => void
  onTogglePin?: (file: F) => void
}

interface FolderRowHandlers<F> {
  onShare?: (folder: F) => void
  onRename?: () => void
  onDelete?: () => void
  onMove?: (folder: F) => void
  onTogglePin?: (folder: F) => void
}

type Leave<F> = ((item: F) => void) | undefined

export const fileRowHandlersFor = <F, H extends FileRowHandlers<F>>(
  scope: SharingRowScope,
  base: H,
  access: SharingRowAccess,
  leave: () => void
): H & { onLeave?: Leave<F>; canFavorite?: boolean } => {
  if (scope === 'by-me') return base
  if (scope === 'nested') return { ...base, onRename: undefined, onDelete: undefined }
  return {
    ...base,
    onShare: access.canReshare ? base.onShare : undefined,
    onRename: undefined,
    onDelete: undefined,
    onMove: undefined,
    onTogglePin: undefined,
    onLeave: access.canLeave ? leave : undefined,
    canFavorite: false
  }
}

export const folderRowHandlersFor = <F, H extends FolderRowHandlers<F>>(
  scope: SharingRowScope,
  base: H,
  access: SharingRowAccess,
  extra: { leave: () => void; download: (folder: F) => void }
): H & { onLeave?: Leave<F>; onDownload?: (folder: F) => void; canFavorite?: boolean } => {
  if (scope === 'by-me') return base
  if (scope === 'nested') return { ...base, onRename: undefined, onDelete: undefined }
  return {
    ...base,
    onShare: access.canReshare ? base.onShare : undefined,
    onRename: undefined,
    onDelete: undefined,
    onMove: undefined,
    onTogglePin: undefined,
    onDownload: extra.download,
    onLeave: access.canLeave ? extra.leave : undefined,
    canFavorite: false
  }
}
