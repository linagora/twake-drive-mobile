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

const stored = {
  _id: 'f1',
  name: 'note.txt',
  type: 'file',
  dir_id: 'io.cozy.files.trash-dir',
  trashed: true
}

describe('persistStackDoc', () => {
  beforeEach(() => {
    ;(getPouchLink as jest.Mock).mockReset()
  })

  it('writes the revision of the stack as the child of the one the database holds', async () => {
    const bulkDocs = jest.fn().mockResolvedValue([])
    mockDb({ get: jest.fn().mockResolvedValue({ _id: 'f1', _rev: '1-local' }), bulkDocs })

    await persistStackDoc(client, doc)

    expect(bulkDocs).toHaveBeenCalledWith(
      [{ ...stored, _rev: '2-server', _revisions: { start: 2, ids: ['server', 'local'] } }],
      { new_edits: false }
    )
  })

  it('writes the revision alone when the database is more than one revision behind', async () => {
    const bulkDocs = jest.fn().mockResolvedValue([])
    mockDb({ get: jest.fn().mockResolvedValue({ _id: 'f1', _rev: '1-local' }), bulkDocs })

    await persistStackDoc(client, { ...doc, _rev: '4-server' })

    expect(bulkDocs).toHaveBeenCalledWith([{ ...stored, _rev: '4-server' }], { new_edits: false })
  })

  it('writes a document the database does not hold yet with the revision of the stack', async () => {
    const bulkDocs = jest.fn().mockResolvedValue([])
    mockDb({ get: jest.fn().mockRejectedValue({ status: 404 }), bulkDocs })

    await persistStackDoc(client, doc)

    expect(bulkDocs).toHaveBeenCalledWith([{ ...stored, _rev: '2-server' }], { new_edits: false })
  })

  it('leaves alone a revision the database already holds', async () => {
    const bulkDocs = jest.fn()
    mockDb({ get: jest.fn().mockResolvedValue({ _id: 'f1', _rev: '2-server' }), bulkDocs })

    await persistStackDoc(client, doc)

    expect(bulkDocs).not.toHaveBeenCalled()
  })

  it('does not write a document that carries no revision', async () => {
    const bulkDocs = jest.fn()
    mockDb({ get: jest.fn(), bulkDocs })
    const { _rev: _ignored, ...withoutRev } = doc

    await persistStackDoc(client, withoutRev)

    expect(bulkDocs).not.toHaveBeenCalled()
  })

  it('does nothing without a local database', async () => {
    ;(getPouchLink as jest.Mock).mockReturnValue(null)
    await expect(persistStackDoc(client, doc)).resolves.toBeUndefined()
  })

  it('swallows a failed write', async () => {
    mockDb({
      get: jest.fn().mockResolvedValue({ _rev: '1-local' }),
      bulkDocs: jest.fn().mockRejectedValue(new Error('disk full'))
    })

    await expect(persistStackDoc(client, doc)).resolves.toBeUndefined()
  })
})
