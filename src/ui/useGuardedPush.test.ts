import { renderHook } from '@testing-library/react-native'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

import { useGuardedPush } from './useGuardedPush'

describe('useGuardedPush', () => {
  beforeEach(() => {
    mockPush.mockClear()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => jest.useRealTimers())

  it('pushes the first time', () => {
    const { result } = renderHook(() => useGuardedPush())
    result.current('/(drive)/files/abc')
    expect(mockPush).toHaveBeenCalledWith('/(drive)/files/abc')
  })

  // A stalled JS thread let several taps land before the first render.
  it('drops a repeat of the same destination inside the window', () => {
    const { result } = renderHook(() => useGuardedPush())
    result.current('/(drive)/files/abc')
    result.current('/(drive)/files/abc')
    result.current('/(drive)/files/abc')
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('lets a different destination through right away', () => {
    const { result } = renderHook(() => useGuardedPush())
    result.current('/(drive)/files/abc')
    result.current('/(drive)/files/def')
    expect(mockPush).toHaveBeenCalledTimes(2)
  })

  it('allows the same destination again after the window', () => {
    const { result } = renderHook(() => useGuardedPush())
    result.current('/(drive)/files/abc')
    jest.setSystemTime(new Date('2026-01-01T00:00:01Z'))
    result.current('/(drive)/files/abc')
    expect(mockPush).toHaveBeenCalledTimes(2)
  })
})
