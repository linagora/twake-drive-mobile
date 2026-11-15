import { renderHook, act } from '@testing-library/react-native'
import * as ReactNative from 'react-native'
import { useActiveColorScheme, useThemePreference, setThemePreference } from './themePreference'

describe('useThemePreference', () => {
  it('defaults to system and updates via setPref', () => {
    const { result } = renderHook(() => useThemePreference())
    expect(result.current.pref).toBe('system')
    act(() => result.current.setPref('dark'))
    expect(result.current.pref).toBe('dark')
  })
})

describe('useActiveColorScheme', () => {
  afterEach(() => {
    act(() => setThemePreference('system'))
    jest.restoreAllMocks()
  })

  it('follows the OS scheme when the preference is "system"', () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark')
    setThemePreference('system')
    const { result } = renderHook(() => useActiveColorScheme())
    expect(result.current).toBe('dark')
  })

  it('lets the stored preference win over the OS scheme', () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light')
    setThemePreference('dark')
    const { result } = renderHook(() => useActiveColorScheme())
    expect(result.current).toBe('dark')
  })

  it('falls back to light when the OS reports nothing', () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(null)
    setThemePreference('system')
    const { result } = renderHook(() => useActiveColorScheme())
    expect(result.current).toBe('light')
  })
})
