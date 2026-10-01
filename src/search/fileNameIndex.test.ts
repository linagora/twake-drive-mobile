jest.mock('@/client/queries', () => ({
  HIDDEN_ROOT_DIR_IDS: ['io.cozy.files.trash-dir', 'io.cozy.files.shared-drives-dir']
}))

import { ensureFileNameIndex, searchFileNames, SearchDb } from './fileNameIndex'

type Rows = Record<string, unknown>[]

const makeDb = (answer: (sql: string) => Rows = () => []) => {
  const execute = jest.fn(async (sql: string, _params?: (string | number)[]) => ({
    rows: answer(sql)
  }))
  const db: SearchDb = {
    execute,
    transaction: async fn => fn({ execute })
  }
  return { db, execute }
}

const sqlOf = (execute: jest.Mock): string[] => execute.mock.calls.map(call => call[0] as string)

const adapterReady = (indexExists: boolean) => (sql: string) => {
  if (sql.includes("name = 'document-store'")) return [{ found: 1 }]
  if (sql.includes("name = 'file_names'")) return indexExists ? [{ found: 1 }] : []
  return []
}

const row = (docId: string, json: unknown, rank = -1) => ({
  json: typeof json === 'string' ? json : JSON.stringify(json),
  doc_id: docId,
  rev: '1-a',
  rank
})

describe('ensureFileNameIndex', () => {
  it('reports not ready while the adapter tables are missing', async () => {
    const { db, execute } = makeDb(() => [])
    await expect(ensureFileNameIndex(db)).resolves.toBe(false)
    expect(sqlOf(execute).some(sql => sql.includes('CREATE VIRTUAL TABLE'))).toBe(false)
  })

  it('creates the table, the triggers and backfills when the index is new', async () => {
    const { db, execute } = makeDb(adapterReady(false))
    await expect(ensureFileNameIndex(db)).resolves.toBe(true)
    const sql = sqlOf(execute).join('\n')
    expect(sql).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS file_names USING fts5')
    expect(sql).toContain('unicode61 remove_diacritics 2')
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS file_names_insert')
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS file_names_update')
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS file_names_delete')
    expect(sql).toContain("FROM 'document-store' d JOIN 'by-sequence' s")
  })

  it('does not backfill an index that already exists', async () => {
    const { db, execute } = makeDb(adapterReady(true))
    await expect(ensureFileNameIndex(db)).resolves.toBe(true)
    expect(sqlOf(execute).join('\n')).not.toContain("FROM 'document-store' d JOIN 'by-sequence' s")
  })

  it('creates the index once for concurrent and repeated calls', async () => {
    const { db, execute } = makeDb(adapterReady(false))
    await Promise.all([ensureFileNameIndex(db), ensureFileNameIndex(db)])
    await ensureFileNameIndex(db)
    expect(sqlOf(execute).filter(sql => sql.includes('CREATE VIRTUAL TABLE'))).toHaveLength(1)
  })

  it('tries again after a failure', async () => {
    const { db, execute } = makeDb(adapterReady(false))
    execute.mockRejectedValueOnce(new Error('no such module: fts5'))
    await expect(ensureFileNameIndex(db)).rejects.toThrow('fts5')
    await expect(ensureFileNameIndex(db)).resolves.toBe(true)
  })
})

describe('searchFileNames', () => {
  it('returns nothing without querying when the term is not searchable', async () => {
    const { db, execute } = makeDb()
    await expect(searchFileNames(db, ' * ', 100)).resolves.toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })

  it('binds the match expression and restores the document identity', async () => {
    const { db, execute } = makeDb(() => [row('id-1', { name: 'report.pdf', type: 'file' }, -2)])
    const hits = await searchFileNames(db, 'report', 100)
    expect(execute.mock.calls[0][1]).toEqual(['(name:"report"* OR reversed:"troper"*)', 102])
    expect(hits).toEqual([
      {
        rank: -2,
        doc: { name: 'report.pdf', type: 'file', _id: 'id-1', _rev: '1-a', _type: 'io.cozy.files' }
      }
    ])
  })

  it('leaves trashed documents to the statement and drops the hidden roots', async () => {
    const { db, execute } = makeDb(() => [
      row('io.cozy.files.trash-dir', { name: 'a', type: 'directory' }),
      row('id-2', { name: 'a', type: 'file' })
    ])
    const hits = await searchFileNames(db, 'a', 100)
    expect(hits.map(hit => hit.doc._id)).toEqual(['id-2'])
    expect(execute.mock.calls[0][0]).toContain("json_extract(s.json, '$.trashed')")
  })

  it('skips a row without a name or with unreadable JSON', async () => {
    const { db } = makeDb(() => [
      row('id-1', { type: 'file' }),
      row('id-2', '{not json'),
      row('id-3', { name: 'a', type: 'file' })
    ])
    const hits = await searchFileNames(db, 'a', 100)
    expect(hits.map(hit => hit.doc._id)).toEqual(['id-3'])
  })

  it('keeps at most `limit` hits', async () => {
    const { db } = makeDb(() =>
      Array.from({ length: 5 }, (_, i) => row(`id-${i}`, { name: 'a', type: 'file' }))
    )
    await expect(searchFileNames(db, 'a', 3)).resolves.toHaveLength(3)
  })
})
