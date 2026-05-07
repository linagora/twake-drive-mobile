// Deep import to skip cozy-client's mobile.native authentication module which
// pulls in `react-native-inappbrowser-reborn` (we stub that in the bundler but
// jest does not resolve it). The dsl module is self-contained.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Q: Query } = require('cozy-client/dist/queries/dsl') as typeof import('cozy-client')
import type CozyClient from 'cozy-client'

// Inlined to keep this module free of `@/client/queries` which transitively
// loads cozy-client's full entrypoint and breaks isolated jest runs.
const SHARED_DRIVES_DIR_ID = 'io.cozy.files.shared-drives-dir'

export interface SharedDriveEntry {
  /** Shortcut document _id (the .url file in shared-drives-dir). */
  shortcutId: string
  /** Sharing document _id — used as driveId in /sharings/drives/{driveId}. */
  driveId: string
  /** Root folder _id of the drive (entry point for browsing). */
  rootFolderId: string
  name: string
}

interface MinimalStackClient {
  fetchJSON: (method: string, path: string) => Promise<unknown>
}

interface RawShortcut {
  _id?: string
  id?: string
  _type?: string
  name?: string
  type?: string
  class?: string
  metadata?: { target?: { _id?: string } }
  relationships?: {
    referenced_by?: { data?: Array<{ id?: string; type?: string }> }
  }
}

/**
 * Build the list of drives shared with the current user.
 *
 * The mobile cozy-stack rejects v60's `GET /sharings/drives` route on this
 * deployment; we instead use the data the recipient already has — each child
 * of `io.cozy.files.shared-drives-dir` is the `.url` shortcut for one drive,
 * and its `relationships.referenced_by` carries the `io.cozy.sharings` _id we
 * need to use as `driveId` when calling the per-drive content routes
 * (`GET /sharings/drives/{driveId}/{folderId}`, mirroring what
 * `Q(...).sharingById(driveId)` does in cozy-client v60).
 */
export const fetchSharedDrives = async (client: CozyClient): Promise<SharedDriveEntry[]> => {
  const result = (await client.query(
    Query('io.cozy.files')
      .where({ dir_id: SHARED_DRIVES_DIR_ID })
      .sortBy([{ type: 'asc' }, { name: 'asc' }]) as never,
    { as: `io.cozy.files/dir/${SHARED_DRIVES_DIR_ID}/drives` } as never
  )) as { data?: RawShortcut[] }
  const shortcuts = result.data ?? []
  console.log(
    '[fetchSharedDrives] received',
    shortcuts.length,
    'item(s); sample:',
    shortcuts[0] ? JSON.stringify(shortcuts[0]).slice(0, 800) : '(empty)'
  )
  return shortcuts
    .map((sc): SharedDriveEntry | null => {
      const shortcutId = sc._id ?? sc.id
      const driveId = sc.relationships?.referenced_by?.data?.[0]?.id
      const rootFolderId = sc.metadata?.target?._id
      if (!shortcutId) return null
      // Be permissive about class — some stacks/responses may not surface it.
      if (sc.class && sc.class !== 'shortcut') return null
      if (!driveId || !rootFolderId) {
        console.warn('[fetchSharedDrives] dropping', shortcutId, {
          hasDriveId: !!driveId,
          hasRootFolderId: !!rootFolderId,
          class: sc.class
        })
        return null
      }
      const rawName = sc.name ?? ''
      const name = rawName.replace(/\.url$/i, '') || rawName
      return { shortcutId, driveId, rootFolderId, name }
    })
    .filter((entry): entry is SharedDriveEntry => entry !== null)
}

export interface SharedDriveDirContents {
  folder: { _id: string; name: string }
  children: RawShortcut[]
}

/**
 * Fetch the contents of a folder *inside* a shared drive — the route the
 * cozy-stack exposes for both owners and recipients of the sharing.
 *
 * Mirrors v60 cozy-stack-client: `FileCollection({ driveId }).statById(id)`
 * which builds the URL `${sharedDriveApiPrefix(driveId)}/${id}` =
 * `/sharings/drives/{driveId}/{folderId}`. The response uses JSON-API with
 * `data` for the folder itself and `included` for its direct children.
 */
export const fetchSharedDriveFolder = async (
  client: CozyClient,
  driveId: string,
  folderId: string
): Promise<SharedDriveDirContents> => {
  const stackClient = client.getStackClient() as unknown as MinimalStackClient
  const path = `/sharings/drives/${encodeURIComponent(driveId)}/${encodeURIComponent(folderId)}`
  const resp = (await stackClient.fetchJSON('GET', path)) as {
    data?: { id?: string; _id?: string; attributes?: { name?: string }; name?: string }
    included?: RawShortcut[]
  }
  const data = resp.data ?? {}
  return {
    folder: {
      _id: data._id ?? data.id ?? folderId,
      name: data.attributes?.name ?? data.name ?? ''
    },
    children: resp.included ?? []
  }
}
