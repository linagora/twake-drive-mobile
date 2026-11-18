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

describe('setThemePreference on Android', () => {
  const platform = ReactNative.Platform.OS
  beforeEach(() => {
    ReactNative.Platform.OS = 'android'
  })
  afterEach(() => {
    setThemePreference('system')
    ReactNative.Platform.OS = platform
    jest.restoreAllMocks()
  })

  it('hands the choice to the system bars, and gives them back to the OS on "system"', () => {
    const setColorScheme = jest.spyOn(ReactNative.Appearance, 'setColorScheme')
    setThemePreference('dark')
    expect(setColorScheme).toHaveBeenLastCalledWith('dark')
    setThemePreference('system')
    expect(setColorScheme).toHaveBeenLastCalledWith(null)
  })

  it('hands the choice back when the app returns to the foreground', () => {
    jest.isolateModules(() => {
      const RN: typeof ReactNative = require('react-native')
      RN.Platform.OS = 'android'
      const addEventListener = jest.spyOn(RN.AppState, 'addEventListener')
      const setColorScheme = jest.spyOn(RN.Appearance, 'setColorScheme')
      const isolated: typeof import('./themePreference') = require('./themePreference')
      isolated.setThemePreference('dark')
      setColorScheme.mockClear()
      addEventListener.mock.calls[0][1]('active')
      expect(setColorScheme).toHaveBeenCalledWith('dark')
      isolated.setThemePreference('system')
    })
  })

  // On "system", expo-system-ui's own night mode stands (AUTO_BATTERY below Android 9).
  it('leaves the night mode alone on "system", at start and back in the foreground', () => {
    jest.isolateModules(() => {
      const RN: typeof ReactNative = require('react-native')
      RN.Platform.OS = 'android'
      const addEventListener = jest.spyOn(RN.AppState, 'addEventListener')
      const setColorScheme = jest.spyOn(RN.Appearance, 'setColorScheme')
      require('./themePreference')
      addEventListener.mock.calls[0][1]('active')
      expect(setColorScheme).not.toHaveBeenCalled()
    })
  })
})
