import NetInfo, { NetInfoState } from '@react-native-community/netinfo'

jest.mock('@react-native-community/netinfo', () => {
  let listener: ((s: Partial<NetInfoState>) => void) | undefined
  return {
    addEventListener: jest.fn((cb: (s: Partial<NetInfoState>) => void) => {
      listener = cb
      return () => {
        listener = undefined
      }
    }),
    fetch: jest
      .fn()
      .mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
    __emit: (s: Partial<NetInfoState>) => listener?.(s)
  }
})

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

const fetchMock = jest.fn()
;(global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch

import { createOnlineMonitor } from './OnlineMonitor'

describe('OnlineMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ status: 200 } as unknown as Response)
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('reports online from initial NetInfo state', async () => {
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com' })
    await flush()
    expect(mon.getCurrent()).toBe(true)
    expect(mon.getNetType()).toBe('wifi')
  })

  it('probe override: NetInfo offline + probe online keeps current() = true', async () => {
    // The OR-merge is intentional: if the probe says the stack is reachable,
    // we trust it over NetInfo (which is unreliable on iOS sim).
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com' })
    await flush() // initial probe succeeds (mock returns status 200)
    const listener = jest.fn()
    mon.subscribe(listener)
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none' as never
    })
    expect(mon.getCurrent()).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('goes offline as soon as the probe fails, whatever NetInfo says', async () => {
    // The probe measures the only thing that matters: can the stack be reached.
    fetchMock.mockResolvedValue({ status: 0 } as unknown as Response) // make the probe fail
    const mon = createOnlineMonitor({
      probeUri: 'https://stack.example.com',
      probeIntervalMs: 1000
    })
    const listener = jest.fn()
    mon.subscribe(listener)
    // The first probe answers false, and from then on it decides.
    await flush()
    expect(mon.getCurrent()).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi' as never
    })
    await flush()
    // NetInfo claiming a live connection does not bring it back on its own.
    expect(mon.getCurrent()).toBe(false)
  })

  // Airplane mode kept the app looking online, and the sync indicator spinning,
  // until the probe timer happened to tick.
  it('re-probes at once when NetInfo reports the network is gone', async () => {
    const mon = createOnlineMonitor({
      probeUri: 'https://stack.example.com',
      probeIntervalMs: 60_000
    })
    await flush()
    expect(mon.getCurrent()).toBe(true)

    const listener = jest.fn()
    mon.subscribe(listener)
    fetchMock.mockRejectedValue(new Error('offline'))
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none' as never
    })
    await flush()

    // No timer advanced: the transition itself triggered the probe.
    expect(mon.getCurrent()).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)
  })

  // NetInfo kept reporting a live connection with the network gone, and the OR
  // that let a NetInfo false-negative be overridden also let that stale true
  // outvote a probe that had just failed.
  it('a failing probe wins over a NetInfo that still says connected', async () => {
    const mon = createOnlineMonitor({
      probeUri: 'https://stack.example.com',
      probeIntervalMs: 1000
    })
    await flush()
    expect(mon.getCurrent()).toBe(true)

    const listener = jest.fn()
    mon.subscribe(listener)
    fetchMock.mockRejectedValue(new Error('unreachable'))
    jest.advanceTimersByTime(1000)
    await flush()

    expect(mon.getCurrent()).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)
  })

  it('unsubscribe stops notifications', async () => {
    const mon = createOnlineMonitor({ probeUri: 'https://stack.example.com' })
    await flush()
    const listener = jest.fn()
    const off = mon.subscribe(listener)
    off()
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none' as never
    })
    expect(listener).not.toHaveBeenCalled()
  })

  it('setProbeUri lets a monitor created without a URI start probing and override a NetInfo false-negative', async () => {
    fetchMock.mockResolvedValue({ status: 200 } as unknown as Response)
    // Simulates the singleton being created first by a caller with no stack URI
    // (e.g. the offline Downloader) — the probe is disabled, so online tracks NetInfo.
    const mon = createOnlineMonitor({ probeUri: undefined, probeIntervalMs: 1000 })
    await flush()
    ;(NetInfo as unknown as { __emit: (s: Partial<NetInfoState>) => void }).__emit({
      isConnected: false,
      isInternetReachable: false,
      type: 'none' as never
    })
    await flush()
    expect(mon.getCurrent()).toBe(false) // stuck offline: no probe to override NetInfo
    expect(fetchMock).not.toHaveBeenCalled()

    // Once the real stack URI is provided (as useIsOnline does when the client is
    // ready), the probe runs and its success overrides the NetInfo false-negative.
    mon.setProbeUri('https://stack.example.com')
    await flush()
    expect(fetchMock).toHaveBeenCalled()
    expect(mon.getCurrent()).toBe(true)
  })
})
