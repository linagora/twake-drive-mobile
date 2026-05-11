import React, { useEffect, useState } from 'react'
import { ActivityIndicator } from 'react-native-paper'
import { useClient } from 'cozy-client'

import { getPouchLink } from '@/pouchdb/triggerReplication'

/**
 * Subtle spinner that appears while a Pouch replication is in flight.
 *
 * cozy-pouch-link emits 'sync:start' / 'sync:end' events on its internal
 * EventEmitter (see node_modules/cozy-pouch-link/dist/CozyPouchLink.js).
 * The link is a node EventEmitter-style object with .on/.off methods.
 */
export const SyncIndicator = (): React.ReactElement | null => {
  const client = useClient()
  const [syncing, setSyncing] = useState(false)
  useEffect(() => {
    const pouch = getPouchLink(client ?? undefined)
    if (!pouch) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link = pouch as any
    const onStart = (): void => setSyncing(true)
    const onEnd = (): void => setSyncing(false)
    // .on / .off may not be present in v60; guard with optional chaining
    link.on?.('sync:start', onStart)
    link.on?.('sync:end', onEnd)
    return () => {
      link.off?.('sync:start', onStart)
      link.off?.('sync:end', onEnd)
    }
  }, [client])
  if (!syncing) return null
  return <ActivityIndicator size={14} />
}
