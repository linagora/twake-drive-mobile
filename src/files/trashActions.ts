import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

interface FilesCollection {
  restore: (id: string) => Promise<{ data: { _id: string; name: string } }>
  emptyTrash: () => Promise<unknown>
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
  triggerPouchReplication(client, 'io.cozy.files')
}
