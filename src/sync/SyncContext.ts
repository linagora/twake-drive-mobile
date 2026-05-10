import { createContext } from 'react'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncContextValue {
  status: SyncStatus
  lastSyncedAt: Date | null
  error: Error | null
  /** Trigger an immediate sync (e.g. from pull-to-refresh). No-op if offline. */
  triggerSync: () => void
}

const defaultValue: SyncContextValue = {
  status: 'idle',
  lastSyncedAt: null,
  error: null,
  triggerSync: () => undefined
}

export const SyncContext = createContext<SyncContextValue>(defaultValue)
