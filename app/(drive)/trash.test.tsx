import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { render, screen } from '@testing-library/react-native'
import { I18nextProvider } from 'react-i18next'

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void) => cb()
}))

jest.mock('@/auth/useAuth', () => ({ useAuth: () => ({ logout: jest.fn() }) }))
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))

const mockUseQuery = jest.fn()

jest.mock('cozy-client', () => {
  const makeQDef = (): Record<string, unknown> => {
    const self: Record<string, unknown> = {}
    const chain = (): typeof self => self
    self.where = chain
    self.partialIndex = chain
    self.indexFields = chain
    self.sortBy = chain
    self.limitBy = chain
    self.select = chain
    self.include = chain
    self.getById = chain
    self.getByIds = chain
    return self
  }
  return {
    __esModule: true,
    useClient: () => ({}),
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    Q: () => makeQDef()
  }
})

import i18n from '@/i18n'
import TrashScreen from './trash'

const wrap = (ui: React.ReactElement) => (
  <I18nextProvider i18n={i18n}>
    <PaperProvider>{ui}</PaperProvider>
  </I18nextProvider>
)

const queryResult = (data: unknown[], fetchStatus = 'loaded') => ({
  data,
  fetchStatus,
  lastError: null,
  fetch: jest.fn().mockResolvedValue(undefined),
  fetchMore: jest.fn()
})

describe('TrashScreen', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
  })

  it('shows the loading state on the very first load', () => {
    mockUseQuery.mockReturnValue(queryResult([], 'loading'))
    render(wrap(<TrashScreen />))
    expect(screen.queryByText('Corbeille vide')).toBeNull()
  })

  // Emptying the trash leaves a list that is empty and refetching: swapping it
  // back to the loading state made the empty message blink in and out.
  it('keeps the empty state during a refetch once it has loaded once', () => {
    mockUseQuery.mockReturnValue(queryResult([], 'loaded'))
    const { rerender } = render(wrap(<TrashScreen />))
    expect(screen.getByText('Corbeille vide')).toBeOnTheScreen()

    mockUseQuery.mockReturnValue(queryResult([], 'loading'))
    rerender(wrap(<TrashScreen />))
    expect(screen.getByText('Corbeille vide')).toBeOnTheScreen()
  })
})
