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

  it('drops the document that is a drive root, keeping the drive row', () => {
    const rows = buildSharingRows({
      files: [file('root-drive-1', 'Marketing', 'directory')],
      drives: [drive('drive-1', { name: 'Marketing' })],
      tab: 'with-me',
      sortDir: 'asc'
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].drive?.driveId).toBe('drive-1')
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

  it('leaves the drives in name order, having no date to sort on', () => {
    const rows = buildSharingRows({
      files: [],
      drives: [drive('d2', { name: 'beta' }), drive('d1', { name: 'alpha' })],
      tab: 'with-me',
      sortAttr: 'updated_at',
      sortDir: 'desc'
    })
    expect(rows.map(r => r.name)).toEqual(['alpha', 'beta'])
  })
})
