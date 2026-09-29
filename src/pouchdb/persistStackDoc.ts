import type CozyClient from 'cozy-client'
import Minilog from 'cozy-minilog'

import { getPouchLink } from './triggerReplication'

const log = Minilog('persistStackDoc')

type StackDoc = { _id: string; _type: string; _rev?: string } & Record<string, unknown>

interface LocalDatabase {
  get: (id: string) => Promise<{ _rev?: string } | null>
  put: (doc: Record<string, unknown>) => Promise<unknown>
}

interface PouchLinkWithDb {
  getPouch?: (doctype: string) => LocalDatabase | undefined
}

const JSON_API_KEYS = ['_type', '_rev', 'id', 'attributes', 'meta', 'relationships', 'links']

const toStoredShape = (doc: StackDoc): Record<string, unknown> =>
  Object.fromEntries(Object.entries(doc).filter(([key]) => !JSON_API_KEYS.includes(key)))

/**
 * Writes a document the stack just returned into the local database, so a
 * local query and a cold start see it without waiting for the next
 * replication.
 */
export const persistStackDoc = async (client: CozyClient, doc: StackDoc): Promise<void> => {
  const link = getPouchLink(client) as unknown as PouchLinkWithDb | null
  const db = link?.getPouch?.(doc._type)
  if (!db) return
  try {
    const current = await db.get(doc._id).catch(() => null)
    const rev = current?._rev
    await db.put(rev ? { ...toStoredShape(doc), _rev: rev } : toStoredShape(doc))
  } catch (e) {
    log.warn('local write failed', doc._type, e)
  }
}
