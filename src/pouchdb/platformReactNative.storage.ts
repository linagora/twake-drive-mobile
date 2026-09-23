import { accountStorage } from '@/storage/accountScope'

// cozy-pouch-link keys its last replication sequences by doctype alone, so this
// store belongs to one account: another one replicating from those sequences
// would skip everything written before them.
export const POUCH_META_STORE = 'pouchdb-meta'

const mmkv = accountStorage(POUCH_META_STORE)

export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    return Promise.resolve(mmkv.getString(key) ?? null)
  },
  setItem: async (key: string, value: string | undefined): Promise<void> => {
    if (value === undefined) return Promise.resolve()
    mmkv.set(key, value)
    return Promise.resolve()
  },
  removeItem: async (key: string): Promise<boolean> => {
    mmkv.remove(key)
    return Promise.resolve(true)
  }
}
