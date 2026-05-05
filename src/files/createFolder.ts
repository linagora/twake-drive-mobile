import type CozyClient from 'cozy-client'

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
  dirId: string
): Promise<CreatedFolder> => {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Folder name cannot be empty')

  const collection = client.collection('io.cozy.files') as unknown as FilesCollection

  try {
    const result = await collection.create({
      name: trimmed,
      dirId,
      type: 'directory'
    })
    return result.data
  } catch (e) {
    const err = e as { status?: number; response?: { status?: number } }
    const status = err.status ?? err.response?.status
    if (status === 409) throw new FolderConflictError(trimmed)
    throw e
  }
}
