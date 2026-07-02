import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { I18nextProvider } from 'react-i18next'

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn()
  })
}))

jest.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ logout: jest.fn() })
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))

jest.mock('@/ui/SyncIndicator', () => ({
  SyncIndicator: () => null
}))

import FavoritesScreen from './index'
import i18n from '@/i18n'

const wrap = (ui: React.ReactElement) => (
  <I18nextProvider i18n={i18n}>
    <PaperProvider>{ui}</PaperProvider>
  </I18nextProvider>
)

describe('FavoritesScreen', () => {
  it('renders the Favoris title', () => {
    render(wrap(<FavoritesScreen />))
    expect(screen.getByText('Favoris')).toBeOnTheScreen()
  })

  it('renders the empty favorites message', () => {
    render(wrap(<FavoritesScreen />))
    expect(screen.getByText('Aucun favori')).toBeOnTheScreen()
  })
})
