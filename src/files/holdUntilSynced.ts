import type CozyClient from 'cozy-client'

import { clientEmitter, clientStore } from '@/client/cozyClientInternals'

type Doc = { _id: string; _type: string; _rev?: string } & Record<string, unknown>

interface HeldDoc {
  doc: Doc
  replicating: boolean
}

interface Hold {
  docs: Map<string, HeldDoc>
  release: () => void
}

const holds = new WeakMap<CozyClient, Hold>()

const revGeneration = (rev: unknown): number =>
  typeof rev === 'string' ? parseInt(rev.split('-')[0], 10) || 0 : 0

const groupByType = (docs: Doc[]): Record<string, Doc[]> => {
  const out: Record<string, Doc[]> = {}
  for (const doc of docs) (out[doc._type] ??= []).push(doc)
  return out
}

const reapplyStale = (client: CozyClient, hold: Hold): void => {
  const store = clientStore(client)
  const stale: Doc[] = []
  for (const [id, { doc }] of hold.docs) {
    const current = store.getDocumentFromState(doc._type, id)
    if (current && revGeneration(current._rev) < revGeneration(doc._rev)) stale.push(doc)
  }
  if (stale.length > 0) store.setData(groupByType(stale))
}

const createHold = (client: CozyClient): Hold => {
  const emitter = clientEmitter(client)
  const hold: Hold = { docs: new Map(), release: () => undefined }

  const onStoreChange = (): void => reapplyStale(client, hold)
  const onDoctypeSyncStart = (doctype?: unknown): void => {
    for (const held of hold.docs.values()) {
      if (held.doc._type === doctype) held.replicating = true
    }
  }
  const onSyncEnd = (): void => {
    for (const [id, held] of hold.docs) {
      if (held.replicating) hold.docs.delete(id)
    }
    if (hold.docs.size === 0) hold.release()
  }

  const unsubscribe = clientStore(client).subscribe(onStoreChange)
  emitter.on('pouchlink:doctypesync:start', onDoctypeSyncStart)
  emitter.on('pouchlink:sync:end', onSyncEnd)
  hold.release = () => {
    unsubscribe()
    emitter.removeListener('pouchlink:doctypesync:start', onDoctypeSyncStart)
    emitter.removeListener('pouchlink:sync:end', onSyncEnd)
    holds.delete(client)
  }
  return hold
}

/**
 * Keeps `doc` in the store until a replication started after this call ends.
 * Until then, replication batches and local Pouch queries can carry an older
 * revision of it; each time one lands, `doc` is put back.
 */
export const holdUntilSynced = (client: CozyClient, doc: Doc): void => {
  if (!doc._rev) return
  let hold = holds.get(client)
  if (!hold) {
    hold = createHold(client)
    holds.set(client, hold)
  }
  hold.docs.set(doc._id, { doc, replicating: false })
}
