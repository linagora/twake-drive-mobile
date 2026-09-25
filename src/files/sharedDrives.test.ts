import { fetchSharedDrives, querySharedDriveFolder, toSharedDriveEntry } from './sharedDrives'

const buildClient = (
  drives: unknown[],
  folderDoc: unknown = null,
  children: unknown[] = [],
  included: unknown[] | undefined = undefined
): {
  client: never
  fetchSharedDrivesMock: jest.Mock
  query: jest.Mock
  queryAll: jest.Mock
} => {
  const fetchSharedDrivesMock = jest.fn().mockResolvedValue({ data: drives })
  const query = jest.fn().mockResolvedValue({ data: folderDoc, included })
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

  it('names the drive on the document query, so the stack serves it before the replica does', async () => {
    const { client, query } = buildClient([], { _id: 'folder-1', name: 'Reports' }, [])
    await querySharedDriveFolder(client, { driveId: 'sharing-A', owner: false }, 'folder-1')

    expect(query.mock.calls[0][0]).toMatchObject({ sharingId: 'sharing-A' })
  })

  // The listing is scoped by the driveId cozy-pouch-link stamps on every
  // document, the way twake-drive web's buildSharedDriveQuery reads a drive.
  // Scoping it with sharingById instead sent a Mango find to a drive route that
  // answers nothing, and FileCollection.find turns that into an empty folder.
  it('scopes the listing by the stamped field, not by a drive route', async () => {
    const { client, queryAll } = buildClient([], { _id: 'folder-1', name: 'Reports' }, [])
    await querySharedDriveFolder(client, { driveId: 'sharing-A', owner: false }, 'folder-1')

    const definition = queryAll.mock.calls[0][0]
    expect(definition.sharingId).toBeUndefined()
    expect(definition.selector).toMatchObject({ dir_id: 'folder-1', driveId: 'sharing-A' })
    expect(definition.indexedFields).toContain('driveId')
  })

  it('leaves an owned drive listing unscoped: it is in the main replica', async () => {
    const { client, queryAll } = buildClient([], { _id: 'folder-2', name: 'Mine' }, [])
    await querySharedDriveFolder(client, { driveId: 'sharing-B', owner: true }, 'folder-2')

    const definition = queryAll.mock.calls[0][0]
    expect(definition.selector.driveId).toBeUndefined()
    expect(definition.indexedFields).not.toContain('driveId')
  })

  it('leaves a drive the user owns unscoped: it is in their own replica', async () => {
    const { client, query, queryAll } = buildClient([], { _id: 'folder-2', name: 'Mine' }, [])
    await querySharedDriveFolder(client, { driveId: 'sharing-B', owner: true }, 'folder-2')

    expect(query.mock.calls[0][0].sharingId).toBeUndefined()
    expect(queryAll.mock.calls[0][0].sharingId).toBeUndefined()
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

  // twake-drive web reads a shared drive folder with a single call on the drive
  // route and takes its contents from `included` (buildSharedDriveFolderQuery).
  it('takes the children the drive route hands back with the folder', async () => {
    const { client } = buildClient(
      [],
      { _id: 'folder-1', name: 'Reports' },
      [],
      [
        { _id: 'a', name: 'a.pdf', type: 'file' },
        { _id: 'b', name: 'b.pdf', type: 'file' }
      ]
    )

    const res = await querySharedDriveFolder(
      client,
      { driveId: 'sharing-A', owner: false },
      'folder-1'
    )

    expect(res.children.map(c => c._id)).toEqual(['a', 'b'])
  })

  // The local replica answers the document alone, with no `included`.
  it('falls back to the replica listing when the route answered from cache', async () => {
    const { client } = buildClient([], { _id: 'folder-1', name: 'Reports' }, [
      { _id: 'c', name: 'c.pdf', type: 'file' }
    ])

    const res = await querySharedDriveFolder(
      client,
      { driveId: 'sharing-A', owner: false },
      'folder-1'
    )

    expect(res.children.map(c => c._id)).toEqual(['c'])
  })
})
