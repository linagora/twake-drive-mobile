import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

/**
 * cozy-pouch-link's `platform.isOnline` returns a boolean. We keep an
 * up-to-date `currentState` driven by NetInfo events so each call resolves
 * synchronously after the first fetch.
 *
 * Stays consistent with `useIsOnline` (the UI-facing hook): online means
 * `isConnected && isInternetReachable !== false`. Treating `isInternetReachable`
 * as `null` → online matches NetInfo's own semantics for platforms where
 * reachability hasn't been measured yet.
 *
 * The state is the device's, not the session's: it is kept across logouts.
 */
const computeOnline = (state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  Boolean(state.isConnected) && state.isInternetReachable !== false

let currentState: boolean | undefined

export const isOnline = async (): Promise<boolean> => {
  if (currentState === undefined) {
    const state = await NetInfo.fetch()
    currentState = computeOnline(state)
    NetInfo.addEventListener(s => {
      currentState = computeOnline(s)
    })
  }
  return currentState
}
