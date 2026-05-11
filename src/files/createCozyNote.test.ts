jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { createCozyNote } from './createCozyNote'

const makeClient = (createImpl: (...args: unknown[]) => unknown) =>
  ({
    collection: () => ({ create: createImpl })
  }) as unknown as import('cozy-client').default

describe('createCozyNote', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('calls io.cozy.notes.create with dir_id', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ data: { _id: 'note-1', attributes: { name: 'Untitled' } } })
    const result = await createCozyNote(makeClient(create), 'dir-X')
    expect(create).toHaveBeenCalledWith({ dir_id: 'dir-X' })
    expect(result).toEqual({ _id: 'note-1', name: 'Untitled' })
  })

  it('throws when the response has no id', async () => {
    const create = jest.fn().mockResolvedValue({ data: {} })
    await expect(createCozyNote(makeClient(create), 'dir-X')).rejects.toThrow(/no id/)
  })

  it('triggers pouch replications for files and notes on success', async () => {
    const create = jest
      .fn()
      .mockResolvedValue({ data: { _id: 'note-1', attributes: { name: 'Untitled' } } })
    const client = makeClient(create)
    await createCozyNote(client, 'dir-X')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.notes')
    expect(triggerPouchReplication).toHaveBeenCalledTimes(2)
  })

  it('does NOT trigger pouch replication when the stack call fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('boom'))
    const client = makeClient(create)
    await expect(createCozyNote(client, 'dir-X')).rejects.toThrow('boom')
    expect(triggerPouchReplication).not.toHaveBeenCalled()
  })
})
