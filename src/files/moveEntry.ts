import CozyClient, { Q } from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { generateUniqueNameWithSuffix } from '@/files/uniqueName'

export interface MoveEntryTarget {
  _id: string
  name: string
  type: 'file' | 'directory'
  dir_id: string
}

export interface MoveEntryResult {
  moved: { _id: string; dir_id: string }
  /** Non-null when a name collision at the destination renamed the moved item
   *  (keep-both), null otherwise. */
  renamedTo: string | null
}

interface FilesCollection {
  updateAttributes: (
    id: string,
    attributes: { dir_id: string; name?: string }
  ) => Promise<{ data: { _id: string; dir_id: string } }>
}

const is409 = (e: unknown): boolean => {
  const err = e as { status?: number; response?: { status?: number } }
  return err.status === 409 || err.response?.status === 409
}

const fetchExistingNames = async (client: CozyClient, dirId: string): Promise<Set<string>> => {
  const { data } = await client.query(
    Q('io.cozy.files').where({ dir_id: dirId, trashed: false }).indexFields(['dir_id', 'trashed'])
  )
  const items = (data ?? []) as { name?: string }[]
  return new Set(items.map(i => i.name).filter((n): n is string => !!n))
}

/**
 * Move a file or folder into another directory.
 *
 * Mirrors twake-drive web's cut/paste conflict handling: on a destination name
 * collision the moved item is renamed with a numbered suffix (keep-both), it is
 * never overwritten. `force` gates that keep-both rename on a 409.
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
    return { moved: result.data, renamedTo: null }
  } catch (e) {
    if (!is409(e) || !force) throw e
    if (!entry.name) throw e
    const existing = await fetchExistingNames(client, destDirId)
    const uniqueName = generateUniqueNameWithSuffix(entry.name, existing, entry.type === 'file')
    const retry = await collection.updateAttributes(entry._id, {
      dir_id: destDirId,
      name: uniqueName
    })
    triggerPouchReplication(client, 'io.cozy.files')
    return { moved: retry.data, renamedTo: uniqueName }
  }
}
