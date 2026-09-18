import { SharedDriveEntry } from './sharedDrives'
import { buildSharingRows, drivesForTab } from './sharingRows'

const drive = (driveId: string, over: Partial<SharedDriveEntry> = {}): SharedDriveEntry => ({
  driveId,
  name: driveId,
  rootFolderId: `root-${driveId}`,
  owner: false,
  orgDrive: false,
  rootType: 'directory',
  ...over
})

const file = (
  _id: string,
  name: string,
  type: 'file' | 'directory' = 'file'
): {
  _id: string
  name: string
  type: 'file' | 'directory'
} => ({ _id, name, type })

describe('drivesForTab', () => {
  const drives = [
    drive('mine', { owner: true }),
    drive('theirs'),
    drive('org', { orgDrive: true, owner: true })
  ]

  it('lists a drive the user owns with what they share', () => {
    expect(drivesForTab(drives, 'by-me').map(d => d.driveId)).toEqual(['mine'])
  })

  it('lists a drive the user is a recipient of with what is shared with them', () => {
    expect(drivesForTab(drives, 'with-me').map(d => d.driveId)).toEqual(['theirs'])
  })

  it('keeps organisational drives in their own list', () => {
    expect(drivesForTab(drives, 'drives').map(d => d.driveId)).toEqual(['org'])
  })
})

describe('buildSharingRows', () => {
  it('puts the drives above the folders, above the files', () => {
    const rows = buildSharingRows({
      files: [file('f1', 'a file'), file('d1', 'a folder', 'directory')],
      drives: [drive('drive-1', { name: 'zzz drive' })],
      tab: 'with-me',
      sortDir: 'asc'
    })
    expect(rows.map(r => r.key)).toEqual(['drive:drive-1', 'd1', 'f1'])
  })

  it('sorts each group by name, in the direction asked', () => {
    const rows = buildSharingRows({
      files: [file('f1', 'beta'), file('f2', 'alpha')],
      drives: [],
      tab: 'with-me',
      sortDir: 'desc'
    })
    expect(rows.map(r => r.name)).toEqual(['beta', 'alpha'])
  })

  it('keeps the document of a drive root on the drive row, not twice', () => {
    const rows = buildSharingRows({
      files: [file('root-drive-1', 'Marketing', 'directory')],
      drives: [drive('drive-1', { name: 'Marketing' })],
      tab: 'with-me',
      sortDir: 'asc'
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].drive?.driveId).toBe('drive-1')
    // The document is what carries the size and the thumbnail.
    expect(rows[0].file?._id).toBe('root-drive-1')
  })

  it('dates a drive on its document when the user has it, not on the sharing', () => {
    const rows = buildSharingRows({
      files: [
        {
          _id: 'root-drive-1',
          name: 'Marketing',
          type: 'directory',
          updated_at: '2026-09-01T00:00:00Z'
        }
      ],
      drives: [drive('drive-1', { name: 'Marketing', updatedAt: '2026-01-01T00:00:00Z' })],
      tab: 'with-me',
      sortAttr: 'updated_at',
      sortDir: 'desc'
    })
    expect(rows[0].updatedAt).toBe('2026-09-01T00:00:00Z')
  })
})

describe('a drive that shares a single file', () => {
  it('is listed with the files, not with the folders', () => {
    const rows = buildSharingRows({
      files: [file('d1', 'a folder', 'directory')],
      drives: [drive('drive-1', { name: 'a document.docx', rootType: 'file' })],
      tab: 'with-me',
      sortDir: 'asc'
    })
    expect(rows.map(r => r.key)).toEqual(['d1', 'drive:drive-1'])
  })
})

describe('sorting by date', () => {
  it('orders the documents by date, newest first', () => {
    const rows = buildSharingRows({
      files: [
        { _id: 'f1', name: 'old', type: 'file', updated_at: '2026-01-01T00:00:00Z' },
        { _id: 'f2', name: 'new', type: 'file', updated_at: '2026-09-01T00:00:00Z' }
      ],
      drives: [],
      tab: 'with-me',
      sortAttr: 'updated_at',
      sortDir: 'desc'
    })
    expect(rows.map(r => r.name)).toEqual(['new', 'old'])
  })

  it('sorts a drive on its sharing date, the only one it has', () => {
    const rows = buildSharingRows({
      files: [{ _id: 'f1', name: 'a file', type: 'file', updated_at: '2026-05-01T00:00:00Z' }],
      drives: [
        drive('d1', { name: 'older drive', updatedAt: '2026-01-01T00:00:00Z' }),
        drive('d2', { name: 'newer drive', updatedAt: '2026-09-01T00:00:00Z' })
      ],
      tab: 'with-me',
      sortAttr: 'updated_at',
      sortDir: 'desc'
    })
    expect(rows.map(r => r.name)).toEqual(['newer drive', 'a file', 'older drive'])
  })

  it('mixes folders and files under a date sort, like the web view does', () => {
    const rows = buildSharingRows({
      files: [
        { _id: 'd1', name: 'old folder', type: 'directory', updated_at: '2026-01-01T00:00:00Z' },
        { _id: 'f1', name: 'new file', type: 'file', updated_at: '2026-09-01T00:00:00Z' }
      ],
      drives: [],
      tab: 'with-me',
      sortAttr: 'updated_at',
      sortDir: 'desc'
    })
    expect(rows.map(r => r.name)).toEqual(['new file', 'old folder'])
  })

  it('leaves a row with no date at the end, both ways', () => {
    const build = (sortDir: 'asc' | 'desc'): string[] =>
      buildSharingRows({
        files: [
          { _id: 'f1', name: 'dated', type: 'file', updated_at: '2026-01-01T00:00:00Z' },
          { _id: 'f2', name: 'undated', type: 'file' }
        ],
        drives: [],
        tab: 'with-me',
        sortAttr: 'updated_at',
        sortDir
      }).map(r => r.name)
    expect(build('desc')).toEqual(['dated', 'undated'])
    expect(build('asc')).toEqual(['dated', 'undated'])
  })

  it('falls back to the created date when a document was never updated', () => {
    const rows = buildSharingRows({
      files: [
        { _id: 'f1', name: 'created only', type: 'file', created_at: '2026-09-01T00:00:00Z' },
        { _id: 'f2', name: 'updated', type: 'file', updated_at: '2026-01-01T00:00:00Z' }
      ],
      drives: [],
      tab: 'with-me',
      sortAttr: 'updated_at',
      sortDir: 'desc'
    })
    expect(rows.map(r => r.name)).toEqual(['created only', 'updated'])
  })
})
