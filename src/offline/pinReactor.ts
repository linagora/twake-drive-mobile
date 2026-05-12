import { OfflineFilesStore } from './OfflineFilesStore'
import { Downloader } from './Downloader'

interface FileDoc {
  _id: string
  _rev: string
  type?: string
  md5sum?: string
  size?: number
  name?: string
  dir_id?: string
  trashed?: boolean
}

interface PouchLikeChange {
  id: string
  doc?: FileDoc
}

interface PouchLikeChanges {
  on(event: 'change', cb: (c: PouchLikeChange) => void): PouchLikeChanges
  on(event: 'error', cb: (err: unknown) => void): PouchLikeChanges
  cancel(): void
}

interface PouchLike {
  changes(opts: {
    since: 'now' | number | string
    live: boolean
    include_docs: boolean
  }): PouchLikeChanges
}

let activeChanges: PouchLikeChanges | undefined

const handleChange = (change: PouchLikeChange): void => {
  const doc = change.doc
  if (!doc || doc.type !== 'file') return
  const entry = OfflineFilesStore.get(doc._id)

  // Trash: purge if pinned.
  if (entry && doc.trashed === true) {
    void OfflineFilesStore.purge(doc._id)
    return
  }

  // md5sum change on a pinned file → re-download.
  if (entry && doc.md5sum && doc.md5sum !== entry.md5sum) {
    OfflineFilesStore.update(doc._id, e => ({
      ...e,
      md5sum: doc.md5sum!,
      rev: doc._rev,
      state: 'pending'
    }))
    Downloader.enqueue(doc._id)
    return
  }

  // New file in a pinned folder → pin + enqueue.
  if (!entry && doc.dir_id && OfflineFilesStore.getFolder(doc.dir_id)) {
    OfflineFilesStore.pinViaFolder(doc._id, doc.dir_id, {
      rev: doc._rev,
      md5sum: doc.md5sum ?? '',
      size: doc.size ?? 0,
      name: doc.name ?? doc._id
    })
    Downloader.enqueue(doc._id)
    return
  }
}

export const startPinReactor = (pouch: PouchLike): (() => void) => {
  const changes = pouch.changes({ since: 'now', live: true, include_docs: true })
  changes.on('change', handleChange)
  changes.on('error', () => { /* swallow; pouch reconnects on its own */ })
  activeChanges = changes
  return () => {
    changes.cancel()
    if (activeChanges === changes) activeChanges = undefined
  }
}

/** Test only. */
export const _stopPinReactor = (): void => {
  activeChanges?.cancel()
  activeChanges = undefined
}
