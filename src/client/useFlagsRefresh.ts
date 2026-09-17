import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { useClient } from 'cozy-client'

import { refreshFlags } from '@/client/refreshFlags'

/**
 * Refreshes the feature flags when the app starts and every time it comes back
 * to the foreground: a flag flipped on the instance would otherwise only be
 * picked up on the next cold start.
 *
 * Mount once in the drive layout, next to useForegroundSync.
 */
export const useFlagsRefresh = (): void => {
  const client = useClient()
  const previousState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    if (!client) return
    void refreshFlags(client)
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasInactive = previousState.current.match(/inactive|background/)
      previousState.current = next
      if (wasInactive && next === 'active') void refreshFlags(client)
    })
    return () => sub.remove()
  }, [client])
}
