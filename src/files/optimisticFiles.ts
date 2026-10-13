import type CozyClient from 'cozy-client'

import { clientStore } from '@/client/cozyClientInternals'

const FILES = 'io.cozy.files'

type Doc = { _id: string } & Record<string, unknown>

/**
 * Pushes modified file docs into the store so cozy-client re-evaluates the file
 * queries (sift) right away, without waiting for pouch replication — the view
 * updates instantly. The server mutation and the pouch sync reconcile behind.
 * Returns a revert() that restores the previous store docs; call it if the
 * server op fails.
 */
export const optimisticFiles = (
  client: CozyClient | null | undefined,
  docs: Doc[]
): (() => void) => {
  if (!client || docs.length === 0) return () => undefined
  const c = clientStore(client)
  const originals = docs.map(d => c.getDocumentFromState(FILES, d._id)).filter((d): d is Doc => !!d)
  c.setData({ [FILES]: docs })
  return () => {
    if (originals.length > 0) c.setData({ [FILES]: originals })
  }
}

/**
 * The doc as the trash holds it. Only files carry a `trashed` flag in cozy-stack,
 * and the store merges shallowly: a flag written on a folder would outlive its
 * restore, since the stack never sends one to clear it. A folder is found in the
 * trash by its `dir_id` and `path`.
 */
export const optimisticTrashed = (
  doc: { _id: string; type?: string },
  trashDirId: string
): Doc => ({
  ...doc,
  dir_id: trashDirId,
  ...(doc.type === 'directory' ? {} : { trashed: true as const })
})
