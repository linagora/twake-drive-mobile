import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { render, screen } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: mockPush, canGoBack: () => true }),
  useLocalSearchParams: () => ({ ids: 'a,b', path: undefined })
}))

// Mock the layout context — provides everything the picker route needs
const mockOnConfirm = jest.fn()
const mockOnCancel = jest.fn()
const mockRetry = jest.fn()

jest.mock('./_layout', () => ({
  useMoveContext: () => ({
    idList: ['a', 'b'],
    firstDoc: { _id: 'a', name: 'Report.pdf', type: 'file', dir_id: 'src' },
    isLoading: false,
    hasError: false,
    isBusy: false,
    onConfirm: mockOnConfirm,
    onCancel: mockOnCancel,
    retry: mockRetry
  })
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({}),
  useQuery: jest
    .fn()
    .mockImplementation(() => ({ data: undefined, fetchStatus: 'loaded', fetch: jest.fn() })),
  Q: () => ({
    getById: () => ({}),
    where: () => ({
      partialIndex: () => ({
        indexFields: () => ({ sortBy: () => ({ limitBy: () => ({}) }) })
      })
    })
  })
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

jest.mock('@/files/createFolder', () => ({ createFolder: jest.fn() }))

import MoveScreen from './[[...path]]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('MoveScreen', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockPush.mockReset()
    mockOnConfirm.mockReset()
    mockOnCancel.mockReset()
  })

  it('renders without crashing at root', () => {
    render(wrap(<MoveScreen />))
    // The picker should be mounted; the AppBar back arrow should be hidden
    expect(screen.queryByLabelText('common.back')).toBeNull()
  })
})
