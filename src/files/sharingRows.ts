import { SharedDriveEntry } from './sharedDrives'

export type SharingsTab = 'with-me' | 'by-me' | 'drives'

export interface SharingRowFile {
  _id: string
  name: string
  type?: 'file' | 'directory'
}

/** One line of the sharings list: a shared drive, or a shared document.
 *  `group` keeps drives above folders above files whatever the sort. */
export interface SharingRow<F extends SharingRowFile = SharingRowFile> {
  key: string
  name: string
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
  sortDir
}: {
  files: F[]
  drives: SharedDriveEntry[]
  tab: SharingsTab
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
  const fileRows: SharingRow<F>[] = files
    .filter(file => !driveRootIds.has(file._id))
    .map(file => ({
      key: file._id,
      name: file.name,
      group: file.type === 'directory' ? 1 : 2,
      file
    }))
  return [...driveRows, ...fileRows].sort(
    (a, b) =>
      a.group - b.group ||
      direction * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )
}
