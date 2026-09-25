// Deep import to skip cozy-client's mobile.native authentication module which
// pulls in `react-native-inappbrowser-reborn` (we stub that in the bundler but
// jest does not resolve it). The dsl module is self-contained.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Q: Query } = require('cozy-client/dist/queries/dsl') as typeof import('cozy-client')
import type CozyClient from 'cozy-client'

export interface SharedDriveEntry {
  /** Sharing document _id, the `driveId` every drive-scoped route takes. */
  driveId: string
  name: string
  /** Root folder _id of the drive, the entry point for browsing. */
  rootFolderId: string | null
  /** True when the current user owns the drive: its files live on their own
   *  instance, so they are already in the main replica. */
  owner: boolean
  /** Organisational drive: the web keeps those in their own tab. */
  orgDrive: boolean
  /** A drive can share a single file instead of a folder. */
  rootType: 'directory' | 'file'
  /** Mime of the shared file, when the drive shares one. The rule carries it,
   *  the size and the dates of that file are not part of the listing. */
  mime?: string
  /** Last activity on the sharing itself, which is the only date a drive has:
   *  the listing says nothing about its content. */
  updatedAt?: string
}

interface RawSharingRule {
  values?: string[]
  mime?: string
}

interface RawSharingFields {
  description?: string
  owner?: boolean
  org_drive?: boolean
  drive_root_type?: string
  created_at?: string
  updated_at?: string
  rules?: RawSharingRule[]
}

interface RawSharing extends RawSharingFields {
  _id?: string
  id?: string
  attributes?: RawSharingFields
}

const latestDate = (...dates: Array<string | undefined>): string | undefined =>
  dates
    .filter((d): d is string => !!d)
    .sort()
    .pop()

interface SharingsCollection {
  fetchSharedDrives: () => Promise<{ data?: RawSharing[] }>
}

interface StackClientWithSharings {
  collection: (doctype: string) => SharingsCollection
}

export const toSharedDriveEntry = (raw: RawSharing): SharedDriveEntry | null => {
  const driveId = raw._id ?? raw.id
  if (!driveId) return null
  const attrs = raw.attributes ?? {}
  const rules = raw.rules ?? attrs.rules
  return {
    driveId,
    name: raw.description ?? attrs.description ?? '',
    rootFolderId: rules?.[0]?.values?.[0] ?? null,
    owner: (raw.owner ?? attrs.owner) === true,
    orgDrive: (raw.org_drive ?? attrs.org_drive) === true,
    // The stack leaves drive_root_type out when the root is a directory.
    rootType: (raw.drive_root_type ?? attrs.drive_root_type) === 'file' ? 'file' : 'directory',
    mime: rules?.[0]?.mime,
    updatedAt: latestDate(raw.created_at ?? attrs.created_at, raw.updated_at ?? attrs.updated_at)
  }
}

/**
 * The drives shared with the current user, from `GET /sharings/drives`.
 *
 * Same source as twake-drive web's `useSharedDrives`, and the root folder is
 * read where its `getFolderIdFromSharing` reads it: the first value of the
 * sharing's first rule.
 */
export const fetchSharedDrives = async (client: CozyClient): Promise<SharedDriveEntry[]> => {
  const stackClient = client.getStackClient() as unknown as StackClientWithSharings
  const resp = await stackClient.collection('io.cozy.sharings').fetchSharedDrives()
  return (resp.data ?? [])
    .map(toSharedDriveEntry)
    .filter((entry): entry is SharedDriveEntry => entry !== null)
}

/**
 * The id a drive's row is known by.
 *
 * The sharings map is keyed by file ids — the values of the sharing's rules —
 * and `rootFolderId` is read from exactly there. The drive's own id is a
 * sharing id and matches nothing in that map, so a row built on it carries no
 * sharing status until the document has replicated and can be used instead.
 */
export const sharedDriveRowId = (
  drive: Pick<SharedDriveEntry, 'driveId' | 'rootFolderId'>
): string => drive.rootFolderId ?? drive.driveId

