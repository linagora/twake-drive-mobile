import CozyClient from 'cozy-client'

import { persistStackDoc } from './persistStackDoc'

jest.mock('./triggerReplication', () => ({
  getPouchLink: jest.fn()
}))

import { getPouchLink } from './triggerReplication'

const client = {} as CozyClient
const doc = {
  _id: 'f1',
  _type: 'io.cozy.files',
  _rev: '2-server',
  name: 'note.txt',
  type: 'file',
  dir_id: 'io.cozy.files.trash-dir',
  trashed: true,
  attributes: { name: 'note.txt' },
  meta: { rev: '2-server' },
  relationships: {}
}

const mockDb = (db: unknown): void => {
  ;(getPouchLink as jest.Mock).mockReturnValue({ getPouch: jest.fn().mockReturnValue(db) })
}

describe('persistStackDoc', () => {
  beforeEach(() => {
    ;(getPouchLink as jest.Mock).mockReset()
  })

  it('writes the document on top of the revision the database already holds', async () => {
    const put = jest.fn().mockResolvedValue({ ok: true })
    mockDb({ get: jest.fn().mockResolvedValue({ _id: 'f1', _rev: '1-local' }), put })

    await persistStackDoc(client, doc)

    expect(put).toHaveBeenCalledWith({
      _id: 'f1',
      _rev: '1-local',
      name: 'note.txt',
      type: 'file',
      dir_id: 'io.cozy.files.trash-dir',
      trashed: true
    })
  })

  it('writes a document the database does not hold yet, with no revision', async () => {
    const put = jest.fn().mockResolvedValue({ ok: true })
    mockDb({ get: jest.fn().mockRejectedValue({ status: 404 }), put })

    await persistStackDoc(client, doc)

    expect(put).toHaveBeenCalledWith(expect.not.objectContaining({ _rev: expect.anything() }))
  })

  it('does nothing without a local database', async () => {
    ;(getPouchLink as jest.Mock).mockReturnValue(null)
    await expect(persistStackDoc(client, doc)).resolves.toBeUndefined()
  })

  it('swallows a failed write', async () => {
    mockDb({
      get: jest.fn().mockResolvedValue({ _rev: '1-local' }),
      put: jest.fn().mockRejectedValue(new Error('disk full'))
    })

    await expect(persistStackDoc(client, doc)).resolves.toBeUndefined()
  })
})
