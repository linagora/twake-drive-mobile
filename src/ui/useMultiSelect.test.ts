import { act, renderHook } from '@testing-library/react-native'
import { useMultiSelect } from './useMultiSelect'

describe('useMultiSelect', () => {
  it('starts empty and not selecting', () => {
    const { result } = renderHook(() => useMultiSelect())
    expect(result.current.count).toBe(0)
    expect(result.current.isSelecting).toBe(false)
    expect(result.current.isSelected('any')).toBe(false)
  })

  it('select adds an id and flips isSelecting', () => {
    const { result } = renderHook(() => useMultiSelect())
    act(() => result.current.select('a'))
    expect(result.current.count).toBe(1)
    expect(result.current.isSelecting).toBe(true)
    expect(result.current.isSelected('a')).toBe(true)
  })

  it('select is idempotent', () => {
    const { result } = renderHook(() => useMultiSelect())
    act(() => result.current.select('a'))
    const first = result.current.selectedIds
    act(() => result.current.select('a'))
    // Same set reference: no-op when already selected.
    expect(result.current.selectedIds).toBe(first)
  })

  it('toggle flips selection state', () => {
    const { result } = renderHook(() => useMultiSelect())
    act(() => result.current.toggle('a'))
    expect(result.current.isSelected('a')).toBe(true)
    act(() => result.current.toggle('a'))
    expect(result.current.isSelected('a')).toBe(false)
    expect(result.current.isSelecting).toBe(false)
  })

  it('deselect removes an id', () => {
    const { result } = renderHook(() => useMultiSelect())
    act(() => result.current.select('a'))
    act(() => result.current.select('b'))
    act(() => result.current.deselect('a'))
    expect(result.current.count).toBe(1)
    expect(result.current.isSelected('a')).toBe(false)
    expect(result.current.isSelected('b')).toBe(true)
  })

  it('clear empties the set', () => {
    const { result } = renderHook(() => useMultiSelect())
    act(() => result.current.select('a'))
    act(() => result.current.select('b'))
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
    expect(result.current.isSelecting).toBe(false)
  })

  it('clear is a no-op when already empty', () => {
    const { result } = renderHook(() => useMultiSelect())
    const initial = result.current.selectedIds
    act(() => result.current.clear())
    expect(result.current.selectedIds).toBe(initial)
  })
})
