import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

export interface MoveEntryTarget {
  _id: string
  name: string
  type: 'file' | 'directory'
  dir_id: string
}

export interface MoveEntryResult {
  moved: { _id: string; dir_id: string }
  /** Id of the file that was sent to trash on 409 + force=true to free
   *  the destination name. null when no conflict resolution happened. */
  deleted: string | null
}

interface DestinationDoc {
  _id: string
  name: string
  path: string
}

interface ConflictingDoc {
  _id: string
  name: string
  type: 'file' | 'directory'
  _rev?: string
}

interface FilesCollection {
  updateAttributes: (
    id: string,
    attributes: { dir_id: string }
  ) => Promise<{ data: { _id: string; dir_id: string } }>
  statByPath: (path: string) => Promise<{ data: ConflictingDoc }>
  destroy: (doc: ConflictingDoc) => Promise<unknown>
  get: (id: string) => Promise<{ data: DestinationDoc }>
}

const is409 = (e: unknown): boolean => {
  const err = e as { status?: number; response?: { status?: number } }
  return err.status === 409 || err.response?.status === 409
}

/**
 * Move a file or folder into another directory.
 *
 * Mirrors twake-drive-web's executeMove (paste/index.js:67), which itself
 * wraps cozy-client's models/file.js#move() for the simple Cozy case.
 * Implementation:
 *
 *   1. updateAttributes(id, { dir_id }) — cozy-stack updates the parent.
 *   2. On HTTP 409 with force=true: read the destination directory's path,
 *      build the conflicting full path (destPath + '/' + entry.name),
 *      statByPath that path to get the conflicting doc, destroy it (sent
 *      to trash), then retry updateAttributes.
 *   3. On HTTP 409 without force, or any other error, rethrow.
 *
 * Shared drives + Nextcloud destinations are not supported in v1.
 */
export const moveEntry = async (
  client: CozyClient,
  entry: MoveEntryTarget,
  destDirId: string,
  options?: { force?: boolean }
): Promise<MoveEntryResult> => {
  const collection = client.collection('io.cozy.files') as unknown as FilesCollection
  const force = options?.force ?? false

  try {
    const result = await collection.updateAttributes(entry._id, { dir_id: destDirId })
    triggerPouchReplication(client, 'io.cozy.files')
    return { moved: result.data, deleted: null }
  } catch (e) {
    if (!is409(e) || !force) throw e
    // Resolve the conflict: trash the existing file at the destination
    // path, then retry the move.
    const dest = await collection.get(destDirId)
    const destPath = dest.data.path.replace(/\/$/, '')
    const conflictPath = `${destPath}/${entry.name}`
    const conflicting = await collection.statByPath(conflictPath)
    await collection.destroy(conflicting.data)
    const retry = await collection.updateAttributes(entry._id, { dir_id: destDirId })
    triggerPouchReplication(client, 'io.cozy.files')
    return { moved: retry.data, deleted: conflicting.data._id }
  }
}
