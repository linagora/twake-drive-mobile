jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { moveEntry } from './moveEntry'

interface MockCollection {
  updateAttributes: jest.Mock
  statByPath: jest.Mock
  destroy: jest.Mock
  get: jest.Mock
}

const buildClient = (col: MockCollection) =>
  ({
    collection: jest.fn(() => col)
  }) as unknown as Parameters<typeof moveEntry>[0]

const buildCollection = (overrides: Partial<MockCollection> = {}): MockCollection => ({
  updateAttributes: jest.fn(),
  statByPath: jest.fn(),
  destroy: jest.fn(),
  get: jest.fn().mockResolvedValue({ data: { _id: 'dest', name: 'Dest', path: '/Drive/Dest' } }),
  ...overrides
})

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
    const updateAttributes = jest.fn().mockResolvedValue({
      data: { _id: 'src', dir_id: 'dest' }
    })
    const col = buildCollection({ updateAttributes })
    const result = await moveEntry(buildClient(col), entry, 'dest')
    expect(updateAttributes).toHaveBeenCalledWith('src', { dir_id: 'dest' })
    expect(result).toEqual({
      moved: { _id: 'src', dir_id: 'dest' },
      deleted: null
    })
  })

  it('triggers a pouch replication on success', async () => {
    const updateAttributes = jest.fn().mockResolvedValue({
      data: { _id: 'src', dir_id: 'dest' }
    })
    const client = buildClient(buildCollection({ updateAttributes }))
    await moveEntry(client, entry, 'dest')
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('rethrows non-409 errors', async () => {
    const updateAttributes = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
    await expect(
      moveEntry(buildClient(buildCollection({ updateAttributes })), entry, 'dest')
    ).rejects.toThrow('boom')
  })

  it('rethrows 409 when force is not set', async () => {
    const updateAttributes = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }))
    await expect(
      moveEntry(buildClient(buildCollection({ updateAttributes })), entry, 'dest')
    ).rejects.toThrow('conflict')
  })

  it('on 409 with force: stats dest path, destroys conflict, retries', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 })
    const updateAttributes = jest
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ data: { _id: 'src', dir_id: 'dest' } })
    const statByPath = jest.fn().mockResolvedValue({
      data: { _id: 'other', name: 'Report.pdf', type: 'file' }
    })
    const destroy = jest.fn().mockResolvedValue({})
    const get = jest.fn().mockResolvedValue({
      data: { _id: 'dest', name: 'Dest', path: '/Drive/Dest' }
    })
    const col = buildCollection({ updateAttributes, statByPath, destroy, get })
    const result = await moveEntry(buildClient(col), entry, 'dest', { force: true })
    expect(statByPath).toHaveBeenCalledWith('/Drive/Dest/Report.pdf')
    expect(destroy).toHaveBeenCalledWith({
      _id: 'other',
      name: 'Report.pdf',
      type: 'file'
    })
    expect(updateAttributes).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      moved: { _id: 'src', dir_id: 'dest' },
      deleted: 'other'
    })
  })

  it('on 409 with force: rethrows if the retry also fails', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 })
    const updateAttributes = jest.fn().mockRejectedValue(conflict)
    const statByPath = jest.fn().mockResolvedValue({
      data: { _id: 'other', name: 'Report.pdf', type: 'file' }
    })
    const destroy = jest.fn().mockResolvedValue({})
    const col = buildCollection({ updateAttributes, statByPath, destroy })
    await expect(moveEntry(buildClient(col), entry, 'dest', { force: true })).rejects.toThrow(
      'conflict'
    )
  })

  it('recognises 409 via err.response.status too', async () => {
    const updateAttributes = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('c'), { response: { status: 409 } }))
    await expect(
      moveEntry(buildClient(buildCollection({ updateAttributes })), entry, 'dest')
    ).rejects.toThrow('c')
  })
})
