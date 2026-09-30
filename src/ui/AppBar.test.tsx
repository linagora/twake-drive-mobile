import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))
// AppBar now reads the account identity via useCurrentUser (Task 4), which calls
// cozy-client's useQuery under the hood — this suite has no CozyClient in the
// render tree, so mock it locally (see task-8-brief.md).
jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => ({ initials: 'MM', loading: false })
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() })
}))

import { AppBar } from './AppBar'

const wrap = (ui: React.ReactElement) => (
  <PaperProvider>
    <SafeAreaProvider>{ui}</SafeAreaProvider>
  </PaperProvider>
)

describe('AppBar', () => {
  it('renders no search button', () => {
    render(wrap(<AppBar title="Mes fichiers" />))
    expect(screen.queryByLabelText('drive.search.action')).toBeNull()
    expect(screen.queryByTestId('appbar-search-button')).toBeNull()
  })

  // Removed with the button it opened twake.app from.
  it('renders no help button', () => {
    render(wrap(<AppBar title="Mes fichiers" onLogout={jest.fn()} />))
    expect(screen.queryByTestId('appbar-help-button')).toBeNull()
  })

  it('still exposes the back-button testID for Maestro', () => {
    render(wrap(<AppBar title="Mes fichiers" onBack={() => {}} />))
    expect(screen.getByTestId('appbar-back-button')).toBeOnTheScreen()
  })
})

describe('AppBar close action', () => {
  it('renders a close action and calls onClose', () => {
    const onClose = jest.fn()
    render(wrap(<AppBar title="settings.title" onClose={onClose} />))
    const button = screen.getByTestId('appbar-close-button')
    expect(button).toBeOnTheScreen()
    fireEvent.press(button)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders no close action by default', () => {
    render(wrap(<AppBar title="Mes fichiers" />))
    expect(screen.queryByTestId('appbar-close-button')).toBeNull()
  })
})

test('AppBar affiche le logo quand il n’y a pas de retour', () => {
  render(wrap(<AppBar title="Mes fichiers" />))
  expect(screen.getByTestId('appbar-title')).toHaveTextContent('Mes fichiers')
  expect(screen.getByTestId('appbar-logo')).toBeOnTheScreen()
})

test('AppBar masque le logo à côté d’une flèche retour', () => {
  render(wrap(<AppBar title="Mes fichiers" onBack={jest.fn()} />))
  expect(screen.queryByTestId('appbar-logo')).toBeNull()
})

test('AppBar masque le logo à côté d’une croix de fermeture', () => {
  render(wrap(<AppBar title="Mes fichiers" onClose={jest.fn()} />))
  expect(screen.queryByTestId('appbar-logo')).toBeNull()
})
