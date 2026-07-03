import React from 'react'
import { Text } from 'react-native'
import { render, waitFor } from '@testing-library/react-native'

// Jest's module-factory hoisting only allows out-of-scope variable access for
// names prefixed with `mock` (case-insensitive) — see babel-plugin-jest-hoist.
// Hence mockPush/mockShareState/mockAuthState rather than the more natural
// pushMock/shareState/authState.
const mockPush = jest.fn()
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

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/auth/useAuth', () => ({ useAuth: () => mockAuthState }))
jest.mock('@/share/useIncomingShare', () => ({ useIncomingShare: () => mockShareState }))
// CozyProvider itself isn't under test here — PendingShareProvider's
// *position relative to it* is. A passthrough keeps this test from needing
// a real cozy-client instance while still exercising the real conditional
// that mounts/unmounts it.
jest.mock('cozy-client', () => ({
  __esModule: true,
  CozyProvider: ({ children }: { children: React.ReactNode }) => children
}))

import { AppProviderTree } from './_AppProviderTree'
import { usePendingShare } from '@/share/PendingShareProvider'

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
})

// Regression test for a bug where PendingShareProvider sat INSIDE
// app/_layout.tsx's `client ? <CozyProvider>{content}</CozyProvider> : content`
// conditional. When `client` transitioned null -> object (every login, and
// even cold start with a saved session), the element type at that return
// position changed, so React unmounted/remounted the whole subtree —
// wiping PendingShareProvider's `pending` state before the share could be
// resumed after login. The fix hoists PendingShareProvider to wrap the
// ENTIRE conditional instead, so its own position never changes.
//
// Unlike a test that renders PendingShareProvider directly at the root (and
// only varies a *child's* element type across rerenders), this test renders
// the REAL AppProviderTree — the actual wiring app/_layout.tsx uses — as the
// stable outer element. AppProviderTree itself decides, internally, whether
// PendingShareProvider sits outside or inside the `client` conditional. If
// someone re-nests it back inside the conditional, AppProviderTree's OWN
// returned tree changes shape at the root when `client` flips, React
// remounts PendingShareProvider, and this test goes red — which a test that
// only exercises PendingShareProvider in isolation cannot detect.
test('keeps staged share across the auth transition through the real AppProviderTree wiring (regression)', async () => {
  mockShareState.items = [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }]
  mockShareState.hasShare = true

  const { rerender, getByText } = render(
    <AppProviderTree>
      <Probe />
    </AppProviderTree>
  )
  await waitFor(() => expect(getByText('count:1')).toBeTruthy())
  expect(mockPush).not.toHaveBeenCalled() // no client yet

  mockAuthState.client = {} // "login" happened
  rerender(
    <AppProviderTree>
      <Probe />
    </AppProviderTree>
  )

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/import'))
})
