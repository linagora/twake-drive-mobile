import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ fileId: 'f1' })
}))

let mockQueryCallIndex = 0 // eslint-disable-line prefer-const
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null,
  useQuery: jest.fn().mockImplementation(() => {
    // First call is fileByIdQuery → return the file. Subsequent calls
    // (reachableContactsQuery, etc.) → return an empty array shape.
    const i = mockQueryCallIndex++
    if (i === 0) {
      return {
        data: { _id: 'f1', name: 'rapport.pdf', type: 'file' },
        fetchStatus: 'loaded'
      }
    }
    return { data: [], fetchStatus: 'loaded' }
  }),
  Q: () => ({
    getById: () => ({}),
    where: () => ({ partialIndex: () => ({ indexFields: () => ({ limitBy: () => ({}) }) }) })
  })
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

jest.mock('@/client/useFlag', () => ({ useFlag: () => true }))
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))
jest.mock('@/sharing/SharingProvider', () => ({
  useFileSharing: () => ({ loaded: true, entry: undefined }),
  useRefreshSharings: () => jest.fn()
}))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }))

import ShareRoute from './[fileId]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('ShareRoute', () => {
  beforeEach(() => {
    mockQueryCallIndex = 0
  })

  it('renders the file name', () => {
    render(wrap(<ShareRoute />))
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
  })
})