export interface SharedDriveFile {
  _id: string
  name: string
  type: 'file' | 'directory'
  size?: number | null
  mime?: string
  class?: string
  updated_at?: string
  path?: string
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

const driveQueryOptions = (
  entry: Pick<SharedDriveEntry, 'driveId' | 'owner'>,
  as: string
): Record<string, unknown> => ({
  as,
  ...(entry.owner ? {} : { driveId: entry.driveId })
})

interface DriveScopable {
  sharingById: (driveId: string) => unknown
}

/**
 * Names the drive on the query itself, not only in its options: the options
 * route it to the drive's local database, `sharingId` is what the stack route
 * is built from when the query is served from there instead.
 *
 * Only on a getById, which is what twake-drive web scopes this way
 * (buildSharedDriveFolderQuery): the stack answers
 * `GET /sharings/drives/<driveId>/<folderId>` with the folder and its children
 * in `included`. A listing has no such route and is scoped by field instead.
 */
const scopedToDrive = (
  query: unknown,
  entry: Pick<SharedDriveEntry, 'driveId' | 'owner'>
): unknown => (entry.owner ? query : (query as DriveScopable).sharingById(entry.driveId))

/**
 * One document of a shared drive, read from the local replica.
 *
 * A drive whose root is a single file has that file as its only document; it
 * only lands here once the drive has replicated.
 */
export const querySharedDriveFile = async (
  client: CozyClient,
  entry: Pick<SharedDriveEntry, 'driveId' | 'owner'>,
  fileId: string
): Promise<SharedDriveFile | null> => {
  const resp = (await client.query(
    scopedToDrive(Query('io.cozy.files').getById(fileId), entry) as never,
    {
      ...driveQueryOptions(entry, `shareddrive-${entry.driveId}-file-${fileId}`),
      singleDocData: true
    } as never
  )) as { data?: SharedDriveFile | null }
  const doc = resp.data
  return doc && !Array.isArray(doc) ? doc : null
}

/**
 * A folder inside a shared drive, read from the local replica.
 *
 * A drive the user is a recipient of replicates into its own database under
 * `io.cozy.files.shareddrives-<driveId>`; passing `driveId` in the query
 * options is what routes the query there, and cozy-pouch-link stamps that
 * `driveId` onto every document it pulls. A drive the user owns has no such
 * database: its files are on their own instance, hence in the main replica.
 *
 * The listing matches the `driveId` cozy-pouch-link stamps on every document it
 * pulls, which is how twake-drive web's buildSharedDriveQuery reads a drive.
 */
export const querySharedDriveFolder = async (
  client: CozyClient,
  entry: Pick<SharedDriveEntry, 'driveId' | 'owner'>,
  folderId: string
): Promise<{ folder: { _id: string; name: string } | null; children: SharedDriveFile[] }> => {
  const [folder, replicated] = await Promise.all([
    client.query(
      scopedToDrive(Query('io.cozy.files').getById(folderId), entry) as never,
      driveQueryOptions(entry, `shareddrive-${entry.driveId}-folder-${folderId}`) as never
    ) as Promise<{
      data?: SharedDriveFile | SharedDriveFile[] | null
      included?: SharedDriveFile[]
    }>,
    client.queryAll(
      Query('io.cozy.files')
        .where({
          dir_id: folderId,
          ...(entry.owner ? {} : { driveId: entry.driveId }),
          type: { $gt: null },
          name: { $gt: null }
        })
        .indexFields(
          entry.owner ? ['dir_id', 'type', 'name'] : ['dir_id', 'type', 'driveId', 'name']
        )
        .sortBy(
          entry.owner
            ? [{ dir_id: 'asc' }, { type: 'asc' }, { name: 'asc' }]
            : [{ dir_id: 'asc' }, { driveId: 'asc' }, { type: 'asc' }, { name: 'asc' }]
        ) as never,
      driveQueryOptions(entry, `shareddrive-${entry.driveId}-children-${folderId}`) as never
    ) as Promise<SharedDriveFile[]>
  ])

  const doc = Array.isArray(folder.data) ? folder.data[0] : folder.data
  // The stack answers the drive route with the folder and its contents in one
  // go; the local replica answers the document alone, and the listing is what
  // reads it there.
  const fromStack = (folder.included ?? []).filter(child => !!child)
  const fromReplica = (replicated ?? []).filter(child => !!child)
  return {
    folder: doc ? { _id: doc._id, name: doc.name } : null,
    children: fromStack.length > 0 ? fromStack : fromReplica
  }
}
