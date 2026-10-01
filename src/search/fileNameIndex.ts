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

const NAME = "CASE WHEN json_valid(s.json) THEN json_extract(s.json, '$.name') END"

const REVERSED = `(SELECT group_concat(substr(${NAME}, n, 1), '' ORDER BY n DESC) FROM search_positions WHERE n <= length(${NAME}))`

const indexWinningRevision = (docId: string, winningSeq: string): string =>
  `INSERT OR REPLACE INTO file_names(rowid, name, reversed, doc_id)
   SELECT s.seq, ${NAME}, ${REVERSED}, ${docId}
   FROM 'by-sequence' s
   WHERE s.seq = ${winningSeq} AND s.deleted = 0 AND ${NAME} IS NOT NULL`

const CREATE_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS search_positions(n INTEGER PRIMARY KEY)',
  `WITH RECURSIVE positions(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM positions WHERE n < ${MAX_NAME_LENGTH})
   INSERT OR IGNORE INTO search_positions SELECT n FROM positions`,
  'DROP TABLE IF EXISTS file_names',
  `CREATE VIRTUAL TABLE IF NOT EXISTS file_names USING fts5(
     name, reversed, doc_id UNINDEXED,
     tokenize = "unicode61 remove_diacritics 2",
     prefix = '2 3'
   )`,
  `CREATE TRIGGER IF NOT EXISTS file_names_insert AFTER INSERT ON 'document-store' BEGIN
     ${indexWinningRevision('NEW.id', 'NEW.winningseq')};
   END`,
  `CREATE TRIGGER IF NOT EXISTS file_names_update AFTER UPDATE ON 'document-store' BEGIN
     DELETE FROM file_names WHERE rowid = OLD.winningseq;
     ${indexWinningRevision('NEW.id', 'NEW.winningseq')};
   END`,
  `CREATE TRIGGER IF NOT EXISTS file_names_delete AFTER DELETE ON 'document-store' BEGIN
     DELETE FROM file_names WHERE rowid = OLD.winningseq;
   END`
]

const BACKFILL = `INSERT INTO file_names(rowid, name, reversed, doc_id)
   SELECT s.seq, ${NAME}, ${REVERSED}, d.id
   FROM 'document-store' d JOIN 'by-sequence' s ON s.seq = d.winningseq
   WHERE s.deleted = 0 AND ${NAME} IS NOT NULL`

const TRASHED = "CASE WHEN json_valid(s.json) THEN json_extract(s.json, '$.trashed') END"

const SEARCH = `SELECT s.json AS json, s.doc_id AS doc_id, s.rev AS rev, f.rank AS rank
   FROM file_names f
   CROSS JOIN 'by-sequence' s ON s.seq = f.rowid
   CROSS JOIN 'document-store' d ON d.id = s.doc_id AND d.winningseq = s.seq
   WHERE file_names MATCH ? AND s.deleted = 0 AND ${TRASHED} IS NOT TRUE
   ORDER BY f.rank
   LIMIT ?`

const DROP_STATEMENTS = [
  'DROP TRIGGER IF EXISTS file_names_insert',
  'DROP TRIGGER IF EXISTS file_names_update',
  'DROP TRIGGER IF EXISTS file_names_delete',
  'DROP TABLE IF EXISTS file_names',
  'DROP TABLE IF EXISTS search_positions'
]

const hasSchemaObject = async (
  execute: Execute,
  type: 'table' | 'trigger',
  name: string
): Promise<boolean> => {
  const { rows } = await execute(
    `SELECT 1 AS found FROM sqlite_master WHERE type = '${type}' AND name = '${name}'`
  )
  return rows.length > 0
}

const createFileNameIndex = async (db: SearchDb): Promise<boolean> => {
  if (!(await hasSchemaObject(db.execute, 'table', 'document-store'))) return false
  if (await hasSchemaObject(db.execute, 'trigger', 'file_names_insert')) return true
  await db.transaction(async tx => {
    for (const statement of CREATE_STATEMENTS) await tx.execute(statement)
    await tx.execute(BACKFILL)
  })
  return true
}

const inFlight = new WeakMap<SearchDb, Promise<boolean>>()

export const ensureFileNameIndex = (db: SearchDb): Promise<boolean> => {
  const pending = inFlight.get(db)
  if (pending) return pending
  const creation = createFileNameIndex(db).finally(() => inFlight.delete(db))
  inFlight.set(db, creation)
  return creation
}

export const dropFileNameIndex = async (db: SearchDb): Promise<void> => {
  await inFlight.get(db)?.catch(() => undefined)
  await db.transaction(async tx => {
    for (const statement of DROP_STATEMENTS) await tx.execute(statement)
  })
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
  const { rows } = await db.execute(SEARCH, [match, limit + HIDDEN_ROOT_DIR_IDS.length])
  return rows
    .map(toHit)
    .filter((hit): hit is FileNameHit => hit !== null)
    .filter(hit => !HIDDEN_ROOT_DIR_IDS.includes(hit.doc._id))
    .slice(0, limit)
}
