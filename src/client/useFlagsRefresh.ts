import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { useClient } from 'cozy-client'
import type flag from 'cozy-flags'

import { stopBackupTheInstanceTurnedOff } from '@/backup/backupFlag'
import { getOnlineMonitor } from '@/network/OnlineMonitor'

/**
 * Refreshes the feature flags at launch and every time the app comes back to
 * the foreground: the cozy-flags plugin reads them on login only, so a flag
 * flipped on the instance would otherwise wait for the next cold start.
 *
 * Mount once in the drive layout, next to useForegroundSync.
 */
export const useFlagsRefresh = (): void => {
  const client = useClient()
  const previousState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    if (!client) return
    const refresh = (): void => {
      if (!getOnlineMonitor().getCurrent()) return
      const flags = (client.plugins as { flags?: InstanceType<typeof flag.plugin> } | undefined)
        ?.flags
      // Only flags the stack answered: the login's read falls back to the
      // defaults when it fails, and refresh() rejects instead.
      flags
        ?.refresh()
        .then(stopBackupTheInstanceTurnedOff)
        .catch(err => console.warn('[useFlagsRefresh] could not refresh the flags', err))
    }
    refresh()
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasInactive = previousState.current.match(/inactive|background/)
      previousState.current = next
      if (wasInactive && next === 'active') refresh()
    })
    return () => sub.remove()
  }, [client])
}
