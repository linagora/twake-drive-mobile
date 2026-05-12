import { useEffect, useState } from 'react'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

const computeOnline = (state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  Boolean(state.isConnected) && state.isInternetReachable !== false

/** How often to force-refresh NetInfo while the component is mounted. */
const REFRESH_INTERVAL_MS = 15 * 1000

/**
 * Reactive online/offline boolean for UI gating.
 *
 * Returns `true` when the device reports a connection AND `isInternetReachable`
 * is not explicitly `false` (null is treated as "probably online" — matches
 * NetInfo's own semantics for platforms where reachability isn't measured yet).
 *
 * Why the explicit setInterval (NetInfo's `reachabilityLongTimeout` already
 * polls every 30 s on its own): in practice NetInfo's internal reachability
 * timer can get stuck — an in-flight URLSession from when the device was
 * offline never resolves cleanly when the network comes back, and the next
 * tick is never scheduled. Forcing `NetInfo.refresh()` every 15 s
 * unconditionally guarantees the UI flips back to online within ~15 s of
 * reconnect even if the internal poll is stuck.
 */
export const useIsOnline = (): boolean => {
  const [online, setOnline] = useState<boolean>(true)
  useEffect(() => {
    let cancelled = false
    void NetInfo.fetch().then(state => {
      if (!cancelled) setOnline(computeOnline(state))
    })
    const unsubscribe = NetInfo.addEventListener(state => {
      // eslint-disable-next-line no-console
      console.log('[useIsOnline] NetInfo event', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type
      })
      setOnline(computeOnline(state))
    })
    const refreshTimer = setInterval(() => {
      // eslint-disable-next-line no-console
      console.log('[useIsOnline] refresh tick')
      void NetInfo.refresh().then(state => {
        // eslint-disable-next-line no-console
        console.log('[useIsOnline] refresh result', {
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable
        })
      })
    }, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(refreshTimer)
    }
  }, [])
  return online
}
