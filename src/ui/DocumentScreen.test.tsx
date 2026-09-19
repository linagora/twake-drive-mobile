import React from 'react'
import { Text } from 'react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() })
}))

jest.mock('@/account/useCurrentUser', () => ({
  __esModule: true,
  useCurrentUser: () => ({ initials: 'QV', avatarUrl: null })
}))

import { DocumentScreen } from './DocumentScreen'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('DocumentScreen', () => {
  it('names the document and takes the user back, whatever the chrome', () => {
    const onBack = jest.fn()
    const { rerender } = render(
      wrap(
        <DocumentScreen title="rapport.pdf" onBack={onBack}>
          <Text>content</Text>
        </DocumentScreen>
      )
    )
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('appbar-back-button'))

    rerender(
      wrap(
        <DocumentScreen title="rapport.pdf" onBack={onBack} chrome="immersive">
          <Text>content</Text>
        </DocumentScreen>
      )
    )
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
    expect(screen.getByText('content')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('document-back-button'))

    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('leaves the title to the web editor on an editor screen', () => {
    const onBack = jest.fn()
    render(
      wrap(
        <DocumentScreen onBack={onBack} chrome="editor">
          <Text>editor</Text>
        </DocumentScreen>
      )
    )
    expect(screen.queryByText('rapport.pdf')).not.toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('document-back-button'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
