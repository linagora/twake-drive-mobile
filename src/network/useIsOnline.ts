import { useEffect, useState } from 'react'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

const computeOnline = (state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  Boolean(state.isConnected) && state.isInternetReachable !== false

/**
 * Reactive online/offline boolean for UI gating.
 *
 * Returns `true` when the device reports a connection AND `isInternetReachable`
 * is not explicitly `false` (null is treated as "probably online" — matches
 * NetInfo's own semantics for platforms where reachability isn't measured yet).
 */
export const useIsOnline = (): boolean => {
  const [online, setOnline] = useState<boolean>(true)
  useEffect(() => {
    let cancelled = false
    void NetInfo.fetch().then(state => {
      if (!cancelled) setOnline(computeOnline(state))
    })
    const unsubscribe = NetInfo.addEventListener(state => {
      setOnline(computeOnline(state))
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])
  return online
}
