import { getSharedDriveRootIds } from './sharedDriveReplication'

interface MaybeDriveDocument {
  _id?: string
  /** Stamped by cozy-pouch-link on every document it pulls for a drive. */
  driveId?: string
}

/**
 * Whether a document belongs to a drive shared with the user, and so has no
 * place in a listing of their own files.
 *
 * Two signals, because a drive is read from its local replica once it has one
 * and from the stack until then: the replica stamps `driveId` on what it
 * pulls, while a stack response carries no such mark and is recognised by the
 * root folder its sharing points at.
 */
export const belongsToASharedDrive = (doc: MaybeDriveDocument): boolean =>
  !!doc.driveId || (!!doc._id && getSharedDriveRootIds().has(doc._id))

export const withoutSharedDriveDocuments = <T extends MaybeDriveDocument>(docs: T[]): T[] =>
  docs.some(belongsToASharedDrive) ? docs.filter(doc => !belongsToASharedDrive(doc)) : docs
