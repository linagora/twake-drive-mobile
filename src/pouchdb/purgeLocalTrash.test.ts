import CozyClient from 'cozy-client'

import { purgeLocalTrash } from './purgeLocalTrash'

jest.mock('./triggerReplication', () => ({
  getPouchLink: jest.fn()
}))

import { getPouchLink } from './triggerReplication'

const client = {} as CozyClient

const TRASH = 'io.cozy.files.trash-dir'

const mockDb = (children: Record<string, unknown[]>) => {
  const bulkDocs = jest.fn().mockResolvedValue([])
  const find = jest.fn(({ selector }: { selector: { dir_id: string } }) =>
    Promise.resolve({ docs: children[selector.dir_id] ?? [] })
  )
  const getPouch = jest.fn().mockReturnValue({ find, bulkDocs })
  ;(getPouchLink as jest.Mock).mockReturnValue({ getPouch })
  return { bulkDocs, find, getPouch }
}

describe('purgeLocalTrash', () => {
  beforeEach(() => {
    ;(getPouchLink as jest.Mock).mockReset()
  })

  it('deletes what sits in the trash and everything under a trashed folder', async () => {
    const { bulkDocs } = mockDb({
      [TRASH]: [
        { _id: 'file', _rev: '2-a', type: 'file' },
        { _id: 'dir', _rev: '3-b', type: 'directory' }
      ],
      dir: [
        { _id: 'inner', _rev: '1-c', type: 'file' },
        { _id: 'sub', _rev: '1-d', type: 'directory' }
      ],
      sub: [{ _id: 'deep', _rev: '1-e', type: 'file' }]
    })

    await purgeLocalTrash(client)

    expect(bulkDocs).toHaveBeenCalledWith([
      { _id: 'file', _rev: '2-a', _deleted: true },
      { _id: 'dir', _rev: '3-b', _deleted: true },
      { _id: 'inner', _rev: '1-c', _deleted: true },
      { _id: 'sub', _rev: '1-d', _deleted: true },
      { _id: 'deep', _rev: '1-e', _deleted: true }
    ])
  })

  it('writes nothing when the trash is empty', async () => {
    const { bulkDocs } = mockDb({})
    await purgeLocalTrash(client)
    expect(bulkDocs).not.toHaveBeenCalled()
  })

  it('does nothing without a local database', async () => {
    ;(getPouchLink as jest.Mock).mockReturnValue(null)
    await expect(purgeLocalTrash(client)).resolves.toBeUndefined()
  })

  it('does not throw when the local database fails', async () => {
    const { bulkDocs } = mockDb({ [TRASH]: [{ _id: 'f', _rev: '1-a', type: 'file' }] })
    bulkDocs.mockRejectedValue(new Error('boom'))
    await expect(purgeLocalTrash(client)).resolves.toBeUndefined()
  })
})
