import type CozyClient from 'cozy-client'

export interface SharedDriveEntry {
  /** Sharing document _id (the drive's identifier from io.cozy.sharings). */
  driveId: string
  /** Root folder _id of the drive (what we navigate into). */
  _id: string
  name: string
  type: 'directory'
}

interface MinimalStackClient {
  fetchJSON: (method: string, path: string) => Promise<unknown>
}

interface RawRule {
  title?: string
  values?: string[]
  doctype?: string
}

interface RawSharing {
  id?: string
  _id?: string
  type?: string
  _type?: string
  attributes?: { rules?: RawRule[] }
  rules?: RawRule[]
}

/**
 * Mirror of cozy-stack-client v60's `SharingCollection.fetchSharedDrives`
 * (we run on v58 which does not expose it yet). Calls the same stack route
 * `GET /sharings/drives` and returns one entry per shared drive sharing,
 * shaped like a directory so it can be rendered with the existing FolderRow
 * and routed into via the regular folder listing query.
 *
 * Mirrors the shape produced by twake-drive web's
 * `useTransformFolderListHasSharedDriveShortcuts`: the drive's _id is the
 * root folder id (`rules[0].values[0]`) and the displayed name comes from
 * `rules[0].title`.
 */
export const fetchSharedDrives = async (client: CozyClient): Promise<SharedDriveEntry[]> => {
  const stackClient = client.getStackClient() as unknown as MinimalStackClient
  const response = (await stackClient.fetchJSON('GET', '/sharings/drives')) as
    | { data?: RawSharing[] }
    | undefined
  const list = response?.data ?? []
  return list
    .map((sharing): SharedDriveEntry | null => {
      const rules = sharing.attributes?.rules ?? sharing.rules ?? []
      const root = rules[0]
      const rootId = root?.values?.[0]
      const name = root?.title?.trim()
      const driveId = sharing._id ?? sharing.id
      if (!rootId || !name || !driveId) return null
      return { driveId, _id: rootId, name, type: 'directory' }
    })
    .filter((entry): entry is SharedDriveEntry => entry !== null)
}
