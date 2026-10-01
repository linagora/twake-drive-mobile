jest.mock('@/client/queries', () => ({
  HIDDEN_ROOT_DIR_IDS: ['io.cozy.files.trash-dir', 'io.cozy.files.shared-drives-dir']
}))

import { dropFileNameIndex, ensureFileNameIndex, searchFileNames, SearchDb } from './fileNameIndex'

interface SqliteStatement {
  reader: boolean
  all: (...params: unknown[]) => Record<string, unknown>[]
  run: (...params: unknown[]) => unknown
}

interface SqliteDatabase {
  prepare: (sql: string) => SqliteStatement
  exec: (sql: string) => void
  close: () => void
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sqlite = require('better-sqlite3') as new (path: string) => SqliteDatabase

const ADAPTER_SCHEMA = `
  CREATE TABLE IF NOT EXISTS 'document-store' (id unique, json, winningseq, max_seq INTEGER UNIQUE);
  CREATE TABLE IF NOT EXISTS 'by-sequence' (seq INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, json, deleted TINYINT(1), doc_id, rev);
  CREATE INDEX IF NOT EXISTS 'by-seq-deleted-idx' ON 'by-sequence' (seq, deleted);
  CREATE UNIQUE INDEX IF NOT EXISTS 'by-seq-doc-id-rev' ON 'by-sequence' (doc_id, rev);
  CREATE INDEX IF NOT EXISTS 'doc-winningseq-idx' ON 'document-store' (winningseq);
`

const ADAPTER_DESTROY = `
  DROP TABLE IF EXISTS 'document-store';
  DROP TABLE IF EXISTS 'by-sequence';
`

const wrap = (sqlite: SqliteDatabase): { db: SearchDb; statements: string[] } => {
  const statements: string[] = []
  const execute: SearchDb['execute'] = async (sql, params = []) => {
    statements.push(sql)
    const statement = sqlite.prepare(sql)
    if (statement.reader) return { rows: statement.all(...params) }
    statement.run(...params)
    return { rows: [] }
  }
  const db: SearchDb = {
    execute,
    transaction: async fn => {
      sqlite.exec('BEGIN')
      try {
        await fn({ execute })
        sqlite.exec('COMMIT')
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    }
  }
  return { db, statements }
}

const writeRevision = (
  sqlite: SqliteDatabase,
  id: string,
  rev: string,
  body: Record<string, unknown> | string,
  deleted = false
): void => {
  const json = typeof body === 'string' ? body : JSON.stringify(body)
  sqlite
    .prepare(`INSERT INTO 'by-sequence' (json, deleted, doc_id, rev) VALUES (?, ?, ?, ?)`)
    .run(json, deleted ? 1 : 0, id, rev)
  const [{ seq }] = sqlite.prepare('SELECT last_insert_rowid() AS seq').all()
  const known = sqlite.prepare(`SELECT 1 AS found FROM 'document-store' WHERE id = ?`).all(id)
  if (known.length > 0) {
    sqlite
      .prepare(`UPDATE 'document-store' SET winningseq = ?, max_seq = ? WHERE id = ?`)
      .run(seq, seq, id)
  } else {
    sqlite
      .prepare(
        `INSERT INTO 'document-store' (id, json, winningseq, max_seq) VALUES (?, '{}', ?, ?)`
      )
      .run(id, seq, seq)
  }
}

const file = (name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  name,
  type: 'file',
  ...extra
})

const idsOf = async (db: SearchDb, term: string, limit = 100): Promise<string[]> =>
  (await searchFileNames(db, term, limit)).map(hit => hit.doc._id).sort()

const countOf = (sqlite: SqliteDatabase, where: string): number =>
  Number(sqlite.prepare(`SELECT count(*) AS total FROM ${where}`).all()[0].total)

let sqlite: SqliteDatabase

beforeEach(() => {
  sqlite = new Sqlite(':memory:')
  sqlite.exec(ADAPTER_SCHEMA)
})

afterEach(() => {
  sqlite.close()
})

describe('the file name index on a real database', () => {
  it('finds two words whether a space, an underscore or nothing separates them', async () => {
    writeRevision(sqlite, 'spaced', '1-a', file('alpha 2026.pdf'))
    writeRevision(sqlite, 'underscored', '1-a', file('alpha_2026.pdf'))
    const { db } = wrap(sqlite)
    await expect(ensureFileNameIndex(db)).resolves.toBe(true)
    writeRevision(sqlite, 'glued', '1-a', file('alpha2026.pdf'))
    writeRevision(sqlite, 'other', '1-a', file('beta 2025.pdf'))
    await expect(idsOf(db, 'alpha 2026')).resolves.toEqual(['glued', 'spaced', 'underscored'])
  })

  it('finds an accented name typed without accents', async () => {
    const { db } = wrap(sqlite)
    await ensureFileNameIndex(db)
    writeRevision(sqlite, 'accented', '1-a', file('résumé général.pdf'))
    await expect(idsOf(db, 'resume general')).resolves.toEqual(['accented'])
  })

  it('follows a rename', async () => {
    const { db } = wrap(sqlite)
    await ensureFileNameIndex(db)
    writeRevision(sqlite, 'doc', '1-a', file('alpha.pdf'))
    writeRevision(sqlite, 'doc', '2-b', file('gamma.pdf'))
    await expect(idsOf(db, 'alpha')).resolves.toEqual([])
    const hits = await searchFileNames(db, 'gamma', 100)
    expect(hits.map(hit => [hit.doc._id, hit.doc._rev, hit.doc.name])).toEqual([
      ['doc', '2-b', 'gamma.pdf']
    ])
  })

  it('forgets a document whose winning revision is deleted', async () => {
    writeRevision(sqlite, 'before', '1-a', file('alpha one.pdf'))
    writeRevision(sqlite, 'before', '2-b', { _deleted: true }, true)
    const { db } = wrap(sqlite)
    await ensureFileNameIndex(db)
    writeRevision(sqlite, 'after', '1-a', file('alpha two.pdf'))
    writeRevision(sqlite, 'after', '2-b', { _deleted: true }, true)
    await expect(idsOf(db, 'alpha')).resolves.toEqual([])
    expect(countOf(sqlite, 'file_names')).toBe(0)
  })

  it('leaves a malformed row out, before the backfill and after the triggers', async () => {
    writeRevision(sqlite, 'broken-before', '1-a', '{"name": "alpha')
    writeRevision(sqlite, 'valid-before', '1-a', file('alpha one.pdf'))
    const { db } = wrap(sqlite)
    await expect(ensureFileNameIndex(db)).resolves.toBe(true)
    expect(() => writeRevision(sqlite, 'broken-after', '1-a', '{"name": "alpha')).not.toThrow()
    expect(() => writeRevision(sqlite, 'nameless', '1-a', { type: 'file' })).not.toThrow()
    writeRevision(sqlite, 'valid-after', '1-a', file('alpha two.pdf'))
    await expect(idsOf(db, 'alpha')).resolves.toEqual(['valid-after', 'valid-before'])
    expect(countOf(sqlite, 'file_names')).toBe(2)
  })

  it('never returns a trashed document and fills the limit without it', async () => {
    const { db } = wrap(sqlite)
    await ensureFileNameIndex(db)
    for (let i = 0; i < 10; i++) {
      writeRevision(sqlite, `trashed-${i}`, '1-a', file(`alpha ${i}.pdf`, { trashed: true }))
    }
    for (let i = 0; i < 3; i++) writeRevision(sqlite, `kept-${i}`, '1-a', file(`alpha ${i}.pdf`))
    await expect(idsOf(db, 'alpha', 3)).resolves.toEqual(['kept-0', 'kept-1', 'kept-2'])
  })

  it('leaves the hidden roots out', async () => {
    const { db } = wrap(sqlite)
    await ensureFileNameIndex(db)
    writeRevision(sqlite, 'io.cozy.files.trash-dir', '1-a', file('alpha'))
    writeRevision(sqlite, 'kept', '1-a', file('alpha.pdf'))
    await expect(idsOf(db, 'alpha', 1)).resolves.toEqual(['kept'])
  })

  it('searches from the full-text table outwards', async () => {
    const { db, statements } = wrap(sqlite)
    await ensureFileNameIndex(db)
    writeRevision(sqlite, 'doc', '1-a', file('alpha.pdf'))
    await searchFileNames(db, 'alpha', 100)
    const search = statements.filter(sql => sql.includes('MATCH')).pop() as string
    const plan = sqlite
      .prepare(`EXPLAIN QUERY PLAN ${search}`)
      .all('alpha', 100)
      .map(step => String(step.detail))
    expect(plan[0]).toMatch(/^SCAN f VIRTUAL TABLE INDEX/)
    expect(plan.filter(detail => /^SCAN (s|d)\b/.test(detail))).toEqual([])
    expect(plan.some(detail => /^SEARCH s USING INTEGER PRIMARY KEY/.test(detail))).toBe(true)
    expect(plan.some(detail => /^SEARCH d USING INDEX .* \(id=\?\)/.test(detail))).toBe(true)
  })
})

describe('the file name index when the adapter destroys its tables', () => {
  const destroyAndRecreate = (): void => {
    sqlite.exec(ADAPTER_DESTROY)
    sqlite.exec(ADAPTER_SCHEMA)
  }

  it('rebuilds on the same handle, with no stale hit', async () => {
    const { db } = wrap(sqlite)
    await ensureFileNameIndex(db)
    writeRevision(sqlite, 'old-1', '1-a', file('alpha one.pdf'))
    writeRevision(sqlite, 'old-2', '1-a', file('alpha two.pdf'))
    destroyAndRecreate()
    await expect(ensureFileNameIndex(db)).resolves.toBe(true)
    expect(() => writeRevision(sqlite, 'new-1', '1-a', file('beta one.pdf'))).not.toThrow()
    expect(() => writeRevision(sqlite, 'new-2', '1-a', file('beta two.pdf'))).not.toThrow()
    await expect(idsOf(db, 'alpha')).resolves.toEqual([])
    await expect(idsOf(db, 'beta')).resolves.toEqual(['new-1', 'new-2'])
  })

  it('rebuilds on a new handle, with no constraint error', async () => {
    await ensureFileNameIndex(wrap(sqlite).db)
    writeRevision(sqlite, 'old-1', '1-a', file('alpha one.pdf'))
    writeRevision(sqlite, 'old-2', '1-a', file('alpha two.pdf'))
    destroyAndRecreate()
    writeRevision(sqlite, 'new-0', '1-a', file('beta zero.pdf'))
    const { db } = wrap(sqlite)
    await expect(ensureFileNameIndex(db)).resolves.toBe(true)
    expect(() => writeRevision(sqlite, 'new-1', '1-a', file('beta one.pdf'))).not.toThrow()
    await expect(idsOf(db, 'alpha')).resolves.toEqual([])
    await expect(idsOf(db, 'beta')).resolves.toEqual(['new-0', 'new-1'])
  })

  it('never lets a stale row abort a write', async () => {
    const { db } = wrap(sqlite)
    await ensureFileNameIndex(db)
    sqlite
      .prepare(`INSERT INTO file_names(rowid, name, reversed, doc_id) VALUES (1, 'x', 'x', 'x')`)
      .run()
    expect(() => writeRevision(sqlite, 'doc', '1-a', file('alpha.pdf'))).not.toThrow()
    await expect(idsOf(db, 'alpha')).resolves.toEqual(['doc'])
  })
})

describe('dropFileNameIndex', () => {
  const searchObjects = (): string[] =>
    sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE name LIKE 'file_names%' OR name = 'search_positions'`
      )
      .all()
      .map(row => String(row.name))

  it('removes the triggers and the tables, and leaves the replica writable', async () => {
    const { db } = wrap(sqlite)
    await ensureFileNameIndex(db)
    writeRevision(sqlite, 'doc', '1-a', file('alpha.pdf'))
    await dropFileNameIndex(db)
    expect(searchObjects()).toEqual([])
    expect(() => writeRevision(sqlite, 'doc', '2-b', file('beta.pdf'))).not.toThrow()
    expect(countOf(sqlite, `'document-store'`)).toBe(1)
  })

  it('is safe when there is no index', async () => {
    const { db } = wrap(sqlite)
    await expect(dropFileNameIndex(db)).resolves.toBeUndefined()
    await expect(dropFileNameIndex(db)).resolves.toBeUndefined()
  })

  it('lets the index be created again afterwards', async () => {
    const { db } = wrap(sqlite)
    writeRevision(sqlite, 'doc', '1-a', file('alpha.pdf'))
    await ensureFileNameIndex(db)
    await dropFileNameIndex(db)
    await expect(ensureFileNameIndex(db)).resolves.toBe(true)
    await expect(idsOf(db, 'alpha')).resolves.toEqual(['doc'])
  })
})

describe('ensureFileNameIndex when it may not create', () => {
  it('reports not ready and creates nothing', async () => {
    const { db } = wrap(sqlite)
    await expect(ensureFileNameIndex(db, { mayCreate: false })).resolves.toBe(false)
    expect(countOf(sqlite, `sqlite_master WHERE name = 'file_names'`)).toBe(0)
  })

  it('reports ready when the index is intact', async () => {
    const { db } = wrap(sqlite)
    await ensureFileNameIndex(db)
    await expect(ensureFileNameIndex(db, { mayCreate: false })).resolves.toBe(true)
  })
})
