import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useClient } from 'cozy-client'

import { pouchLink } from '@/client/createClient'

import { SyncContext, SyncContextValue, SyncStatus } from './SyncContext'

interface Props {
  children: React.ReactNode
}

export const SyncProvider = ({ children }: Props) => {
  const client = useClient()
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [error, setError] = useState<Error | null>(null)
  // Track whether NetInfo last said offline so doctypesync:start doesn't
  // override the offline pill back to 'syncing' when the link is winding
  // down its in-flight task right after we've gone offline.
  const offlineRef = useRef(false)

  // Lifecycle: start replication when client is available.
  useEffect(() => {
    if (!client) return
    pouchLink.startReplication()
    return () => {
      pouchLink.stopReplication()
    }
  }, [client])

  // AppState: stop on background, immediate sync on foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        pouchLink.stopReplication()
      } else if (next === 'active' && !offlineRef.current) {
        pouchLink.syncImmediately()
      }
    })
    return () => sub.remove()
  }, [])

  // NetInfo: track online/offline transitions.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected === true
      if (!online && !offlineRef.current) {
        offlineRef.current = true
        setStatus('offline')
        pouchLink.stopReplication()
      } else if (online && offlineRef.current) {
        offlineRef.current = false
        setStatus('syncing')
        pouchLink.startReplication()
        pouchLink.syncImmediately()
      }
    })
    return () => unsubscribe()
  }, [])

  // cozy-client events from the pouch link.
  useEffect(() => {
    if (!client) return
    const onDoctypeStart = () => {
      if (!offlineRef.current) setStatus('syncing')
    }
    const onSyncEnd = () => {
      if (!offlineRef.current) {
        setStatus('idle')
        setLastSyncedAt(new Date())
        setError(null)
      }
    }
    const onSyncError = (err: Error) => {
      if (!offlineRef.current) {
        setStatus('error')
        setError(err)
      }
    }
    client.on('pouchlink:doctypesync:start', onDoctypeStart)
    client.on('pouchlink:sync:end', onSyncEnd)
    client.on('pouchlink:sync:error', onSyncError)
    return () => {
      client.removeListener?.('pouchlink:doctypesync:start', onDoctypeStart)
      client.removeListener?.('pouchlink:sync:end', onSyncEnd)
      client.removeListener?.('pouchlink:sync:error', onSyncError)
    }
  }, [client])

  const triggerSync = useCallback(() => {
    if (offlineRef.current) return
    pouchLink.syncImmediately()
  }, [])

  const value: SyncContextValue = useMemo(
    () => ({ status, lastSyncedAt, error, triggerSync }),
    [status, lastSyncedAt, error, triggerSync]
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
