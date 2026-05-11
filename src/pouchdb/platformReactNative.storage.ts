import { createMMKV } from 'react-native-mmkv'

const mmkv = createMMKV({ id: 'pouchdb-meta' })

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
