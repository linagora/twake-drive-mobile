import React from 'react'
import { StyleSheet } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))

// AppBar renders the real account identity via useCurrentUser (Task 4), which
// calls cozy-client's useQuery under the hood. Mock it so the avatar shows a
// deterministic 'AB' instead of requiring a CozyClient in the render tree.
let mockAvatarUrl: string | undefined
jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => ({
    name: 'Alice B',
    email: 'a@b.c',
    initials: 'AB',
    avatarUrl: mockAvatarUrl,
    loading: false
  })
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
  mockAvatarUrl = undefined
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

// TalkBack stopped on the avatar with nothing to announce (#275).
test('the avatar says what it opens', () => {
  render(wrap(<AppBar title="Mes fichiers" onLogout={jest.fn()} />))

  expect(screen.getByLabelText('a11y.account')).toBeOnTheScreen()
})

test('renders the instance avatar when there is one', () => {
  mockAvatarUrl = 'https://alice.example.com/public/avatar'
  render(wrap(<AppBar title="Mes fichiers" onLogout={jest.fn()} />))

  expect(screen.getByTestId('appbar-avatar-image')).toBeOnTheScreen()
  expect(screen.queryByText('AB')).toBeNull()
})

test('falls back to the initials when the avatar cannot be loaded', () => {
  mockAvatarUrl = 'https://alice.example.com/public/avatar'
  render(wrap(<AppBar title="Mes fichiers" onLogout={jest.fn()} />))

  fireEvent(screen.getByTestId('appbar-avatar-image'), 'error')
  expect(screen.getByText('AB')).toBeOnTheScreen()
})

test('shows the initials when the instance has no avatar url yet', () => {
  render(wrap(<AppBar title="Mes fichiers" onLogout={jest.fn()} />))
  expect(screen.getByText('AB')).toBeOnTheScreen()
})

describe('logging out from the account menu', () => {
  const openLogout = async (onLogout: jest.Mock): Promise<void> => {
    render(wrap(<AppBar title="Mes fichiers" onLogout={onLogout} />))
    fireEvent.press(screen.getByTestId('appbar-avatar'))
    fireEvent.press(screen.getByTestId('appbar-logout'))
    // The menu animates its closing; let it settle inside act().
    await act(() => new Promise(resolve => setTimeout(resolve, 500)))
  }

  test('asks before leaving, instead of logging out on the tap', async () => {
    const onLogout = jest.fn()
    await openLogout(onLogout)
    expect(onLogout).not.toHaveBeenCalled()
    expect(screen.getByText('settings.logoutTitle')).toBeOnTheScreen()
  })

  test('leaves the local data alone on a plain log out', async () => {
    const onLogout = jest.fn()
    await openLogout(onLogout)
    fireEvent.press(screen.getByTestId('logout-dialog-submit'))
    expect(onLogout).toHaveBeenCalledWith({ wipe: false })
  })

  test('erases what the device holds when that is the action chosen', async () => {
    const onLogout = jest.fn()
    await openLogout(onLogout)
    fireEvent.press(screen.getByTestId('logout-dialog-secondary'))
    expect(onLogout).toHaveBeenCalledWith({ wipe: true })
  })

  test('stays signed in when the question is dismissed', async () => {
    const onLogout = jest.fn()
    await openLogout(onLogout)
    fireEvent.press(screen.getByTestId('logout-dialog-cancel'))
    expect(onLogout).not.toHaveBeenCalled()
  })
})

// The logo and the avatar sit one gutter from the screen edge, like the list (#447).
test('the logo and the avatar share the same inset from the edges', () => {
  render(wrap(<AppBar title="Mes fichiers" onLogout={jest.fn()} />))

  const logo = StyleSheet.flatten(screen.getByTestId('appbar-logo').props.style)
  const avatar = StyleSheet.flatten(screen.getByTestId('appbar-avatar').props.style)
  expect(logo.marginLeft).toBe(avatar.marginRight)
})
