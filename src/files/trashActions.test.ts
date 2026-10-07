jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

jest.mock('@/pouchdb/purgeLocalTrash', () => ({
  purgeLocalTrash: jest.fn().mockResolvedValue(undefined),
  purgeLocalEntry: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('./applyStackDoc', () => ({
  applyStackDoc: jest.fn().mockResolvedValue(undefined)
}))

import { purgeLocalEntry, purgeLocalTrash } from '@/pouchdb/purgeLocalTrash'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

import { applyStackDoc } from './applyStackDoc'
import { restoreEntry, emptyTrash, destroyEntry } from './trashActions'

const buildClient = (methods: { restore?: jest.Mock; emptyTrash?: jest.Mock }) =>
  ({
    collection: jest.fn(() => ({
      restore: methods.restore ?? jest.fn(),
      emptyTrash: methods.emptyTrash ?? jest.fn()
    }))
  }) as unknown as Parameters<typeof restoreEntry>[0]

describe('restoreEntry', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('calls collection.restore with the id', async () => {
    const restore = jest.fn().mockResolvedValue({ data: { _id: 'a', name: 'doc' } })
    await restoreEntry(buildClient({ restore }), 'a')
    expect(restore).toHaveBeenCalledWith('a')
  })

  it('returns the restored doc', async () => {
    const restore = jest.fn().mockResolvedValue({ data: { _id: 'a', name: 'doc' } })
    const res = await restoreEntry(buildClient({ restore }), 'a')
    expect(res).toEqual({ _id: 'a', name: 'doc' })
  })

  it('propagates errors from restore', async () => {
    const restore = jest.fn().mockRejectedValue(new Error('boom'))
    await expect(restoreEntry(buildClient({ restore }), 'a')).rejects.toThrow('boom')
  })

  it('triggers a pouch replication on success', async () => {
    const restore = jest.fn().mockResolvedValue({ data: { _id: 'a', name: 'doc' } })
    const client = buildClient({ restore })
    await restoreEntry(client, 'a')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('writes the restored document into the local database and the store', async () => {
    ;(applyStackDoc as jest.Mock).mockClear()
    const restore = jest.fn().mockResolvedValue({ data: { _id: 'a', name: 'doc' } })
    const client = buildClient({ restore })
    await restoreEntry(client, 'a')
    expect(applyStackDoc).toHaveBeenCalledWith(client, {
      _id: 'a',
      name: 'doc'
    })
  })

  it('does NOT trigger pouch replication on failure', async () => {
    const restore = jest.fn().mockRejectedValue(new Error('boom'))
    const client = buildClient({ restore })
    await expect(restoreEntry(client, 'a')).rejects.toThrow('boom')
    expect(triggerPouchReplication).not.toHaveBeenCalled()
  })
})

describe('emptyTrash', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('calls collection.emptyTrash with no args', async () => {
    const trash = jest.fn().mockResolvedValue({})
    await emptyTrash(buildClient({ emptyTrash: trash }))
    expect(trash).toHaveBeenCalledWith()
  })

  it('propagates errors from emptyTrash', async () => {
    const trash = jest.fn().mockRejectedValue(new Error('boom'))
    await expect(emptyTrash(buildClient({ emptyTrash: trash }))).rejects.toThrow('boom')
  })

  it('triggers a pouch replication on success', async () => {
    const trash = jest.fn().mockResolvedValue({})
    const client = buildClient({ emptyTrash: trash })
    await emptyTrash(client)
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('does NOT trigger pouch replication on failure', async () => {
    const trash = jest.fn().mockRejectedValue(new Error('boom'))
    const client = buildClient({ emptyTrash: trash })
    await expect(emptyTrash(client)).rejects.toThrow('boom')
    expect(triggerPouchReplication).not.toHaveBeenCalled()
  })

  it('removes the trashed documents from the local database once the stack emptied it', async () => {
    ;(purgeLocalTrash as jest.Mock).mockClear()
    const trash = jest.fn().mockResolvedValue({})
    const client = buildClient({ emptyTrash: trash })
    await emptyTrash(client)
    expect(purgeLocalTrash).toHaveBeenCalledWith(client)
  })

  it('leaves the local database alone when the stack fails', async () => {
    ;(purgeLocalTrash as jest.Mock).mockClear()
    const trash = jest.fn().mockRejectedValue(new Error('boom'))
    await expect(emptyTrash(buildClient({ emptyTrash: trash }))).rejects.toThrow('boom')
    expect(purgeLocalTrash).not.toHaveBeenCalled()
  })
})

describe('destroyEntry', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  const buildStackClient = (fetchJSON: jest.Mock) =>
    ({ getStackClient: () => ({ fetchJSON }) }) as unknown as Parameters<typeof destroyEntry>[0]

  it('deletes the doc from the trash', async () => {
    const fetchJSON = jest.fn().mockResolvedValue({})
    await destroyEntry(buildStackClient(fetchJSON), 'a')
    expect(fetchJSON).toHaveBeenCalledWith('DELETE', '/files/trash/a')
  })

  it('triggers a pouch replication on success', async () => {
    const client = buildStackClient(jest.fn().mockResolvedValue({}))
    await destroyEntry(client, 'a')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('purges the doc from the local database once the stack deleted it', async () => {
    ;(purgeLocalEntry as jest.Mock).mockClear()
    const client = buildStackClient(jest.fn().mockResolvedValue({}))
    await destroyEntry(client, 'a')
    expect(purgeLocalEntry).toHaveBeenCalledWith(client, 'a')
  })

  it('keeps the local doc when the stack refuses', async () => {
    ;(purgeLocalEntry as jest.Mock).mockClear()
    const client = buildStackClient(jest.fn().mockRejectedValue(new Error('boom')))
    await expect(destroyEntry(client, 'a')).rejects.toThrow('boom')
    expect(purgeLocalEntry).not.toHaveBeenCalled()
  })

  it('propagates the error and does not replicate on failure', async () => {
    const client = buildStackClient(jest.fn().mockRejectedValue(new Error('boom')))
    await expect(destroyEntry(client, 'a')).rejects.toThrow('boom')
    expect(triggerPouchReplication).not.toHaveBeenCalled()
  })
})
