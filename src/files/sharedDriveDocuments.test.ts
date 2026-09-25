import { isSharedDriveRoot, withoutSharedDriveRoots } from './sharedDriveDocuments'

const mockRootIds = jest.fn<Set<string>, []>()

jest.mock('./sharedDriveReplication', () => ({
  getSharedDriveRootIds: () => mockRootIds()
}))

beforeEach(() => {
  mockRootIds.mockReturnValue(new Set(['drive-root']))
})

describe('isSharedDriveRoot', () => {
  // How twake-drive web recognises one, and what the stack answers with.
  it('recognises a child of the shared drives directory', () => {
    expect(isSharedDriveRoot({ _id: 'x', dir_id: 'io.cozy.files.shared-drives-dir' })).toBe(true)
  })

  // A replicated drive keeps its owner's dir_id, and the root dir id is the
  // same constant on every instance.
  it('recognises a replicated drive root sitting at the owner root', () => {
    expect(isSharedDriveRoot({ _id: 'drive-root', dir_id: 'io.cozy.files.root-dir' })).toBe(true)
  })

  it('leaves the user own folders alone', () => {
    expect(isSharedDriveRoot({ _id: 'my-folder', dir_id: 'io.cozy.files.root-dir' })).toBe(false)
  })

  // Web shows shared drive content in Récents; only the roots are filtered.
  it('leaves the content of a shared drive alone', () => {
    expect(isSharedDriveRoot({ _id: 'a-file', dir_id: 'drive-root' })).toBe(false)
  })
})

describe('withoutSharedDriveRoots', () => {
  it('drops a drive root that reached the user own root listing', () => {
    const docs = [
      { _id: 'my-folder', dir_id: 'io.cozy.files.root-dir' },
      { _id: 'drive-root', dir_id: 'io.cozy.files.root-dir' }
    ]
    expect(withoutSharedDriveRoots(docs)).toEqual([docs[0]])
  })

  it('returns the same array when no root is present', () => {
    const docs = [{ _id: 'a' }, { _id: 'b' }]
    expect(withoutSharedDriveRoots(docs)).toBe(docs)
  })
})
