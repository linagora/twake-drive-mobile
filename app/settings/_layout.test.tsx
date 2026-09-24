import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('expo-router', () => {
  const { Text, View } = require('react-native')
  return {
    __esModule: true,
    Stack: () => <View testID="settings-stack" />,
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>
  }
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

let mockClient: unknown = {}
jest.mock('cozy-client', () => ({ __esModule: true, useClient: () => mockClient }))

import SettingsLayout from './_layout'

describe('SettingsLayout', () => {
  beforeEach(() => {
    mockClient = {}
  })

  // The settings route is an iOS pageSheet. Without a Portal.Host of its own,
  // every Paper dialog of the stack mounts below that sheet and is never seen.
  it('hosts the stack in a portal of its own, so its dialogs draw above the sheet', () => {
    const { getByTestId } = render(<SettingsLayout />)

    const host = getByTestId('portal-host')
    expect(host).toBeTruthy()
    expect(getByTestId('settings-stack')).toBeTruthy()
  })

  it('sends a visitor with no client back to the welcome screen', () => {
    mockClient = null
    const { getByTestId, queryByTestId } = render(<SettingsLayout />)

    expect(getByTestId('redirect')).toBeTruthy()
    expect(queryByTestId('settings-stack')).toBeNull()
  })
})
