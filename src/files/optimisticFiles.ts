import type CozyClient from 'cozy-client'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any
  const originals = docs
    .map(d => c.getDocumentFromState(FILES, d._id))
    .filter((d: unknown): d is Doc => !!d)
  c.setData({ [FILES]: docs })
  return () => {
    if (originals.length > 0) c.setData({ [FILES]: originals })
  }
}
