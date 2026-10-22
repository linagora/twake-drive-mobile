import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { useClient } from 'cozy-client'
import type flag from 'cozy-flags'

import { getOnlineMonitor } from '@/network/OnlineMonitor'

/**
 * Refreshes the feature flags every time the app comes back to the foreground:
 * the cozy-flags plugin reads them on login only, so a flag flipped on the
 * instance would otherwise wait for the next cold start.
 *
 * Mount once in the drive layout, next to useForegroundSync.
 */
export const useFlagsRefresh = (): void => {
  const client = useClient()
  const previousState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    if (!client) return
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasInactive = previousState.current.match(/inactive|background/)
      previousState.current = next
      if (!wasInactive || next !== 'active' || !getOnlineMonitor().getCurrent()) return
      const flags = (client.plugins as { flags?: InstanceType<typeof flag.plugin> }).flags
      flags
        ?.refresh()
        .catch(err => console.warn('[useFlagsRefresh] could not refresh the flags', err))
    })
    return () => sub.remove()
  }, [client])
}
