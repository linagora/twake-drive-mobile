import { belongsToASharedDrive, withoutSharedDriveDocuments } from './sharedDriveDocuments'

const mockRootIds = jest.fn<Set<string>, []>()

jest.mock('./sharedDriveReplication', () => ({
  getSharedDriveRootIds: () => mockRootIds()
}))

beforeEach(() => {
  mockRootIds.mockReturnValue(new Set(['root-of-canut']))
})

describe('belongsToASharedDrive', () => {
  it('recognises a document the drive replica stamped', () => {
    expect(belongsToASharedDrive({ _id: 'some-file', driveId: 'drive-1' })).toBe(true)
  })

  it('recognises a drive root served by the stack, which carries no stamp', () => {
    expect(belongsToASharedDrive({ _id: 'root-of-canut' })).toBe(true)
  })

  it('leaves the user own documents alone', () => {
    expect(belongsToASharedDrive({ _id: 'my-folder' })).toBe(false)
  })
})

describe('withoutSharedDriveDocuments', () => {
  // A drive root sits at its owner's root, so it carries `io.cozy.files.root-dir`
  // just like the user's own folders, and cozy-client's autoQueryUpdater adds it
  // to the drive listing as soon as the drive is opened.
  it('drops a drive root that reached the user own root listing', () => {
    const docs = [
      { _id: 'my-folder', dir_id: 'io.cozy.files.root-dir' },
      { _id: 'root-of-canut', dir_id: 'io.cozy.files.root-dir', driveId: 'drive-1' }
    ]
    expect(withoutSharedDriveDocuments(docs)).toEqual([docs[0]])
  })

  it('returns the same array when nothing belongs to a drive', () => {
    const docs = [{ _id: 'a' }, { _id: 'b' }]
    expect(withoutSharedDriveDocuments(docs)).toBe(docs)
  })
})
