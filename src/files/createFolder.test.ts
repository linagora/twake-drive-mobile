jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { createFolder, FolderConflictError } from './createFolder'

const makeClient = (createImpl: (...args: unknown[]) => unknown) =>
  ({
    collection: () => ({ create: createImpl })
  }) as unknown as import('cozy-client').default

describe('createFolder', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('calls collection.create with name + dirId + type:directory', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ data: { _id: 'new', name: 'Foo', type: 'directory' } })
    const result = await createFolder(makeClient(create), 'Foo', 'parent-id')
    expect(create).toHaveBeenCalledWith({
      name: 'Foo',
      dirId: 'parent-id',
      type: 'directory'
    })
    expect(result).toEqual({ _id: 'new', name: 'Foo', type: 'directory' })
  })

  it('trims the name', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ data: { _id: 'new', name: 'Foo', type: 'directory' } })
    await createFolder(makeClient(create), '  Foo  ', 'parent-id')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Foo' }))
  })

  it('throws on empty name', async () => {
    const create = jest.fn()
    await expect(createFolder(makeClient(create), '   ', 'parent-id')).rejects.toThrow(/empty/)
    expect(create).not.toHaveBeenCalled()
  })

  it('throws FolderConflictError on 409 (status on error)', async () => {
    const err = Object.assign(new Error('conflict'), { status: 409 })
    const create = jest.fn().mockRejectedValue(err)
    await expect(createFolder(makeClient(create), 'Foo', 'parent-id')).rejects.toBeInstanceOf(
      FolderConflictError
    )
  })

  it('throws FolderConflictError on 409 (status on response)', async () => {
    const err = Object.assign(new Error('conflict'), { response: { status: 409 } })
    const create = jest.fn().mockRejectedValue(err)
    await expect(createFolder(makeClient(create), 'Foo', 'parent-id')).rejects.toBeInstanceOf(
      FolderConflictError
    )
  })

  it('throws original error on other failures', async () => {
    const err = new Error('boom')
    const create = jest.fn().mockRejectedValue(err)
    await expect(createFolder(makeClient(create), 'Foo', 'parent-id')).rejects.toBe(err)
  })

  it('triggers a pouch replication on success', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ data: { _id: 'new', name: 'Foo', type: 'directory' } })
    const client = makeClient(create)
    await createFolder(client, 'Foo', 'parent-id')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('does NOT trigger pouch replication on failure', async () => {
    const create = jest.fn().mockRejectedValue(new Error('boom'))
    const client = makeClient(create)
    await expect(createFolder(client, 'Foo', 'parent-id')).rejects.toThrow('boom')
    expect(triggerPouchReplication).not.toHaveBeenCalled()
  })
})
