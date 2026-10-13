import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('expo-router', () => {
  const { View } = require('react-native')
  return { __esModule: true, Stack: () => <View testID="share-stack" /> }
})

jest.mock('react-native-paper', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    Portal: {
      Host: ({ children }: { children: React.ReactNode }) => (
        <View testID="portal-host">{children}</View>
      )
    }
  }
})

import ShareLayout from './_layout'

describe('ShareLayout', () => {
  it('hosts the stack in a portal of its own, so menus and dialogs draw above the sheet', () => {
    const { getByTestId } = render(<ShareLayout />)

    expect(getByTestId('portal-host')).toBeTruthy()
    expect(getByTestId('share-stack')).toBeTruthy()
  })
})
