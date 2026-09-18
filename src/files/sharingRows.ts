import { SharedDriveEntry } from './sharedDrives'

export type SharingsTab = 'with-me' | 'by-me' | 'drives'

export interface SharingRowFile {
  _id: string
  name: string
  type?: 'file' | 'directory'
  updated_at?: string
}

/** One line of the sharings list: a shared drive, or a shared document.
 *  `group` keeps drives above folders above files whatever the sort. */
export interface SharingRow<F extends SharingRowFile = SharingRowFile> {
  key: string
  name: string
  updatedAt?: string
  group: 0 | 1 | 2
  drive?: SharedDriveEntry
  file?: F
}

/**
 * The drives that belong to a tab.
 *
 * A drive is listed with the documents it shares: under "by me" when the user
 * owns it, under "with me" otherwise. Only organisational drives get a list of
 * their own, the way twake-drive web splits them.
 */
export const drivesForTab = (drives: SharedDriveEntry[], tab: SharingsTab): SharedDriveEntry[] =>
  drives.filter(drive =>
    tab === 'drives' ? drive.orgDrive : !drive.orgDrive && drive.owner === (tab === 'by-me')
  )

/**
 * Builds the rows of a sharings list out of the drives and the shared
 * documents, sorted by name.
 *
 * A drive is shared as its root folder, so that folder comes back as a shared
 * document too; the drive row wins, since that is the one that opens the
 * drive.
 */
export const buildSharingRows = <F extends SharingRowFile>({
  files,
  drives,
  tab,
  sortAttr = 'name',
  sortDir
}: {
  files: F[]
  drives: SharedDriveEntry[]
  tab: SharingsTab
  sortAttr?: 'name' | 'updated_at'
  sortDir: 'asc' | 'desc'
}): SharingRow<F>[] => {
  const direction = sortDir === 'asc' ? 1 : -1
  const driveRootIds = new Set(
    drives.map(drive => drive.rootFolderId).filter((id): id is string => !!id)
  )
  // A drive can share a single file rather than a folder; it belongs with the
  // files, not above them with the folders.
  const driveRows: SharingRow<F>[] = drivesForTab(drives, tab).map(drive => ({
    key: `drive:${drive.driveId}`,
    name: drive.name,
    group: drive.rootType === 'file' ? 2 : 0,
    drive
  }))
  // The listing carries no date for a drive, so a date sort leaves them in
  // name order rather than in an order that would mean nothing.
  const fileRows: SharingRow<F>[] = files
    .filter(file => !driveRootIds.has(file._id))
    .map(file => ({
      key: file._id,
      name: file.name,
      updatedAt: file.updated_at,
      group: file.type === 'directory' ? 1 : 2,
      file
    }))
  const byName = (a: SharingRow<F>, b: SharingRow<F>): number =>
    direction * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  return [...driveRows, ...fileRows].sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group
    if (sortAttr === 'updated_at') {
      if (!a.updatedAt && !b.updatedAt)
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      return direction * (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') || byName(a, b)
    }
    return byName(a, b)
  })
}
