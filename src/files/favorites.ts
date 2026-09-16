import type CozyClient from 'cozy-client'

import type { FileQueryResult } from '@/client/queries'
import { optimisticFiles } from '@/files/optimisticFiles'

/**
 * Returns true when the file/folder is marked as a favourite.
 * Mirrors twake-drive-web: the flag lives at `cozyMetadata.favorite`.
 */
export const isFavorite = (file: FileQueryResult): boolean => file.cozyMetadata?.favorite === true

interface FilesCollection {
  updateAttributes: (
    id: string,
    attributes: { cozyMetadata: Record<string, unknown> }
  ) => Promise<{ data: unknown }>
}

/**
 * Toggle the favourite flag on a file or folder.
 *
 * Persists via the dedicated cozy-stack files endpoint
 * (`FileCollection.updateAttributes` → PATCH /files/:id), exactly like
 * `renameEntry` / `moveEntry`. A generic `client.save` must NOT be used here:
 * on mobile it writes only to the offline PouchDB replica and never reaches the
 * server for `io.cozy.files`, so the change was applied locally and overwritten
 * on the next sync (the folder reappeared in Favoris). Merge into the existing
 * cozyMetadata to preserve the server-managed fields.
 *
 * The store is updated first so the lists re-evaluate their queries at once:
 * the stack mutation does not write to the local replica, so without this the
 * change only surfaced on the next replication. Reverted if the stack refuses.
 */
export const toggleFavorite = async (
  client: CozyClient,
  file: FileQueryResult,
  next: boolean
): Promise<void> => {
  const cozyMetadata = { ...file.cozyMetadata, favorite: next }
  const revert = optimisticFiles(client, [{ ...file, cozyMetadata }])
  try {
    const collection = client.collection('io.cozy.files') as unknown as FilesCollection
    await collection.updateAttributes(file._id, { cozyMetadata })
  } catch (e) {
    revert()
    throw e
  }
}
