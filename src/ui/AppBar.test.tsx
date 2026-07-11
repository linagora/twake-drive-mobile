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

describe('AppBar search (disabled)', () => {
  it('does not render the search button even with showSearch', () => {
    render(wrap(<AppBar title="Mes fichiers" showSearch />))
    expect(screen.queryByLabelText('drive.search.action')).toBeNull()
    expect(screen.queryByTestId('appbar-search-button')).toBeNull()
  })

  it('still exposes the back-button testID for Maestro', () => {
    render(wrap(<AppBar title="Mes fichiers" showSearch onBack={() => {}} />))
    expect(screen.getByTestId('appbar-back-button')).toBeOnTheScreen()
  })
})

test('AppBar affiche le TwakeLogo à côté du titre', () => {
  const { getByText, UNSAFE_getByType } = render(wrap(<AppBar title="Mes fichiers" />))
  expect(getByText('Mes fichiers')).toBeTruthy()
  // TwakeLogo renders an Svg root; verify it is present in the tree.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Svg = require('react-native-svg').default
  expect(UNSAFE_getByType(Svg)).toBeTruthy()
})
