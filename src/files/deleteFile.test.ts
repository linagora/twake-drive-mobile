jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import CozyClient from 'cozy-client'

import { folderSubfoldersQuery, TRASH_DIR_ID } from '@/client/queries'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

import { softDeleteEntry } from './deleteFile'

const folder = {
  _id: 'dir1',
  _rev: '1-a',
  _type: 'io.cozy.files',
  type: 'directory' as const,
  name: 'Photos',
  dir_id: 'parent'
}
const trashed = { ...folder, _rev: '2-b', dir_id: TRASH_DIR_ID, trashed: true }

const makeClient = (): { client: CozyClient; destroy: jest.Mock } => {
  const destroy = jest.fn().mockResolvedValue({ data: trashed })
  const link = {
    request: jest.fn().mockResolvedValue({ data: [folder], next: false }),
    reset: jest.fn()
  }
  const client = new CozyClient({ links: [link as never] })
  jest
    .spyOn(client, 'collection')
    .mockReturnValue({ destroy } as unknown as ReturnType<CozyClient['collection']>)
  return { client, destroy }
}

const listedIds = (client: CozyClient): string[] =>
  (client.getQueryFromState('folders') as { data: { _id: string }[] }).data.map(d => d._id)

describe('softDeleteEntry', () => {
  beforeEach(() => {
    ;(triggerPouchReplication as jest.Mock).mockClear()
  })

  it('destroys the entry through the files collection', async () => {
    const { client, destroy } = makeClient()
    await softDeleteEntry(client, { _id: 'dir1', _rev: '1-a', name: 'Photos' })
    expect(client.collection).toHaveBeenCalledWith('io.cozy.files')
    expect(destroy).toHaveBeenCalledWith({ _id: 'dir1', _rev: '1-a', _type: 'io.cozy.files' })
  })

  it('drops the entry from its folder listing', async () => {
    const { client } = makeClient()
    await client.query(folderSubfoldersQuery('parent'), { as: 'folders' })
    expect(listedIds(client)).toEqual(['dir1'])

    await softDeleteEntry(client, folder)

    expect(listedIds(client)).toEqual([])
  })

  it('keeps the entry out when an older revision reaches the store', async () => {
    const { client } = makeClient()
    await client.query(folderSubfoldersQuery('parent'), { as: 'folders' })
    await softDeleteEntry(client, folder)

    client.setData({ 'io.cozy.files': [folder] })
    expect(listedIds(client)).toEqual([])

    await client.query(folderSubfoldersQuery('parent'), { as: 'folders' })
    expect(listedIds(client)).toEqual([])
  })

  it('keeps the entry out through a replication already running when it was trashed', async () => {
    const { client } = makeClient()
    await client.query(folderSubfoldersQuery('parent'), { as: 'folders' })
    await softDeleteEntry(client, folder)

    client.setData({ 'io.cozy.files': [folder] })
    client.emit('pouchlink:sync:end')
    client.setData({ 'io.cozy.files': [folder] })

    expect(listedIds(client)).toEqual([])
  })

  it('lets the store go once a replication started after the trash has ended', async () => {
    const { client } = makeClient()
    await client.query(folderSubfoldersQuery('parent'), { as: 'folders' })
    await softDeleteEntry(client, folder)

    client.emit('pouchlink:doctypesync:start', 'io.cozy.files')
    client.emit('pouchlink:sync:end')
    client.setData({ 'io.cozy.files': [{ ...folder, _rev: '3-c' }] })
    client.setData({ 'io.cozy.files': [folder] })

    expect(listedIds(client)).toEqual(['dir1'])
  })

  it('lets a newer revision through while held', async () => {
    const { client } = makeClient()
    await client.query(folderSubfoldersQuery('parent'), { as: 'folders' })
    await softDeleteEntry(client, folder)

    client.setData({ 'io.cozy.files': [{ ...folder, _rev: '3-c' }] })

    expect(listedIds(client)).toEqual(['dir1'])
  })

  it('propagates client errors without triggering a replication', async () => {
    const { client, destroy } = makeClient()
    destroy.mockRejectedValue(new Error('boom'))
    await expect(softDeleteEntry(client, folder)).rejects.toThrow('boom')
    expect(triggerPouchReplication).not.toHaveBeenCalled()
  })

  it('triggers a pouch replication on success', async () => {
    const { client } = makeClient()
    await softDeleteEntry(client, folder)
    expect(triggerPouchReplication).toHaveBeenCalledWith(client, 'io.cozy.files')
  })
})
