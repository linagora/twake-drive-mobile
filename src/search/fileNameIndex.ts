import { FileQueryResult, HIDDEN_ROOT_DIR_IDS } from '@/client/queries'

import { buildMatchQuery } from './matchQuery'

type Execute = (
  sql: string,
  params?: (string | number)[]
) => Promise<{ rows: Record<string, unknown>[] }>

export interface SearchDb {
  execute: Execute
  transaction: (fn: (tx: { execute: Execute }) => Promise<void>) => Promise<void>
}

export interface FileNameHit {
  doc: FileQueryResult
  rank: number
}

const MAX_NAME_LENGTH = 255

const NAME = "json_extract(s.json, '$.name')"

const REVERSED = `(SELECT group_concat(substr(${NAME}, n, 1), '' ORDER BY n DESC) FROM search_positions WHERE n <= length(${NAME}))`

const indexWinningRevision = (docId: string, winningSeq: string): string =>
  `INSERT INTO file_names(name, reversed, doc_id)
   SELECT ${NAME}, ${REVERSED}, ${docId}
   FROM 'by-sequence' s
   WHERE s.seq = ${winningSeq} AND s.deleted = 0 AND ${NAME} IS NOT NULL`

const CREATE_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS search_positions(n INTEGER PRIMARY KEY)',
  `WITH RECURSIVE positions(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM positions WHERE n < ${MAX_NAME_LENGTH})
   INSERT OR IGNORE INTO search_positions SELECT n FROM positions`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS file_names USING fts5(
     name, reversed, doc_id UNINDEXED,
     tokenize = "unicode61 remove_diacritics 2",
     prefix = '2 3'
   )`,
  `CREATE TRIGGER IF NOT EXISTS file_names_insert AFTER INSERT ON 'document-store' BEGIN
     ${indexWinningRevision('NEW.id', 'NEW.winningseq')};
   END`,
  `CREATE TRIGGER IF NOT EXISTS file_names_update AFTER UPDATE ON 'document-store' BEGIN
     DELETE FROM file_names WHERE doc_id = OLD.id;
     ${indexWinningRevision('NEW.id', 'NEW.winningseq')};
   END`,
  `CREATE TRIGGER IF NOT EXISTS file_names_delete AFTER DELETE ON 'document-store' BEGIN
     DELETE FROM file_names WHERE doc_id = OLD.id;
   END`
]

const BACKFILL = `INSERT INTO file_names(name, reversed, doc_id)
   SELECT ${NAME}, ${REVERSED}, d.id
   FROM 'document-store' d JOIN 'by-sequence' s ON s.seq = d.winningseq
   WHERE s.deleted = 0 AND ${NAME} IS NOT NULL`

const SEARCH = `SELECT s.json AS json, s.doc_id AS doc_id, s.rev AS rev, f.rank AS rank
   FROM file_names f
   JOIN 'document-store' d ON d.id = f.doc_id
   JOIN 'by-sequence' s ON s.seq = d.winningseq
   WHERE file_names MATCH ? AND s.deleted = 0
   ORDER BY f.rank
   LIMIT ?`

const hasTable = async (execute: Execute, name: string): Promise<boolean> => {
  const { rows } = await execute(`SELECT 1 AS found FROM sqlite_master WHERE name = '${name}'`)
  return rows.length > 0
}

const createFileNameIndex = async (db: SearchDb): Promise<boolean> => {
  if (!(await hasTable(db.execute, 'document-store'))) return false
  await db.transaction(async tx => {
    const existed = await hasTable(tx.execute, 'file_names')
    for (const statement of CREATE_STATEMENTS) await tx.execute(statement)
    if (!existed) await tx.execute(BACKFILL)
  })
  return true
}

const ensured = new WeakMap<SearchDb, Promise<boolean>>()

export const ensureFileNameIndex = (db: SearchDb): Promise<boolean> => {
  const pending = ensured.get(db)
  if (pending) return pending
  const creation = createFileNameIndex(db).then(
    ready => {
      if (!ready) ensured.delete(db)
      return ready
    },
    (error: unknown) => {
      ensured.delete(db)
      throw error
    }
  )
  ensured.set(db, creation)
  return creation
}

const toHit = (row: Record<string, unknown>): FileNameHit | null => {
  try {
    const stored = JSON.parse(row.json as string) as Partial<FileQueryResult>
    if (typeof stored.name !== 'string') return null
    const doc = {
      ...stored,
      _id: row.doc_id as string,
      _rev: row.rev as string,
      _type: 'io.cozy.files'
    } as FileQueryResult
    return { doc, rank: Number(row.rank) }
  } catch {
    return null
  }
}

export const searchFileNames = async (
  db: SearchDb,
  term: string,
  limit: number
): Promise<FileNameHit[]> => {
  const match = buildMatchQuery(term)
  if (!match) return []
  const { rows } = await db.execute(SEARCH, [match, limit * 2])
  return rows
    .map(toHit)
    .filter((hit): hit is FileNameHit => hit !== null)
    .filter(hit => !hit.doc.trashed && !HIDDEN_ROOT_DIR_IDS.includes(hit.doc._id))
    .slice(0, limit)
}
