import { useCallback, useEffect, useState } from 'react'
import { useClient } from 'cozy-client'

import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { SharedDriveEntry } from './sharedDrives'
import { getCachedSharedDrives, syncSharedDrives } from './sharedDriveReplication'

interface SharedDrivesState {
  drives: SharedDriveEntry[]
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * The shared drives, from the last listing kept on disk and refreshed from the
 * instance when there is a network. The listing is a stack call, so offline the
 * cached one is all there is — and it is enough to reach what replicated.
 */
export const useSharedDrives = (): SharedDrivesState => {
  const client = useClient()
  const [drives, setDrives] = useState<SharedDriveEntry[]>(getCachedSharedDrives)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!client) return
    if (!getOnlineMonitor().getCurrent()) {
      setDrives(getCachedSharedDrives())
      return
    }
    setLoading(true)
    try {
      setDrives(await syncSharedDrives(client))
    } catch (e) {
      console.warn('[sharedDrives] could not refresh the drive list', e)
      setDrives(getCachedSharedDrives())
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { drives, loading, refresh }
}
