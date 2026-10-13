import React from 'react'
import { Platform, Switch as NativeSwitch } from 'react-native'
import { MD3DarkTheme, MD3LightTheme, Provider as PaperProvider } from 'react-native-paper'
import { render, screen } from '@testing-library/react-native'

import { Switch } from './Switch'

const renderSwitch = (theme: typeof MD3DarkTheme) =>
  render(
    <PaperProvider theme={theme}>
      <Switch value={false} onValueChange={() => {}} testID="sw" />
    </PaperProvider>
  )

describe('Switch', () => {
  const os = Platform.OS
  afterEach(() => {
    Platform.OS = os
  })

  it('draws an off track from the theme on iOS in the dark theme', () => {
    Platform.OS = 'ios'
    renderSwitch(MD3DarkTheme)
    expect(screen.UNSAFE_getByType(NativeSwitch).props.ios_backgroundColor).toBe(
      MD3DarkTheme.colors.outline
    )
  })

  it('leaves the native track alone in the light theme', () => {
    Platform.OS = 'ios'
    renderSwitch(MD3LightTheme)
    expect(screen.UNSAFE_getByType(NativeSwitch).props.ios_backgroundColor).not.toBe(
      MD3LightTheme.colors.outline
    )
  })
})
