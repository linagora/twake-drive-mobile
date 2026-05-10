import NetInfo from '@react-native-community/netinfo'
import PouchDB from 'pouchdb-browser'
import { SQLiteQuery } from 'cozy-pouch-link'

import { sqliteStorage } from './sqliteStorage'

// `events` is required by cozy-pouch-link's PouchManager but is only used
// when the link wants to listen to OS-level online/offline events. We do
// the listening ourselves in SyncProvider via NetInfo, so a no-op proxy is
// safe here.
const events = {
  addEventListener: (): void => undefined,
  removeEventListener: (): void => undefined
}

export const pouchPlatform = {
  storage: sqliteStorage,
  events,
  pouchAdapter: PouchDB,
  queryEngine: SQLiteQuery,
  isOnline: async (): Promise<boolean> => {
    try {
      const state = await NetInfo.fetch()
      return state.isConnected === true
    } catch {
      return false
    }
  }
}
