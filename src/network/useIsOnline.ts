import { useEffect, useState } from 'react'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import { useClient } from 'cozy-client'

const computeOnline = (state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  Boolean(state.isConnected) && state.isInternetReachable !== false

/** How often to run the fallback fetch probe against the cozy-stack. */
const PROBE_INTERVAL_MS = 15 * 1000
/** Timeout for the fallback probe — beyond this we assume the host is dead. */
const PROBE_TIMEOUT_MS = 8 * 1000

const probeStack = async (uri: string): Promise<boolean> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const url = new URL('/status', uri).toString()
    const resp = await fetch(url, { method: 'GET', cache: 'no-cache', signal: controller.signal })
    return resp.status >= 200 && resp.status < 400
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Reactive online/offline boolean for UI gating.
 *
 * Combines two signals (OR):
 *   1. NetInfo's reported state — fast, OS-level, but on iOS simulator
 *      (and after some network state changes on physical devices) it can
 *      get stuck reporting `isConnected: false, type: 'none'` even when
 *      the device actually has network.
 *   2. A periodic direct GET to `${session.uri}/status` — slower (15 s
 *      cadence) but authoritative: if the cozy-stack responds, the user
 *      can use the app, full stop.
 *
 * Returns `true` if either signal says online. This is intentionally
 * permissive — we'd rather let a user try a mutation that then fails
 * (and shows an error) than block them when their network actually
 * works but NetInfo is confused.
 */
export const useIsOnline = (): boolean => {
  const [netInfoOnline, setNetInfoOnline] = useState<boolean>(true)
  const [probeOnline, setProbeOnline] = useState<boolean | null>(null)
  const client = useClient()

  // NetInfo subscription.
  useEffect(() => {
    let cancelled = false
    void NetInfo.fetch().then(state => {
      if (!cancelled) setNetInfoOnline(computeOnline(state))
    })
    const unsubscribe = NetInfo.addEventListener(state => {
      setNetInfoOnline(computeOnline(state))
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // Fallback probe against the user's cozy-stack.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uri: string | undefined = (client as any)?.getStackClient?.().uri
    if (!uri) return
    let cancelled = false
    const run = async (): Promise<void> => {
      const ok = await probeStack(uri)
      if (!cancelled) setProbeOnline(ok)
    }
    void run()
    const timer = setInterval(() => {
      void run()
    }, PROBE_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [client])

  // OR-merge. `probeOnline === null` means "not yet probed" → fall back
  // to NetInfo only (avoids briefly flashing offline at app start).
  if (probeOnline === null) return netInfoOnline
  return netInfoOnline || probeOnline
}
