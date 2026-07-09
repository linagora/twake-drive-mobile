jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { moveEntry } from './moveEntry'

interface MockCollection {
  updateAttributes: jest.Mock
}

const buildClient = (col: MockCollection, query?: jest.Mock) =>
  ({
    collection: jest.fn(() => col),
    query: query ?? jest.fn().mockResolvedValue({ data: [] })
  }) as unknown as Parameters<typeof moveEntry>[0]

const entry = {
  _id: 'src',
  name: 'Report.pdf',
  type: 'file' as const,
  dir_id: 'old-parent'
}

describe('moveEntry', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('updates the entry dir_id and returns moved payload', async () => {
    const updateAttributes = jest.fn().mockResolvedValue({ data: { _id: 'src', dir_id: 'dest' } })
    const result = await moveEntry(buildClient({ updateAttributes }), entry, 'dest')
    expect(updateAttributes).toHaveBeenCalledWith('src', { dir_id: 'dest' })
    expect(result).toEqual({ moved: { _id: 'src', dir_id: 'dest' }, renamedTo: null })
  })

  it('triggers a pouch replication on success', async () => {
    const updateAttributes = jest.fn().mockResolvedValue({ data: { _id: 'src', dir_id: 'dest' } })
    const client = buildClient({ updateAttributes })
    await moveEntry(client, entry, 'dest')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('rethrows non-409 errors', async () => {
    const updateAttributes = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
    await expect(moveEntry(buildClient({ updateAttributes }), entry, 'dest')).rejects.toThrow(
      'boom'
    )
  })

  it('rethrows 409 when force is not set', async () => {
    const updateAttributes = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }))
    await expect(moveEntry(buildClient({ updateAttributes }), entry, 'dest')).rejects.toThrow(
      'conflict'
    )
  })

  it('on 409 with force: renames to a unique name (keep-both), never destroys', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 })
    const updateAttributes = jest
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ data: { _id: 'src', dir_id: 'dest' } })
    const query = jest
      .fn()
      .mockResolvedValue({ data: [{ name: 'Report.pdf' }, { name: 'Other.pdf' }] })
    const result = await moveEntry(buildClient({ updateAttributes }, query), entry, 'dest', {
      force: true
    })
    expect(updateAttributes).toHaveBeenNthCalledWith(2, 'src', {
      dir_id: 'dest',
      name: 'Report (1).pdf'
    })
    expect(result).toEqual({ moved: { _id: 'src', dir_id: 'dest' }, renamedTo: 'Report (1).pdf' })
  })

  it('on 409 with force but empty name: rethrows without touching the destination', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 })
    const updateAttributes = jest.fn().mockRejectedValue(conflict)
    const query = jest.fn()
    await expect(
      moveEntry(buildClient({ updateAttributes }, query), { ...entry, name: '' }, 'dest', {
        force: true
      })
    ).rejects.toThrow('conflict')
    expect(query).not.toHaveBeenCalled()
    expect(updateAttributes).toHaveBeenCalledTimes(1)
  })

  it('recognises 409 via err.response.status too', async () => {
    const updateAttributes = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('c'), { response: { status: 409 } }))
    await expect(moveEntry(buildClient({ updateAttributes }), entry, 'dest')).rejects.toThrow('c')
  })
})
