import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))

// AppBar renders the real account identity via useCurrentUser (Task 4), which
// calls cozy-client's useQuery under the hood. Mock it so the avatar shows a
// deterministic 'AB' instead of requiring a CozyClient in the render tree.
jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => ({ name: 'Alice B', email: 'a@b.c', initials: 'AB', loading: false })
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush })
}))

import { AppBar } from './AppBar'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

beforeEach(() => {
  mockPush.mockClear()
})

test('tapping the avatar opens the menu with settings and logout', () => {
  const onLogout = jest.fn()
  render(wrap(<AppBar title="Mes fichiers" onLogout={onLogout} />))

  // Tap the avatar (Avatar.Text renders the real account initials, from
  // useCurrentUser, as text — mocked above to 'AB', not the old hardcoded 'MM')
  fireEvent.press(screen.getByText('AB'))

  // i18n returns the key in the test env
  expect(screen.getByText('settings.title')).toBeOnTheScreen()
  // Shared drives are not finished on mobile, the entry is not offered yet.
  expect(screen.queryByText('drive.sharedDrives')).toBeNull()
  expect(screen.getByText('common.logout')).toBeOnTheScreen()
})
