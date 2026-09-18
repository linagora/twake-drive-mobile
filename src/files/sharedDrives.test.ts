import { fetchSharedDrives, querySharedDriveFolder, toSharedDriveEntry } from './sharedDrives'

const buildClient = (
  drives: unknown[],
  folderDoc: unknown = null,
  children: unknown[] = []
): {
  client: never
  fetchSharedDrivesMock: jest.Mock
  query: jest.Mock
  queryAll: jest.Mock
} => {
  const fetchSharedDrivesMock = jest.fn().mockResolvedValue({ data: drives })
  const query = jest.fn().mockResolvedValue({ data: folderDoc })
  const queryAll = jest.fn().mockResolvedValue(children)
  return {
    client: {
      query,
      queryAll,
      getStackClient: () => ({
        collection: () => ({ fetchSharedDrives: fetchSharedDrivesMock })
      })
    } as never,
    fetchSharedDrivesMock,
    query,
    queryAll
  }
}

describe('fetchSharedDrives', () => {
  it('maps the sharings from GET /sharings/drives', async () => {
    const { client } = buildClient([
      {
        _id: 'sharing-A',
        description: 'Marketing',
        owner: false,
        rules: [{ values: ['root-folder-A'] }]
      }
    ])
    expect(await fetchSharedDrives(client)).toEqual([
      {
        driveId: 'sharing-A',
        name: 'Marketing',
        rootFolderId: 'root-folder-A',
        owner: false,
        orgDrive: false,
        rootType: 'directory'
      }
    ])
  })

  it('reads a sharing served with its attributes nested', () => {
    expect(
      toSharedDriveEntry({
        id: 'sharing-B',
        attributes: { description: 'Legal', owner: true, rules: [{ values: ['root-folder-B'] }] }
      })
    ).toEqual({
      driveId: 'sharing-B',
      name: 'Legal',
      rootFolderId: 'root-folder-B',
      owner: true,
      orgDrive: false,
      rootType: 'directory'
    })
  })

  it('marks an organisational drive', () => {
    expect(toSharedDriveEntry({ _id: 'sharing-D', org_drive: true })?.orgDrive).toBe(true)
  })

  it('reads a drive that shares a single file', () => {
    expect(toSharedDriveEntry({ _id: 'sharing-E', drive_root_type: 'file' })?.rootType).toBe('file')
  })

  it('drops a sharing with no id', () => {
    expect(toSharedDriveEntry({ description: 'Nameless' })).toBeNull()
  })

  it('leaves rootFolderId null when the sharing carries no rule', () => {
    expect(toSharedDriveEntry({ _id: 'sharing-C', description: 'Empty' })?.rootFolderId).toBeNull()
  })
})

describe('querySharedDriveFolder', () => {
  it('scopes the queries to the drive the user is a recipient of', async () => {
    const { client, query, queryAll } = buildClient([], { _id: 'folder-1', name: 'Reports' }, [
      { _id: 'file-1', name: 'a.pdf', type: 'file' }
    ])
    const res = await querySharedDriveFolder(
      client,
      { driveId: 'sharing-A', owner: false },
      'folder-1'
    )

    expect(query.mock.calls[0][1]).toMatchObject({ driveId: 'sharing-A' })
    expect(queryAll.mock.calls[0][1]).toMatchObject({ driveId: 'sharing-A' })
    expect(res.folder).toEqual({ _id: 'folder-1', name: 'Reports' })
    expect(res.children).toHaveLength(1)
  })

  it('reads a drive the user owns from their own replica, with no drive scope', async () => {
    const { client, query, queryAll } = buildClient([], { _id: 'folder-2', name: 'Mine' }, [])
    await querySharedDriveFolder(client, { driveId: 'sharing-B', owner: true }, 'folder-2')

    expect(query.mock.calls[0][1]).not.toHaveProperty('driveId')
    expect(queryAll.mock.calls[0][1]).not.toHaveProperty('driveId')
  })

  it('survives a folder the local replica does not hold yet', async () => {
    const { client } = buildClient([], null, [])
    const res = await querySharedDriveFolder(
      client,
      { driveId: 'sharing-A', owner: false },
      'folder-3'
    )
    expect(res.folder).toBeNull()
    expect(res.children).toEqual([])
  })
})
