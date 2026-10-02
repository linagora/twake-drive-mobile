/** @jest-environment node */
import fs from 'fs'
import os from 'os'
import path from 'path'

type Row = Record<string, unknown>

interface SqliteStatement {
  reader: boolean
  all: (...params: unknown[]) => Row[]
  get: (...params: unknown[]) => Row | undefined
  run: (...params: unknown[]) => unknown
}

interface SqliteDatabase {
  prepare: (sql: string) => SqliteStatement
  exec: (sql: string) => void
  pragma: (pragma: string) => unknown
  close: () => void
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3') as new (
  file: string,
  options?: { timeout?: number }
) => SqliteDatabase

interface WriteTransaction {
  execute: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>
}

interface AdapterQueue {
  push: (fn: (tx: WriteTransaction) => Promise<void>) => Promise<void>
}

const { TransactionQueue } = jest.requireActual(
  '../../node_modules/pouchdb-adapter-react-native-sqlite/lib/commonjs/transactionQueue.js'
) as { TransactionQueue: new (db: unknown) => AdapterQueue }

const asOpSqlite = (db: SqliteDatabase) => {
  const execute = async (sql: string, params: unknown[] = []): Promise<{ rows: Row[] }> => {
    const statement = db.prepare(sql)
    if (statement.reader) return { rows: statement.all(...params) }
    statement.run(...params)
    return { rows: [] }
  }
  return {
    execute,
    transaction: async (fn: (tx: { execute: typeof execute }) => Promise<void>): Promise<void> => {
      db.exec('BEGIN TRANSACTION')
      try {
        await fn({ execute })
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    }
  }
}

describe('adapter write transactions next to a second connection', () => {
  let dir: string
  let adapter: SqliteDatabase
  let engine: SqliteDatabase

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-lock-'))
    const file = path.join(dir, 'replica.sqlite')
    adapter = new Database(file, { timeout: 100 })
    adapter.pragma('journal_mode = WAL')
    adapter.exec("CREATE TABLE docs (id PRIMARY KEY, json); INSERT INTO docs VALUES ('a', '{}')")
    engine = new Database(file, { timeout: 0 })
  })

  afterEach(() => {
    adapter.close()
    engine.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const engineWrites = (): string => {
    try {
      engine.exec('CREATE INDEX IF NOT EXISTS by_json ON docs (json)')
      return 'written'
    } catch (e) {
      return (e as { code?: string }).code ?? 'failed'
    }
  }

  it('fails when a plain transaction reads, the other connection writes, and it then writes', () => {
    adapter.exec('BEGIN TRANSACTION')
    adapter.prepare('SELECT count(*) FROM docs').get()
    expect(engineWrites()).toBe('written')
    expect(() => adapter.prepare("INSERT INTO docs VALUES ('b', '{}')").run()).toThrow(
      'database is locked'
    )
    adapter.exec('ROLLBACK')
  })

  it('lets the adapter write through its queue in the same sequence', async () => {
    const queue = new TransactionQueue(asOpSqlite(adapter))
    let engineOutcome = ''

    await queue.push(async tx => {
      await tx.execute('SELECT count(*) FROM docs')
      engineOutcome = engineWrites()
      await tx.execute("INSERT INTO docs VALUES ('b', '{}')")
    })

    expect(engineOutcome).toBe('SQLITE_BUSY')
    expect(adapter.prepare('SELECT id FROM docs ORDER BY id').all()).toEqual([
      { id: 'a' },
      { id: 'b' }
    ])
    expect(engineWrites()).toBe('written')
  })

  it('rejects the write when the lock cannot be taken', async () => {
    const queue = new TransactionQueue(asOpSqlite(adapter))
    engine.exec('BEGIN IMMEDIATE')

    await expect(
      queue.push(async tx => {
        await tx.execute("INSERT INTO docs VALUES ('c', '{}')")
      })
    ).rejects.toThrow('database is locked')

    engine.exec('ROLLBACK')
  })
})
