import NetInfo from '@react-native-community/netinfo'

/**
 * Configure NetInfo's reachability ping against the user's cozy-stack.
 *
 * Why a custom ping: on iOS simulator (and behind some NATs) the OS-level
 * "connected to a network" flag stays `true` even when the network is down
 * — fetches just time out without NetInfo emitting an `offline` event.
 * A periodic HTTP probe forces NetInfo to mark `isInternetReachable: false`
 * quickly so the offline banner appears in seconds.
 *
 * Why the cozy-stack itself: we don't ping third-party hosts. The cozy
 * instance is the very thing this app talks to — if it's reachable, the
 * app works; if it's not, "offline" is the right state. Tiny endpoint
 * `/status` exists on every cozy-stack and returns a small JSON payload.
 *
 * Call once `session.uri` is known (after login / bootstrap). Subsequent
 * calls replace the previous configuration — that's fine if the user logs
 * into a different instance.
 */
export const configureNetInfo = (cozyUri: string): void => {
  let probe: string
  try {
    probe = new URL('/status', cozyUri).toString()
  } catch {
    // Malformed URI — skip configuration; NetInfo falls back to OS-level
    // reachability, which is still correct on most physical devices.
    return
  }

  NetInfo.configure({
    reachabilityUrl: probe,
    // NetInfo defaults to HEAD which cozy-stack's /status doesn't always
    // accept (returns 405). Force GET — the response body is small.
    reachabilityMethod: 'GET',
    reachabilityTest: async (response: Response) =>
      Promise.resolve(response.status >= 200 && response.status < 400),
    // Ping every 30 s when online — enough to notice a connection died
    // without burning much battery.
    reachabilityLongTimeout: 30 * 1000,
    // Once we've detected offline, ping every 5 s so we recover quickly.
    reachabilityShortTimeout: 5 * 1000,
    // Drop the request after 8 s — anything longer is offline territory.
    reachabilityRequestTimeout: 8 * 1000,
    reachabilityShouldRun: () => true,
    shouldFetchWiFiSSID: false,
    useNativeReachability: false
  })
}
