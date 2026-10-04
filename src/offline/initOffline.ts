import CozyClient from 'cozy-client'
import * as FS from 'expo-file-system/legacy'

import { FileSystemRepo } from './FileSystemRepo'
import { OfflineFilesStore } from './OfflineFilesStore'
import { Downloader } from './Downloader'
import { startPinReactor } from './pinReactor'
import { reconcileFolderPins } from './reconcileFolderPins'
import { getPouchLink } from '@/pouchdb/triggerReplication'
import { buildRevisionDownloadUrl } from '@/files/streamUrl'

let pinReactorStop: (() => void) | undefined
// The client the subsystem was set up for. A new one (another sign-in, a
// certification, a resync) brings its own Pouch, and may be another account.
let initializedFor: CozyClient | undefined

const stopOfflineSubsystem = async (): Promise<void> => {
  pinReactorStop?.()
  pinReactorStop = undefined
  await Downloader.stop()
}

export const initOfflineSubsystem = async (client: CozyClient): Promise<void> => {
  if (initializedFor === client) return
  const previous = initializedFor
  initializedFor = client
  if (previous) await stopOfflineSubsystem()
  // A logout or another client may come while this one is still setting up:
  // past that point, leave the stores and the Pouch to whoever replaced it.
  const isCurrent = (): boolean => initializedFor === client

  await FileSystemRepo.init()

  // Sweep orphan blobs: files on disk that don't correspond to any pinned
  // MMKV entry (left over from pin/unpin cycles where the delete didn't
  // happen or the entry was cleared without purging the blob).
  try {
    const pinnedIds = new Set(OfflineFilesStore.getAll().map(e => e.fileId))
    const names = await FS.readDirectoryAsync(FileSystemRepo.dir())
    for (const name of names) {
      if (!pinnedIds.has(name)) {
        await FS.deleteAsync(`${FileSystemRepo.dir()}${name}`, { idempotent: true })
      }
    }
  } catch {
    // First-boot or empty dir — readDirectoryAsync can throw. Ignore.
  }
  if (!isCurrent()) return

  Downloader.init({
    buildUrl: fileId => {
      const stack = client.getStackClient() as { uri: string }
      return buildRevisionDownloadUrl(stack.uri, fileId, OfflineFilesStore.get(fileId)?.rev)
    },
    getAuthHeaders: (): Record<string, string> => {
      const stack = client.getStackClient() as { getAccessToken: () => string | null | undefined }
      const tok = stack.getAccessToken()
      return tok ? { Authorization: `Bearer ${tok}` } : {}
    }
  })

  for (const entry of OfflineFilesStore.getAll()) {
    if (!isCurrent()) return
    let next = entry
    if (entry.state === 'downloading') {
      next = { ...next, state: 'pending', bytesDownloaded: undefined }
    }
    if (entry.state === 'paused-auth') {
      next = { ...next, state: 'pending' }
    }
    if (entry.state === 'downloaded' && !(await FileSystemRepo.exists(entry.fileId))) {
      next = { ...next, state: 'pending' }
    }
    // Backfill localBytes for entries that pre-date the field.
    if (next.state === 'downloaded' && next.localBytes === undefined) {
      try {
        const info = await FS.getInfoAsync(next.localPath)
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          next = { ...next, localBytes: info.size }
        }
      } catch {
        // ignore
      }
    }
    if (next !== entry) OfflineFilesStore.update(entry.fileId, () => next)
    if (next.state === 'pending') Downloader.enqueue(entry.fileId)
  }

  if (!isCurrent()) return
  const pouchLink = getPouchLink(client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pouch = (pouchLink as any)?.getPouch?.('io.cozy.files')
  if (pouch) pinReactorStop = startPinReactor(pouch)

  // Reconcile folder pins drift in case MMKV entries went out of sync with
  // the folder pin list (e.g. previous version of "Delete all" only purged
  // files but kept folder entries).
  void reconcileFolderPins(client)
}

/**
 * Stops what runs for the session: the pin reactor on its Pouch, the
 * downloads. Has to run while the account is still in scope, since the
 * interrupted downloads are put back to pending in its store.
 */
export const teardownOfflineSubsystem = async (): Promise<void> => {
  initializedFor = undefined
  await stopOfflineSubsystem()
}
