import React from 'react'
import { Platform, StatusBar, Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 })
}))

import { useSheetBottomInset, useSheetTopInset } from './sheetInset'

const BottomProbe = (): React.ReactElement => (
  <Text testID="bottom">{String(useSheetBottomInset())}</Text>
)

const Probe = (): React.ReactElement => <Text testID="inset">{String(useSheetTopInset())}</Text>

describe('useSheetTopInset', () => {
  const os = Platform.OS
  const statusBar = StatusBar.currentHeight

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
    StatusBar.currentHeight = statusBar
  })

  // An iOS pageSheet starts below the status bar already, and the root
  // SafeAreaProvider measures the window, so its inset is empty space.
  it('adds nothing on iOS, where the sheet already clears the status bar', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    render(<Probe />)

    expect(screen.getByTestId('inset')).toHaveTextContent('0')
  })

  it('reports the navigation bar inset so the last action clears it', () => {
    render(<BottomProbe />)

    expect(screen.getByTestId('bottom')).toHaveTextContent('34')
  })

  it('clears the status bar on Android, where the route is full-screen', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    render(<Probe />)

    expect(screen.getByTestId('inset')).toHaveTextContent('59')
  })
})
