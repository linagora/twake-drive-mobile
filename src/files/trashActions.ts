import type CozyClient from 'cozy-client'
import { pouchLink } from '@/client/createClient'

interface FilesCollection {
  restore: (id: string) => Promise<{ data: { _id: string; name: string } }>
  emptyTrash: () => Promise<unknown>
}

/**
 * Restore a single doc from the trash. Wraps cozy-stack-client's
 * `FileCollection.restore(id)` (POST /files/trash/{id}), the same
 * endpoint twake-drive-web uses. Triggers an immediate pouch sync.
 */
export const restoreEntry = async (
  client: CozyClient,
  id: string
): Promise<{ _id: string; name: string }> => {
  const collection = client.collection('io.cozy.files') as unknown as FilesCollection
  const result = await collection.restore(id)
  pouchLink.syncImmediately()
  return result.data
}

/**
 * Empty the entire trash (hard delete every doc in trash-dir).
 * Wraps cozy-stack-client's `FileCollection.emptyTrash()`
 * (DELETE /files/trash).
 *
 * **No `pouchLink.syncImmediately()` here on purpose**: cozy-stack
 * processes the purge asynchronously, so an immediate replication
 * would re-pull the still-present docs back into the local SQLite
 * and the trash screen would keep showing them until the next
 * polling tick (30s+) eventually catches up. The trash screen uses
 * `forceStack: true` on its useQuery to always hit the stack, so
 * a `query.fetch()` after `emptyTrash` is enough to render the
 * authoritative state.
 */
export const emptyTrash = async (client: CozyClient): Promise<void> => {
  const collection = client.collection('io.cozy.files') as unknown as FilesCollection
  await collection.emptyTrash()
}
