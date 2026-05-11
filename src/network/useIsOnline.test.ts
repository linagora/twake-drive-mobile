import { renderHook, act } from '@testing-library/react-native'
import NetInfo from '@react-native-community/netinfo'
import { useIsOnline } from './useIsOnline'

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
  fetch: jest.fn()
}))

describe('useIsOnline', () => {
  beforeEach(() => {
    ;(NetInfo.addEventListener as jest.Mock).mockReset()
    ;(NetInfo.fetch as jest.Mock).mockReset()
  })

  it('returns true initially while fetch is pending, then updates from fetch result', async () => {
    ;(NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false, isInternetReachable: false })
    ;(NetInfo.addEventListener as jest.Mock).mockReturnValue(() => undefined)
    const { result } = renderHook(() => useIsOnline())
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current).toBe(false)
  })

  it('flips to false when NetInfo event reports disconnected', async () => {
    ;(NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true, isInternetReachable: true })
    let cb: ((s: { isConnected: boolean; isInternetReachable: boolean | null }) => void) | undefined
    ;(NetInfo.addEventListener as jest.Mock).mockImplementation(fn => {
      cb = fn
      return () => undefined
    })
    const { result } = renderHook(() => useIsOnline())
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current).toBe(true)
    act(() => cb?.({ isConnected: false, isInternetReachable: false }))
    expect(result.current).toBe(false)
  })

  it('treats isInternetReachable === false as offline even when isConnected is true', async () => {
    ;(NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true, isInternetReachable: false })
    ;(NetInfo.addEventListener as jest.Mock).mockReturnValue(() => undefined)
    const { result } = renderHook(() => useIsOnline())
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current).toBe(false)
  })
})
