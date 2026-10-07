import React from 'react'
import { StyleProp, StyleSheet, Text, ViewStyle } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 48, left: 0, right: 0 })
}))

import { ScreenContainer } from './ScreenContainer'
import { lightTheme } from './theme'

const paddingsOf = (props: Omit<React.ComponentProps<typeof ScreenContainer>, 'children'>) => {
  render(
    <ScreenContainer {...props}>
      <Text>content</Text>
    </ScreenContainer>
  )
  const style = StyleSheet.flatten(
    (screen.toJSON() as { props: { style: StyleProp<ViewStyle> } }).props.style
  )
  return { top: style.paddingTop, bottom: style.paddingBottom }
}

const renderThemed = (surface?: boolean): void => {
  render(
    <PaperProvider theme={lightTheme}>
      <ScreenContainer surface={surface} testID="screen">
        {null}
      </ScreenContainer>
    </PaperProvider>
  )
}

describe('ScreenContainer', () => {
  it('adds no inset by default', () => {
    expect(paddingsOf({})).toEqual({ top: 0, bottom: 0 })
  })

  it('keeps the bottom clear of the navigation bar when asked', () => {
    expect(paddingsOf({ bottomInset: true })).toEqual({ top: 0, bottom: 48 })
  })

  it('keeps a sheet clear on both edges', () => {
    const { bottom } = paddingsOf({ sheet: true })
    expect(bottom).toBe(48)
  })

  it('paints the theme background by default', () => {
    renderThemed()
    expect(screen.getByTestId('screen')).toHaveStyle({
      backgroundColor: lightTheme.colors.background
    })
  })

  it('paints the surface for file lists, white in the light theme', () => {
    renderThemed(true)
    expect(screen.getByTestId('screen')).toHaveStyle({ backgroundColor: lightTheme.colors.surface })
    expect(lightTheme.colors.surface).toBe('#fff')
  })
})
