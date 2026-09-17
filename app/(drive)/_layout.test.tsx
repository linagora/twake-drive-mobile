import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

// Mock expo-router: Tabs.Screen renders its title only when visible (href !== null)
jest.mock('expo-router', () => {
  const { Text, View } = require('react-native')

  function MockTabsScreen({
    options
  }: {
    name: string
    options?: { title?: string; href?: null; tabBarIcon?: unknown }
  }) {
    if (options?.href === null || !options?.title) return null
    return <Text testID="tab-label">{options.title}</Text>
  }

  function MockTabs({ children }: { children: React.ReactNode }) {
    return <View testID="tabs-container">{children}</View>
  }
  MockTabs.Screen = MockTabsScreen

  function MockRedirect({ href }: { href: string }) {
    return <Text testID="redirect">{href}</Text>
  }

  return {
    __esModule: true,
    Tabs: MockTabs,
    Redirect: MockRedirect,
    useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({})
  }
})

let mockClient: unknown = {}
jest.mock('cozy-client', () => ({
  __esModule: true,
  Q: () => ({ getById: () => ({}) }),
  useClient: () => mockClient,
  useQuery: () => ({ data: null, fetchStatus: 'loaded' })
}))

jest.mock('@/ui/OfflineBanner', () => ({
  OfflineBanner: () => null
}))

let mockAuthStatus = 'authenticated'
jest.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ status: mockAuthStatus })
}))

jest.mock('@/pouchdb/useForegroundSync', () => ({
  useForegroundSync: () => undefined
}))

jest.mock('@/offline/initOffline', () => ({
  initOfflineSubsystem: jest.fn()
}))

import DriveLayout from './_layout'
import i18n from '@/i18n'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('DriveLayout — bottom tabs', () => {
  beforeEach(() => {
    mockAuthStatus = 'authenticated'
    mockClient = {}
  })

  it('redirects to the auth stack when there is no client (e.g. after logout)', () => {
    // A logged-out client would otherwise reach useQuery with a null client and
    // crash ("Cannot read property 'getState' of null"); the guard redirects first.
    mockClient = null
    mockAuthStatus = 'unauthenticated'
    render(wrap(<DriveLayout />))
    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/welcome')
    expect(screen.queryByTestId('tab-label')).toBeNull()
  })

  // The client is briefly null while it is rebuilt — a dev resync, a
  // reconnection — and redirecting on that dropped the user on the welcome
  // screen with a valid session.
  it('waits instead of redirecting while the client is being rebuilt', () => {
    mockClient = null
    mockAuthStatus = 'loading'
    render(wrap(<DriveLayout />))
    expect(screen.queryByTestId('redirect')).toBeNull()
    expect(screen.queryByTestId('tab-label')).toBeNull()
  })

  it('renders exactly 5 visible tab labels', () => {
    render(wrap(<DriveLayout />))
    const tabs = screen.getAllByTestId('tab-label')
    expect(tabs).toHaveLength(5)
  })

  it('has the correct 5 tab labels in order', () => {
    render(wrap(<DriveLayout />))
    const tabs = screen.getAllByTestId('tab-label')
    const labels = tabs.map(t => t.props.children as string)
    expect(labels).toEqual([
      i18n.t('drive.myDrive'),
      i18n.t('drive.favorites'),
      i18n.t('drive.recent'),
      i18n.t('drive.shares'),
      i18n.t('drive.trash')
    ])
  })
})
