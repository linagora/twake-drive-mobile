import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo'

/**
 * cozy-pouch-link's `platform.isOnline` returns a boolean. We keep an
 * up-to-date `currentState` driven by NetInfo events so each call resolves
 * synchronously after the first fetch.
 *
 * Stays consistent with `useIsOnline` (the UI-facing hook): online means
 * `isConnected && isInternetReachable !== false`. Treating `isInternetReachable`
 * as `null` → online matches NetInfo's own semantics for platforms where
 * reachability hasn't been measured yet.
 */
const computeOnline = (state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  Boolean(state.isConnected) && state.isInternetReachable !== false

let currentState: boolean | undefined
let unsubscribe: NetInfoSubscription | undefined

export const isOnline = async (): Promise<boolean> => {
  if (currentState === undefined) {
    const state = await NetInfo.fetch()
    currentState = computeOnline(state)
    // Capture the subscription handle so callers can dispose. Without
    // this the listener leaked across Fast Refresh cycles and across
    // module re-evaluations in tests.
    unsubscribe = NetInfo.addEventListener(s => {
      currentState = computeOnline(s)
    })
  }
  return currentState
}

/**
 * Nothing calls it yet, logout should: see #437.
 * @public
 */
export const stopListeningIsOnline = (): void => {
  unsubscribe?.()
  unsubscribe = undefined
  currentState = undefined
}
