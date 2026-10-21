import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

// Mock expo-router: Tabs.Screen renders its title only when visible (href !== null)
jest.mock('expo-router', () => {
  const { Text, View } = require('react-native')

  function MockTabsScreen({
    name,
    options
  }: {
    name: string
    options?: {
      title?: string
      href?: null
      tabBarIcon?: unknown
      tabBarBadge?: string | number
    }
  }) {
    if (options?.href === null || !options?.title) return null
    return (
      <>
        <Text testID="tab-label">{options.title}</Text>
        {options.tabBarBadge === undefined ? null : (
          <Text testID={`tab-badge-${name}`}>{options.tabBarBadge}</Text>
        )}
      </>
    )
  }

  // One scene, drawn through screenLayout the way the navigator draws each tab.
  function MockTabs({
    children,
    screenLayout
  }: {
    children: React.ReactNode
    screenLayout?: (props: { children: React.ReactElement }) => React.ReactElement
  }) {
    const scene = <Text testID="tab-scene">scene</Text>
    return (
      <View testID="tabs-container">
        {children}
        {screenLayout ? screenLayout({ children: scene }) : scene}
      </View>
    )
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

let mockNewSharesCount = 0
jest.mock('@/sharing/newShares', () => ({
  ...jest.requireActual('@/sharing/newShares'),
  useNewSharesCount: () => mockNewSharesCount
}))

import DriveLayout from './_layout'
import i18n from '@/i18n'
import { SnackbarHost, useNotify } from '@/ui/SnackbarHost'

const wrap = (ui: React.ReactElement) => (
  <PaperProvider>
    <SnackbarHost>{ui}</SnackbarHost>
  </PaperProvider>
)

const NotifyOnMount = () => {
  const notify = useNotify()
  React.useEffect(() => notify('File moved'), [notify])
  return null
}

describe('DriveLayout — bottom tabs', () => {
  beforeEach(() => {
    mockAuthStatus = 'authenticated'
    mockClient = {}
    mockNewSharesCount = 0
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

  // A sheet that confirms and closes lands on a tab: the tab draws the message.
  it('shows a confirmation sent from a sheet in the tab scene', () => {
    render(
      wrap(
        <>
          <DriveLayout />
          <NotifyOnMount />
        </>
      )
    )
    expect(screen.getByTestId('tab-scene')).toBeOnTheScreen()
    expect(screen.getByText('File moved')).toBeOnTheScreen()
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

  it('shows no badge on the shares tab when nothing new was shared', () => {
    render(wrap(<DriveLayout />))
    expect(screen.queryByTestId('tab-badge-shared')).toBeNull()
  })

  it('badges the shares tab with the number of new shares', () => {
    mockNewSharesCount = 3
    render(wrap(<DriveLayout />))
    expect(screen.getByTestId('tab-badge-shared').props.children).toBe(3)
    expect(screen.queryByTestId('tab-badge-files')).toBeNull()
  })

  it('caps the badge at 99+ like the web', () => {
    mockNewSharesCount = 120
    render(wrap(<DriveLayout />))
    expect(screen.getByTestId('tab-badge-shared').props.children).toBe('99+')
  })
})
