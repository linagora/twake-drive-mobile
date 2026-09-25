import type CozyClient from 'cozy-client'
import { createMMKV } from 'react-native-mmkv'

import { fetchSharedDrives, SharedDriveEntry } from './sharedDrives'

const SHARED_DRIVE_DOCTYPE = 'io.cozy.files.shareddrives'
const DRIVES_KEY = 'sharedDrives'
const REPLICATED_KEY = 'replicatedSharedDrives'

export const sharedDriveDoctype = (driveId: string): string => `${SHARED_DRIVE_DOCTYPE}-${driveId}`

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'shared-drives' })
} catch {
  storage = null
}

interface PouchLinkLike {
  doctypes: string[]
  pouches?: { syncImmediately?: () => void }
  addDoctype?: (
    doctype: string,
    replicationOptions: Record<string, unknown>,
    options?: { shouldStartReplication?: boolean }
  ) => Promise<void>
  removeDoctype?: (doctype: string) => Promise<void>
}

const getPouchLink = (client: CozyClient): PouchLinkLike | null => {
  const link = (client.links ?? []).find(
    l => typeof (l as unknown as PouchLinkLike).addDoctype === 'function'
  )
  return (link as unknown as PouchLinkLike) ?? null
}

const readList = <T>(key: string): T[] => {
  const raw = storage?.getString(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** The drives known from the last online listing, so the list survives offline. */
export const getCachedSharedDrives = (): SharedDriveEntry[] =>
  readList<SharedDriveEntry>(DRIVES_KEY)

const getReplicatedDriveIds = (): string[] => readList<string>(REPLICATED_KEY)

const setReplicatedDriveIds = (ids: string[]): void => {
  storage?.set(REPLICATED_KEY, JSON.stringify(ids))
}

/**
 * Starts replicating a shared drive into its own local database.
 *
 * Only drives the user opened are replicated: an instance can hold dozens of
 * them, and pulling every one at launch would cost the user a sync they never
 * asked for. Once a drive is registered it stays so, which is what makes it
 * readable offline afterwards.
 */
export const registerSharedDrive = async (
  client: CozyClient,
  driveId: string
): Promise<boolean> => {
  const pouchLink = getPouchLink(client)
  if (!pouchLink?.addDoctype) return false

  const replicated = getReplicatedDriveIds()
  if (!replicated.includes(driveId)) setReplicatedDriveIds([...replicated, driveId])

  const doctype = sharedDriveDoctype(driveId)
  if (pouchLink.doctypes.includes(doctype)) return false

  // shouldStartReplication drives the debounced loop, which throws under the
  // periodic sync this app runs on; the periodic loop picks the new doctype up
  // on its own, and syncImmediately spares the user its interval.
  await pouchLink.addDoctype(doctype, { strategy: 'fromRemote', driveId })
  pouchLink.pouches?.syncImmediately?.()
  return true
}

const unregisterSharedDrive = async (client: CozyClient, driveId: string): Promise<void> => {
  setReplicatedDriveIds(getReplicatedDriveIds().filter(id => id !== driveId))
  const pouchLink = getPouchLink(client)
  if (!pouchLink?.removeDoctype) return
  const doctype = sharedDriveDoctype(driveId)
  if (!pouchLink.doctypes.includes(doctype)) return
  await pouchLink.removeDoctype(doctype)
}

/**
 * Starts replicating every drive the user is a recipient of, rather than
 * waiting for them to open one.
 *
 * Behind a flag: this is the cost the per-drive registration exists to avoid,
 * so it is opt-in and measurable. Drives are taken one at a time and a failure
 * on one does not stop the others; a drive already registered is a no-op.
 */
export const replicateAllSharedDrives = async (
  client: CozyClient,
  drives: SharedDriveEntry[]
): Promise<number> => {
  let started = 0
  for (const drive of drives) {
    // An owned drive has no database of its own: its files are already in the
    // main replica.
    if (drive.owner) continue
    try {
      if (await registerSharedDrive(client, drive.driveId)) started += 1
    } catch (e) {
      console.warn('[sharedDrives] could not start replicating', drive.driveId, e)
    }
  }
  return started
}

/**
 * Registers back every drive replicated in a past session: the link is built
 * from a static doctype list, so without this a restart leaves their databases
 * on disk and unreachable.
 */
export const restoreSharedDriveReplication = async (client: CozyClient): Promise<void> => {
  for (const driveId of getReplicatedDriveIds()) {
    try {
      await registerSharedDrive(client, driveId)
    } catch (e) {
      console.warn('[sharedDrives] could not register', driveId, e)
    }
  }
}

let inFlight: Promise<SharedDriveEntry[]> | null = null

/**
 * Re-reads the drive list from the instance and drops the local copy of any
 * drive the user lost access to. Returns the fresh list.
 *
 * Several screens want the list at once; they share the call in flight rather
 * than each asking the instance for the same thing.
 */
export const syncSharedDrives = async (client: CozyClient): Promise<SharedDriveEntry[]> => {
  if (!inFlight) {
    inFlight = runSyncSharedDrives(client).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

const runSyncSharedDrives = async (client: CozyClient): Promise<SharedDriveEntry[]> => {
  const drives = await fetchSharedDrives(client)
  const accessible = new Set(drives.filter(drive => !drive.owner).map(drive => drive.driveId))

  for (const driveId of getReplicatedDriveIds()) {
    if (accessible.has(driveId)) continue
    try {
      await unregisterSharedDrive(client, driveId)
    } catch (e) {
      console.warn('[sharedDrives] could not drop', driveId, e)
    }
  }

  storage?.set(DRIVES_KEY, JSON.stringify(drives))
  return drives
}
