import type CozyClient from 'cozy-client'
import Minilog from 'cozy-minilog'

import { driveScope } from '@/files/driveScope'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

import { applyStackDoc } from './applyStackDoc'

const log = Minilog('createFolder')

export class FolderConflictError extends Error {
  constructor(name: string) {
    super(`A folder named "${name}" already exists in this directory`)
    this.name = 'FolderConflictError'
  }
}

export interface CreatedFolder {
  _id: string
  name: string
  type: 'directory'
}

interface FilesCollection {
  create: (attrs: {
    name: string
    dirId: string
    type: 'directory'
  }) => Promise<{ data: CreatedFolder }>
}

export const createFolder = async (
  client: CozyClient,
  name: string,
  dirId: string,
  driveId?: string
): Promise<CreatedFolder> => {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Folder name cannot be empty')

  const collection = client.collection(
    'io.cozy.files',
    driveScope(driveId)
  ) as unknown as FilesCollection

  let created: CreatedFolder
  try {
    created = (
      await collection.create({
        name: trimmed,
        dirId,
        type: 'directory'
      })
    ).data
  } catch (e) {
    const err = e as { status?: number; response?: { status?: number } }
    const status = err.status ?? err.response?.status
    if (status === 409) throw new FolderConflictError(trimmed)
    throw e
  }

  // The stack has the folder from here on: a local cache or replication
  // hiccup must not be reported as a failed creation. The next replication
  // brings the folder in anyway.
  try {
    if (!driveId) await applyStackDoc(client, created)
    triggerPouchReplication(client, 'io.cozy.files')
  } catch (e) {
    log.warn('folder created, local update failed', e)
  }
  return created
}
