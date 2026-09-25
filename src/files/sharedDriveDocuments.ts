import { getSharedDriveRootIds } from './sharedDriveReplication'
import { SHARED_DRIVES_DIR_ID } from '@/client/queries'

interface MaybeDriveRoot {
  _id?: string
  dir_id?: string
}

/**
 * Whether a document is the root of a drive shared with the user.
 *
 * twake-drive web recognises those by their parent: a drive root is a child of
 * `io.cozy.files.shared-drives-dir`, which is what `buildRecentQuery` filters
 * on and what keeps them out of the drive listing there. A drive replicated
 * locally keeps the `dir_id` it has on its owner's instance instead, and for a
 * drive shared at their root that is `io.cozy.files.root-dir` — the same
 * constant as the user's own root. So the sharing's root folder id is checked
 * as well.
 */
export const isSharedDriveRoot = (doc: MaybeDriveRoot): boolean =>
  doc.dir_id === SHARED_DRIVES_DIR_ID || (!!doc._id && getSharedDriveRootIds().has(doc._id))

export const withoutSharedDriveRoots = <T extends MaybeDriveRoot>(docs: T[]): T[] =>
  docs.some(isSharedDriveRoot) ? docs.filter(doc => !isSharedDriveRoot(doc)) : docs
