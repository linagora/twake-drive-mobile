const mockStore = new Map<string, string>()
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => mockStore.set(k, v)
  })
}))

const mockFetchSharedDrives = jest.fn()
jest.mock('./sharedDrives', () => ({
  fetchSharedDrives: (...args: unknown[]) => mockFetchSharedDrives(...args)
}))

import {
  getCachedSharedDrives,
  registerSharedDrive,
  restoreSharedDriveReplication,
  sharedDriveDoctype,
  syncSharedDrives
} from './sharedDriveReplication'

const buildClient = (
  doctypes: string[] = []
): {
  client: never
  addDoctype: jest.Mock
  removeDoctype: jest.Mock
  syncImmediately: jest.Mock
} => {
  const syncImmediately = jest.fn()
  const addDoctype = jest.fn(async (doctype: string) => {
    doctypes.push(doctype)
  })
  const removeDoctype = jest.fn(async (doctype: string) => {
    const at = doctypes.indexOf(doctype)
    if (at >= 0) doctypes.splice(at, 1)
  })
  return {
    client: {
      links: [{ doctypes, addDoctype, removeDoctype, pouches: { syncImmediately } }]
    } as never,
    addDoctype,
    removeDoctype,
    syncImmediately
  }
}

const drive = (driveId: string, owner = false): Record<string, unknown> => ({
  driveId,
  name: driveId,
  rootFolderId: `root-${driveId}`,
  owner
})

describe('shared drive replication', () => {
  beforeEach(() => {
    mockStore.clear()
    mockFetchSharedDrives.mockReset()
  })

  it('registers a drive on its own doctype and syncs it now', async () => {
    const { client, addDoctype, syncImmediately } = buildClient()
    expect(await registerSharedDrive(client, 'drive-1')).toBe(true)
    expect(addDoctype).toHaveBeenCalledWith(sharedDriveDoctype('drive-1'), {
      strategy: 'fromRemote',
      driveId: 'drive-1'
    })
    expect(syncImmediately).toHaveBeenCalled()
  })

  it('does not register a drive the link already holds', async () => {
    const { client, addDoctype } = buildClient([sharedDriveDoctype('drive-1')])
    expect(await registerSharedDrive(client, 'drive-1')).toBe(false)
    expect(addDoctype).not.toHaveBeenCalled()
  })

  it('keeps the drive list offline without replicating any of them', async () => {
    mockFetchSharedDrives.mockResolvedValue([drive('drive-1'), drive('drive-2', true)])
    const { client, addDoctype } = buildClient()
    await syncSharedDrives(client)
    expect(getCachedSharedDrives()).toHaveLength(2)
    expect(addDoctype).not.toHaveBeenCalled()
  })

  it('registers again, on the next start, the drives already replicated', async () => {
    const { client } = buildClient()
    await registerSharedDrive(client, 'drive-1')

    const restarted = buildClient()
    await restoreSharedDriveReplication(restarted.client)
    expect(restarted.addDoctype).toHaveBeenCalledTimes(1)
    expect(restarted.addDoctype).toHaveBeenCalledWith(
      sharedDriveDoctype('drive-1'),
      expect.anything()
    )
  })

  it('drops the local copy of a drive the user lost access to', async () => {
    mockFetchSharedDrives.mockResolvedValue([drive('drive-1'), drive('drive-2')])
    const { client } = buildClient()
    await registerSharedDrive(client, 'drive-1')
    await registerSharedDrive(client, 'drive-2')
    await syncSharedDrives(client)

    mockFetchSharedDrives.mockResolvedValue([drive('drive-1')])
    const { client: client2, removeDoctype } = buildClient([
      sharedDriveDoctype('drive-1'),
      sharedDriveDoctype('drive-2')
    ])
    await syncSharedDrives(client2)
    expect(removeDoctype).toHaveBeenCalledWith(sharedDriveDoctype('drive-2'))
    expect(getCachedSharedDrives().map(d => d.driveId)).toEqual(['drive-1'])
  })

  it('drops a drive the user now owns: its files are in their own replica', async () => {
    mockFetchSharedDrives.mockResolvedValue([drive('drive-1', true)])
    const { client } = buildClient()
    await registerSharedDrive(client, 'drive-1')
    const { client: client2, removeDoctype } = buildClient([sharedDriveDoctype('drive-1')])
    await syncSharedDrives(client2)
    expect(removeDoctype).toHaveBeenCalledWith(sharedDriveDoctype('drive-1'))
  })
})
