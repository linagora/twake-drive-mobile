import type CozyClient from 'cozy-client'
import Minilog from 'cozy-minilog'

import { getPouchLink } from './triggerReplication'

const log = Minilog('persistStackDoc')

type StackDoc = { _id: string; _type: string; _rev?: string } & Record<string, unknown>

interface LocalDatabase {
  get: (id: string) => Promise<{ _rev?: string } | null>
  bulkDocs: (docs: Record<string, unknown>[], options: { new_edits: false }) => Promise<unknown>
}

interface PouchLinkWithDb {
  getPouch?: (doctype: string) => LocalDatabase | undefined
}

const JSON_API_KEYS = ['_type', '_rev', 'id', 'attributes', 'meta', 'relationships', 'links']

const toStoredShape = (doc: StackDoc): Record<string, unknown> =>
  Object.fromEntries(Object.entries(doc).filter(([key]) => !JSON_API_KEYS.includes(key)))

const parseRev = (rev: string): { generation: number; hash: string } => {
  const separator = rev.indexOf('-')
  return { generation: Number(rev.slice(0, separator)), hash: rev.slice(separator + 1) }
}

const ancestry = (localRev: string | undefined, stackRev: string): Record<string, unknown> => {
  if (!localRev) return {}
  const local = parseRev(localRev)
  const stack = parseRev(stackRev)
  if (stack.generation !== local.generation + 1) return {}
  return { _revisions: { start: stack.generation, ids: [stack.hash, local.hash] } }
}

/**
 * Writes a document the stack just returned into the local database, so a
 * local query and a cold start see it without waiting for the next
 * replication.
 *
 * The document keeps the revision the stack gave it, the way a replication
 * would have written it, so the pull that follows finds it already there.
 */
export const persistStackDoc = async (client: CozyClient, doc: StackDoc): Promise<void> => {
  const link = getPouchLink(client) as unknown as PouchLinkWithDb | null
  const db = link?.getPouch?.(doc._type)
  if (!db) return
  if (!doc._rev) {
    log.warn('no revision to write', doc._type)
    return
  }
  try {
    const current = await db.get(doc._id).catch(() => null)
    if (current?._rev === doc._rev) return
    await db.bulkDocs(
      [{ ...toStoredShape(doc), _rev: doc._rev, ...ancestry(current?._rev, doc._rev) }],
      { new_edits: false }
    )
  } catch (e) {
    log.warn('local write failed', doc._type, e)
  }
}
