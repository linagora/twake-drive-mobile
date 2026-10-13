import React from 'react'
import { Text } from 'react-native'
import { render, waitFor } from '@testing-library/react-native'

// Jest's module-factory hoisting only allows out-of-scope variable access for
// names prefixed with `mock` (case-insensitive) — see babel-plugin-jest-hoist.
// Hence mockPush/mockShareState/mockAuthState rather than the more natural
// pushMock/shareState/authState.
const mockPush = jest.fn()
const mockRouter = { push: mockPush }
const mockShareState = {
  items: [] as unknown[],
  text: undefined as string | undefined,
  hasShare: false,
  // Mirrors the real native module: resetShareIntent() consumes the share,
  // so a subsequent read sees hasShareIntent: false. This is what makes a
  // remount-loses-state bug observable — a fresh instance re-reading a
  // mock that stayed `true` forever would just re-stage and mask the bug.
  reset: jest.fn(() => {
    mockShareState.hasShare = false
  })
}
const mockAuthState = { client: null as unknown }
const mockRoute = { segments: [] as string[] }

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useSegments: () => mockRoute.segments
}))
jest.mock('@/auth/useAuth', () => ({ useAuth: () => mockAuthState }))
jest.mock('@/share/useIncomingShare', () => ({ useIncomingShare: () => mockShareState }))

import { PendingShareProvider, usePendingShare } from './PendingShareProvider'

const Probe = () => {
  const { items } = usePendingShare()
  return <Text>count:{items.length}</Text>
}

beforeEach(() => {
  mockPush.mockReset()
  mockShareState.items = []
  mockShareState.text = undefined
  mockShareState.hasShare = false
  mockAuthState.client = null
  mockRoute.segments = ['(auth)', 'welcome']
})

test('does not navigate while unauthenticated, then navigates after login', async () => {
  mockShareState.items = [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }]
  mockShareState.hasShare = true
  const { rerender, getByText } = render(
    <PendingShareProvider>
      <Probe />
    </PendingShareProvider>
  )
  await waitFor(() => expect(getByText('count:1')).toBeTruthy())
  expect(mockPush).not.toHaveBeenCalled() // no client yet

  mockAuthState.client = {} // "login" happened
  mockRoute.segments = ['(drive)', 'files']
  rerender(
    <PendingShareProvider>
      <Probe />
    </PendingShareProvider>
  )
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/import'))
})

const renderProvider = () =>
  render(
    <PendingShareProvider>
      <Probe />
    </PendingShareProvider>
  )

test('waits for the auth screens to be gone after login before opening the picker', async () => {
  mockShareState.items = [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }]
  mockShareState.hasShare = true
  const { rerender, getByText } = renderProvider()
  await waitFor(() => expect(getByText('count:1')).toBeTruthy())

  mockAuthState.client = {} // signed in, the auth screens still redirect to the drive
  rerender(
    <PendingShareProvider>
      <Probe />
    </PendingShareProvider>
  )
  expect(mockPush).not.toHaveBeenCalled()

  mockRoute.segments = ['(drive)', 'files']
  rerender(
    <PendingShareProvider>
      <Probe />
    </PendingShareProvider>
  )
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
  expect(mockPush).toHaveBeenCalledWith('/import')
})

test('opens the picker for each later share, not again while it is already open', async () => {
  mockAuthState.client = {}
  mockRoute.segments = ['(drive)', 'files']
  mockShareState.items = [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }]
  mockShareState.hasShare = true
  const { rerender } = renderProvider()
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))

  mockRoute.segments = ['import']
  mockShareState.items = [{ uri: 'file:///b.jpg', name: 'b.jpg', mimeType: 'image/jpeg' }]
  mockShareState.hasShare = true
  rerender(
    <PendingShareProvider>
      <Probe />
    </PendingShareProvider>
  )
  expect(mockPush).toHaveBeenCalledTimes(1)

  mockRoute.segments = ['(drive)', 'files']
  mockShareState.items = [{ uri: 'file:///c.jpg', name: 'c.jpg', mimeType: 'image/jpeg' }]
  mockShareState.hasShare = true
  rerender(
    <PendingShareProvider>
      <Probe />
    </PendingShareProvider>
  )
  await new Promise(r => setTimeout(r, 50))
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(2))
})
