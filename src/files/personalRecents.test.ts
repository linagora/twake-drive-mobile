import {
  fetchMoreUntilRows,
  hasRecentActions,
  isUnreadableRecent,
  makeRowsFromRecents
} from './personalRecents'

const file = { _id: 'file-1', _type: 'io.cozy.files', name: 'report.pdf', type: 'file' as const }

const readableRecent = {
  _id: 'recent-1',
  _type: 'io.cozy.files.recents',
  name: 'report.pdf',
  type: 'file' as const,
  file: { data: file }
}

const unreadableRecent = {
  _id: 'recent-2',
  _type: 'io.cozy.files.recents',
  name: 'old.pdf',
  type: 'file' as const,
  file: { data: null }
}

describe('makeRowsFromRecents', () => {
  it('lists the file of each recent in the stack order', () => {
    const rows = makeRowsFromRecents([unreadableRecent, readableRecent])

    expect(rows.map(row => row._id)).toEqual(['recent-2', 'file-1'])
  })

  it('keeps the recent itself, with its last known name, when its file cannot be read', () => {
    const [row] = makeRowsFromRecents([unreadableRecent])

    expect(row.name).toBe('old.pdf')
    expect(isUnreadableRecent(row)).toBe(true)
    expect(row).not.toHaveProperty('file')
  })

  it('does not take a readable file for an unreadable recent', () => {
    const [row] = makeRowsFromRecents([readableRecent])

    expect(isUnreadableRecent(row)).toBe(false)
  })
})

describe('hasRecentActions', () => {
  it('offers the actions of a file of my drive', () => {
    expect(hasRecentActions(file)).toBe(true)
  })

  it('offers none on a trashed item', () => {
    expect(hasRecentActions({ ...file, dir_id: 'io.cozy.files.trash-dir' })).toBe(false)
    expect(hasRecentActions({ ...file, path: '/.cozy_trash/old', type: 'directory' })).toBe(false)
  })

  it('offers none on an item of a shared drive', () => {
    expect(hasRecentActions({ ...file, driveId: 'drive-1' })).toBe(false)
  })

  it('offers none on an item the user can no longer read', () => {
    expect(hasRecentActions(unreadableRecent)).toBe(false)
  })
})

describe('fetchMoreUntilRows', () => {
  it('follows the cursor while pages come back empty', async () => {
    const fetchMore = jest
      .fn()
      .mockResolvedValueOnce({ data: [], next: true })
      .mockResolvedValueOnce({ data: [], next: true })
      .mockResolvedValueOnce({ data: [readableRecent], next: true })

    await fetchMoreUntilRows(fetchMore)

    expect(fetchMore).toHaveBeenCalledTimes(3)
  })

  it('stops on an empty last page', async () => {
    const fetchMore = jest.fn().mockResolvedValue({ data: [], next: false })

    await fetchMoreUntilRows(fetchMore)

    expect(fetchMore).toHaveBeenCalledTimes(1)
  })
})
