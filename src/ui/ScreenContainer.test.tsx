import React from 'react'
import { StyleProp, StyleSheet, Text, ViewStyle } from 'react-native'
import { render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 48, left: 0, right: 0 })
}))

import { ScreenContainer } from './ScreenContainer'

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
})
