import type CozyClient from 'cozy-client'

import { purgeLocalTrash } from '@/pouchdb/purgeLocalTrash'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

import { applyStackDoc } from './applyStackDoc'

interface FilesCollection {
  restore: (id: string) => Promise<{ data: { _id: string; name: string } }>
  emptyTrash: () => Promise<unknown>
}

interface StackFetcher {
  fetchJSON: (method: string, path: string) => Promise<unknown>
}

/**
 * Restore a single doc from the trash. Wraps cozy-stack-client's
 * `FileCollection.restore(id)` (POST /files/trash/{id}), the same
 * endpoint twake-drive-web uses.
 */
export const restoreEntry = async (
  client: CozyClient,
  id: string
): Promise<{ _id: string; name: string }> => {
  const collection = client.collection('io.cozy.files') as unknown as FilesCollection
  const result = await collection.restore(id)
  await applyStackDoc(client, result.data)
  triggerPouchReplication(client, 'io.cozy.files')
  return result.data
}

/**
 * Empty the entire trash (hard delete every doc in trash-dir).
 * Wraps cozy-stack-client's `FileCollection.emptyTrash()`
 * (DELETE /files/trash).
 */
export const emptyTrash = async (client: CozyClient): Promise<void> => {
  const collection = client.collection('io.cozy.files') as unknown as FilesCollection
  await collection.emptyTrash()
  await purgeLocalTrash(client)
  triggerPouchReplication(client, 'io.cozy.files')
}

/**
 * Delete one trashed file or folder for good. Calls
 * `DELETE /files/trash/{id}`, the stack's "destroy from trash" route that
 * twake-drive-web's "Delete permanently" action ends up on, and which accepts
 * both a file and a directory.
 */
export const destroyEntry = async (client: CozyClient, id: string): Promise<void> => {
  const stackClient = client.getStackClient() as unknown as StackFetcher
  await stackClient.fetchJSON('DELETE', `/files/trash/${encodeURIComponent(id)}`)
  triggerPouchReplication(client, 'io.cozy.files')
}
