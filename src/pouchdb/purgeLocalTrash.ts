import type CozyClient from 'cozy-client'
import Minilog from 'cozy-minilog'

import { TRASH_DIR_ID } from '@/client/queries'

import { getPouchLink } from './triggerReplication'

const log = Minilog('purgeLocalTrash')

type LocalDoc = { _id: string; _rev?: string; type?: string }

interface LocalDatabase {
  find: (request: {
    selector: Record<string, unknown>
    limit: number
  }) => Promise<{ docs: LocalDoc[] }>
  bulkDocs: (docs: Record<string, unknown>[]) => Promise<unknown>
}

interface PouchLinkWithDb {
  getPouch?: (doctype: string) => LocalDatabase | undefined
}

const FILES = 'io.cozy.files'
const PAGE_SIZE = 10000

const findChildren = async (db: LocalDatabase, dirId: string): Promise<LocalDoc[]> => {
  const { docs } = await db.find({ selector: { dir_id: dirId }, limit: PAGE_SIZE })
  return docs
}

/**
 * Every doc the stack removes when it empties the trash: what sits in the
 * trash directory and, for each trashed folder, everything underneath.
 */
const collectTrashed = async (db: LocalDatabase): Promise<LocalDoc[]> => {
  const trashed: LocalDoc[] = []
  const queue = [TRASH_DIR_ID]
  for (let dirId = queue.shift(); dirId !== undefined; dirId = queue.shift()) {
    for (const child of await findChildren(db, dirId)) {
      trashed.push(child)
      if (child.type === 'directory') queue.push(child._id)
    }
  }
  return trashed
}

/**
 * Removes the trashed documents from the local database, so a cold start and
 * a local query no longer bring back what the stack just destroyed. The
 * replication is one way (remote to local), so the tombstones stay local.
 */
export const purgeLocalTrash = async (client: CozyClient): Promise<void> => {
  const link = getPouchLink(client) as unknown as PouchLinkWithDb | null
  const db = link?.getPouch?.(FILES)
  if (!db) return
  try {
    const trashed = await collectTrashed(db)
    if (trashed.length === 0) return
    await db.bulkDocs(trashed.map(({ _id, _rev }) => ({ _id, _rev, _deleted: true })))
  } catch (e) {
    log.warn('local purge failed', e)
  }
}
