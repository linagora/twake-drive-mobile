import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

import { holdUntilSynced } from './holdUntilSynced'

export interface DeletableEntry {
  _id: string
  _rev?: string
  _type?: string
  name?: string
  type?: 'file' | 'directory'
}

type TrashedDoc = { _id: string; _type: string; _rev?: string } & Record<string, unknown>

interface DestroyingCollection {
  destroy: (doc: DeletableEntry) => Promise<{ data?: TrashedDoc }>
}

/**
 * Soft-delete a file or directory: cozy-stack moves it to the trash and sets
 * `trashed: true`. Hard deletion happens later from the Trash screen.
 */
export const softDeleteEntry = async (client: CozyClient, entry: DeletableEntry): Promise<void> => {
  const doctype = entry._type ?? 'io.cozy.files'
  const collection = client.collection(doctype) as unknown as DestroyingCollection
  const { data } = await collection.destroy({ _id: entry._id, _rev: entry._rev, _type: doctype })
  if (data) {
    client.setData({ [doctype]: [data] })
    holdUntilSynced(client, data)
  }
  triggerPouchReplication(client, 'io.cozy.files')
}
