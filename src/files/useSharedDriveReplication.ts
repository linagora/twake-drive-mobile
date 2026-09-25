import { useEffect } from 'react'
import { useClient } from 'cozy-client'

import { getOnlineMonitor } from '@/network/OnlineMonitor'
import {
  replicateAllSharedDrives,
  restoreSharedDriveReplication,
  syncSharedDrives
} from './sharedDriveReplication'
import { isEagerSharedDriveSyncEnabled } from './sharedDriveFlags'

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
        const drives = await syncSharedDrives(client)
        if (cancelled) return
        // Off by default: every drive replicating from the first sync is what
        // the per-drive registration was written to avoid paying for.
        if (isEagerSharedDriveSyncEnabled()) await replicateAllSharedDrives(client, drives)
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
