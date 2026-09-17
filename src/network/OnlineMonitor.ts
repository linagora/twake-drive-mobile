import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

export type OnlineListener = (online: boolean) => void

export interface OnlineMonitor {
  getCurrent(): boolean
  getNetType(): string | undefined
  subscribe(listener: OnlineListener): () => void
  /**
   * Set/replace the stack URI used by the reachability probe, starting a probe
   * immediately. The singleton may be created by a caller that does not yet know
   * the URI (the offline Downloader calls getOnlineMonitor() with none), which
   * would otherwise leave the probe disabled forever — and with it the only
   * override for a NetInfo false-negative on networks that block its reachability
   * check. useIsOnline supplies the URI once the client is ready.
   */
  setProbeUri(uri: string): void
  /** For tests. */
  dispose(): void
}

interface CreateOptions {
  probeUri?: string
  probeIntervalMs?: number
  probeTimeoutMs?: number
}

const computeOnline = (s: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  Boolean(s.isConnected) && s.isInternetReachable !== false

export const createOnlineMonitor = (opts: CreateOptions = {}): OnlineMonitor => {
  const probeIntervalMs = opts.probeIntervalMs ?? 15 * 1000
  const probeTimeoutMs = opts.probeTimeoutMs ?? 8 * 1000

  // Mutable so the stack URI can be supplied after construction — see setProbeUri.
  let probeUri = opts.probeUri
  let netInfoOnline = true
  let probeOnline: boolean | null = null
  let netType: string | undefined
  const listeners = new Set<OnlineListener>()

  // The probe is a direct measurement of the only thing "online" means here:
  // can we reach the stack. Once it has answered, it decides. NetInfo is the
  // bootstrap answer, used until the first probe lands.
  //
  // It used to be `netInfoOnline || probeOnline`, so that a NetInfo
  // false-negative could be overridden. That also meant a NetInfo that stayed
  // true when the network was gone — which is what it does on the simulator,
  // and what airplane mode produced on device — kept the app online with the
  // probe failing next to it.
  const current = (): boolean => (probeOnline === null ? netInfoOnline : probeOnline)
  let lastEmitted = current()
  const emit = (): void => {
    const v = current()
    if (v === lastEmitted) return
    lastEmitted = v
    listeners.forEach(l => l(v))
  }

  const probe = async (): Promise<void> => {
    if (!probeUri) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), probeTimeoutMs)
    try {
      const r = await fetch(`${probeUri}/status`, {
        method: 'GET',
        cache: 'no-cache',
        signal: controller.signal
      })
      probeOnline = r.status >= 200 && r.status < 400
    } catch {
      probeOnline = false
    } finally {
      clearTimeout(timeout)
      emit()
    }
  }

  void NetInfo.fetch().then(s => {
    netInfoOnline = computeOnline(s)
    netType = s.type
    emit()
  })

  const unsubNetInfo = NetInfo.addEventListener(s => {
    const next = computeOnline(s)
    const changed = next !== netInfoOnline
    netInfoOnline = next
    netType = s.type
    emit()
    // A cached probe result keeps `current()` online on its own, so losing the
    // network left the app looking online until the next tick of the probe
    // timer — up to probeIntervalMs of a spinning sync indicator in airplane
    // mode. Re-probe on the transition instead of waiting for it.
    if (changed) void probe()
  })

  const probeTimer = setInterval(() => void probe(), probeIntervalMs)
  // Initial probe — necessary because iOS simulator and some physical devices
  // can report `isConnected: false, type: 'none'` at app start even when the
  // network actually works. The probe is the authoritative override.
  void probe()

  return {
    getCurrent: () => current(),
    getNetType: () => netType,
    setProbeUri: (uri: string) => {
      if (!uri || uri === probeUri) return
      probeUri = uri
      void probe()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      unsubNetInfo()
      clearInterval(probeTimer)
      listeners.clear()
    }
  }
}

let singleton: OnlineMonitor | null = null

export const getOnlineMonitor = (probeUri?: string): OnlineMonitor => {
  if (!singleton) {
    singleton = createOnlineMonitor({ probeUri })
  } else if (probeUri) {
    // A prior caller (e.g. the offline Downloader) may have created the singleton
    // without a URI, disabling the probe. Supply it now so probing starts.
    singleton.setProbeUri(probeUri)
  }
  return singleton
}

/** Test only. */
export const _resetOnlineMonitor = (): void => {
  singleton?.dispose()
  singleton = null
}
