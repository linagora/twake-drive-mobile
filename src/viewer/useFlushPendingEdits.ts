import { useEffect } from 'react'
import { useClient } from 'cozy-client'

import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { flushPendingEdits } from './saveDocument'

/**
 * Sends the drawings edited with no network, as soon as there is one again.
 *
 * Mount once in the drive layout, next to the other background work.
 */
export const useFlushPendingEdits = (): void => {
  const client = useClient()

  useEffect(() => {
    if (!client) return
    const flush = (): void => {
      void flushPendingEdits(client)
    }
    flush()
    return getOnlineMonitor().subscribe(online => {
      if (online) flush()
    })
  }, [client])
}
