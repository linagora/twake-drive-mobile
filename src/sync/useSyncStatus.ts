import { useContext } from 'react'

import { SyncContext, SyncContextValue } from './SyncContext'

export const useSyncStatus = (): SyncContextValue => useContext(SyncContext)
