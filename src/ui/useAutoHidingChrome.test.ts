import { act, renderHook } from '@testing-library/react-native'

import { CHROME_VISIBLE_MS, useAutoHidingChrome } from './useAutoHidingChrome'

// The bar floats over the document, so leaving it up hides the first line of
// what is being read (#274).
describe('useAutoHidingChrome', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('shows the bar when the document opens', () => {
    const { result } = renderHook(() => useAutoHidingChrome())
    expect(result.current.visible).toBe(true)
  })

  it('takes it away once nothing has happened', () => {
    const { result } = renderHook(() => useAutoHidingChrome())

    act(() => jest.advanceTimersByTime(CHROME_VISIBLE_MS))

    expect(result.current.visible).toBe(false)
  })

  it('brings it back on demand', () => {
    const { result } = renderHook(() => useAutoHidingChrome())
    act(() => jest.advanceTimersByTime(CHROME_VISIBLE_MS))

    act(() => result.current.reveal())

    expect(result.current.visible).toBe(true)
  })

  it('gives it a full turn again rather than the rest of the previous one', () => {
    const { result } = renderHook(() => useAutoHidingChrome())
    act(() => jest.advanceTimersByTime(CHROME_VISIBLE_MS - 200))

    act(() => result.current.reveal())
    act(() => jest.advanceTimersByTime(CHROME_VISIBLE_MS - 200))

    expect(result.current.visible).toBe(true)
    act(() => jest.advanceTimersByTime(200))
    expect(result.current.visible).toBe(false)
  })

  it('drops its timer when the screen goes', () => {
    const { unmount } = renderHook(() => useAutoHidingChrome())

    unmount()

    expect(() => act(() => jest.advanceTimersByTime(CHROME_VISIBLE_MS))).not.toThrow()
  })
})
