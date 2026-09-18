import { SharedDriveEntry } from './sharedDrives'

export type SharingsTab = 'with-me' | 'by-me' | 'drives'

export interface SharingRowFile {
  _id: string
  name: string
  type?: 'file' | 'directory'
  updated_at?: string
  created_at?: string
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

const defaultFileDate = (file: SharingRowFile): string | undefined =>
  file.updated_at ?? file.created_at

/**
 * Builds the rows of a sharings list out of the drives and the shared
 * documents, in the order asked.
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
  sortDir,
  getFileDate = defaultFileDate
}: {
  files: F[]
  drives: SharedDriveEntry[]
  tab: SharingsTab
  sortAttr?: 'name' | 'updated_at'
  sortDir: 'asc' | 'desc'
  /** The date a shared document was last touched. Defaults to the document's
   *  own dates; the shares view also folds in its sharing's. */
  getFileDate?: (file: SharingRowFile) => string | undefined
}): SharingRow<F>[] => {
  const direction = sortDir === 'asc' ? 1 : -1
  // A drive is shared as its root document, so that document also comes back
  // as a shared one. When it does, it is the better half of the pair: it
  // carries the size, the dates and the thumbnail the listing knows nothing
  // about. Keep it, and hang the drive on it — this is what twake-drive web's
  // useTransformFolderListHasSharedDriveShortcuts does.
  const documentByRootId = new Map<string, F>()
  for (const file of files) documentByRootId.set(file._id, file)

  // A drive can share a single file rather than a folder; it belongs with the
  // files, not above them with the folders.
  const driveRows: SharingRow<F>[] = drivesForTab(drives, tab).map(drive => {
    const document = drive.rootFolderId ? documentByRootId.get(drive.rootFolderId) : undefined
    return {
      key: `drive:${drive.driveId}`,
      name: document?.name ?? drive.name,
      updatedAt: document ? getFileDate(document) : drive.updatedAt,
      group: (drive.rootType === 'file' ? 2 : 0) as 0 | 1 | 2,
      drive,
      file: document
    }
  })
  const claimedRootIds = new Set(
    drives.map(drive => drive.rootFolderId).filter((id): id is string => !!id)
  )
  const fileRows: SharingRow<F>[] = files
    .filter(file => !claimedRootIds.has(file._id))
    .map(file => ({
      key: file._id,
      name: file.name,
      updatedAt: getFileDate(file),
      group: file.type === 'directory' ? 1 : 2,
      file
    }))

  const rows = [...driveRows, ...fileRows]
  const byName = (a: SharingRow<F>, b: SharingRow<F>): number =>
    direction * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

  // Sorting by date mixes folders and files, the way twake-drive web does in
  // this view (`groupDirectoriesFirstByUpdatedAt={false}`), and a row with no
  // date to compare goes last whichever way the sort runs.
  if (sortAttr === 'updated_at') {
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const aDate = a.row.updatedAt
        const bDate = b.row.updatedAt
        if (!aDate && !bDate) return a.index - b.index
        if (!aDate) return 1
        if (!bDate) return -1
        return direction * aDate.localeCompare(bDate) || a.index - b.index
      })
      .map(({ row }) => row)
  }

  return rows.sort((a, b) => a.group - b.group || byName(a, b))
}
