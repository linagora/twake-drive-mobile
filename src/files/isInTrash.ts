import { FileQueryResult, TRASH_DIR_ID } from '@/client/queries'

/**
 * cozy-stack does not reliably set `trashed` on a trashed folder, but a
 * trashed item always sits directly under the trash dir or somewhere under
 * the `/.cozy_trash` path.
 */
export const isInTrash = (doc: Pick<FileQueryResult, 'trashed' | 'dir_id' | 'path'>): boolean =>
  doc.trashed === true ||
  doc.dir_id === TRASH_DIR_ID ||
  (typeof doc.path === 'string' && doc.path.startsWith('/.cozy_trash'))
