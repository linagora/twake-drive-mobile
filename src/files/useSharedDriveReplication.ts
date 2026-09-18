import { useEffect } from 'react'
import { useClient } from 'cozy-client'

import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { restoreSharedDriveReplication, syncSharedDrives } from './sharedDriveReplication'

/**
 * Keeps the shared drives replicating.
 *
 * The link is built from a static doctype list, so every drive registered in a
 * past session has to be registered again on start, before anything reads it;
 * the listing that tells us which drives exist is a stack call, hence the
 * offline path stopping at the restore.
 *
 * Mount once in the drive layout, next to useFlagsRefresh.
 */
export const useSharedDriveReplication = (): void => {
  const client = useClient()

  useEffect(() => {
    if (!client) return
    let cancelled = false
    const run = async (): Promise<void> => {
      await restoreSharedDriveReplication(client)
      if (cancelled || !getOnlineMonitor().getCurrent()) return
      try {
        await syncSharedDrives(client)
      } catch (e) {
        console.warn('[sharedDrives] could not refresh the drive list', e)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client])
}
