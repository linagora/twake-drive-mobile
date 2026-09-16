import React from 'react'
import { Text } from 'react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'
import * as Clipboard from 'expo-clipboard'

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }))

jest.mock('react-i18next', () => ({
  withTranslation: () => (Component: React.ComponentType<{ t: (k: string) => string }>) => {
    const Wrapped = (props: object): React.ReactElement => (
      <Component {...(props as { children: React.ReactNode })} t={(k: string) => k} />
    )
    return Wrapped
  }
}))

import { ErrorBoundary } from './ErrorBoundary'

const Boom = (): React.ReactElement => {
  throw new Error('kaboom')
}

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    // React logs the caught error itself; keep the test output readable.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => consoleError.mockRestore())

  it('renders its children when nothing throws', () => {
    render(
      wrap(
        <ErrorBoundary>
          <Text>all good</Text>
        </ErrorBoundary>
      )
    )
    expect(screen.getByText('all good')).toBeOnTheScreen()
  })

  it('shows the generic message and a retry when a child throws', () => {
    render(
      wrap(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      )
    )
    expect(screen.getByText('errors.generic')).toBeOnTheScreen()
    expect(screen.getByText('common.retry')).toBeOnTheScreen()
  })

  // Release builds forward no JS console anywhere, so this text is the only way
  // a failure met in the field can be reported.
  it('keeps the error behind a details toggle', () => {
    render(
      wrap(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      )
    )
    expect(screen.queryByTestId('error-details-text')).toBeNull()

    fireEvent.press(screen.getByTestId('error-details-toggle'))
    expect(screen.getByTestId('error-details-text')).toBeOnTheScreen()
    expect(screen.getByText(/Error: kaboom/)).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('error-details-toggle'))
    expect(screen.queryByTestId('error-details-text')).toBeNull()
  })

  it('copies the details to the clipboard', () => {
    render(
      wrap(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      )
    )
    fireEvent.press(screen.getByTestId('error-details-toggle'))
    fireEvent.press(screen.getByTestId('error-details-copy'))
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('kaboom'))
  })
})
