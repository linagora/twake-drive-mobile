import type CozyClient from 'cozy-client'

type StoredDoc = { _id: string } & Record<string, unknown>

// cozy-client's event emitter (MicroEE) and store helpers aren't part of its
// public typings. These narrow wrappers keep the untyped access in a single,
// documented place instead of scattering `as any` at each call site.

interface CozyClientEmitter {
  on(event: string, listener: (...args: unknown[]) => void): void
  removeListener(event: string, listener: (...args: unknown[]) => void): void
}

interface CozyClientStore {
  setData(data: Record<string, StoredDoc[]>): void
  getDocumentFromState(doctype: string, id: string): StoredDoc | null | undefined
  subscribe(listener: () => void): () => void
}

export const clientEmitter = (client: CozyClient): CozyClientEmitter =>
  client as unknown as CozyClientEmitter

export const clientStore = (client: CozyClient): CozyClientStore => {
  const c = client as unknown as Omit<CozyClientStore, 'subscribe'> & {
    ensureStore(): void
    store: { subscribe(listener: () => void): () => void }
  }
  return {
    setData: data => c.setData(data),
    getDocumentFromState: (doctype, id) => c.getDocumentFromState(doctype, id),
    subscribe: listener => {
      c.ensureStore()
      return c.store.subscribe(listener)
    }
  }
}
