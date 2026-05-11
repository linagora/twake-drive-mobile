import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

export class RenameConflictError extends Error {
  constructor(name: string) {
    super(`A file or folder named "${name}" already exists`)
    this.name = 'RenameConflictError'
  }
}

interface FilesCollection {
  updateAttributes: (
    id: string,
    attributes: { name: string }
  ) => Promise<{ data: { _id: string; name: string } }>
}

/**
 * Rename a file or folder. Uses the dedicated cozy-stack endpoint via
 * `FileCollection.updateAttributes` — twake-drive-web does the same.
 *
 * Throws RenameConflictError on HTTP 409.
 */
export const renameEntry = async (
  client: CozyClient,
  id: string,
  newName: string
): Promise<{ _id: string; name: string }> => {
  const trimmed = newName.trim()
  if (!trimmed) throw new Error('Name cannot be empty')

  const collection = client.collection('io.cozy.files') as unknown as FilesCollection

  try {
    const result = await collection.updateAttributes(id, { name: trimmed })
    triggerPouchReplication(client, 'io.cozy.files')
    return result.data
  } catch (e) {
    const err = e as { status?: number; response?: { status?: number } }
    const status = err.status ?? err.response?.status
    if (status === 409) throw new RenameConflictError(trimmed)
    throw e
  }
}
