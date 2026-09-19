import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'
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

jest.mock('@/ui/FileRow', () => {
  const react = require('react')
  const { Text } = require('react-native')
  return {
    FileRow: (props: { file: { name: string } }) => react.createElement(Text, null, props.file.name)
  }
})
jest.mock('@/ui/FolderRow', () => {
  const react = require('react')
  const { Text } = require('react-native')
  return {
    FolderRow: (props: { folder: { name: string } }) =>
      react.createElement(Text, null, props.folder.name)
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

  describe('filtering', () => {
    const trashed = [
      { _id: 'd1', _type: 'io.cozy.files', type: 'directory', name: 'Rapports 2026' },
      { _id: 'f1', _type: 'io.cozy.files', type: 'file', name: 'budget après revue.xlsx' }
    ]

    const byKind = () => {
      const folders = queryResult([trashed[0]])
      const files = queryResult([trashed[1]])
      mockUseQuery.mockImplementation((_def: unknown, opts: { as: string }) =>
        opts.as.endsWith('folders') ? folders : files
      )
    }

    it('narrows the list to what the user types, accents aside', () => {
      byKind()
      render(wrap(<TrashScreen />))
      expect(screen.getByText('Rapports 2026')).toBeOnTheScreen()

      fireEvent.changeText(screen.getByTestId('trash-filter-input'), 'apres')

      expect(screen.queryByText('Rapports 2026')).toBeNull()
      expect(screen.getByText('budget après revue.xlsx')).toBeOnTheScreen()
    })

    it('says nothing matches rather than claiming the trash is empty', () => {
      byKind()
      render(wrap(<TrashScreen />))

      fireEvent.changeText(screen.getByTestId('trash-filter-input'), 'zzz')

      expect(screen.getByText(i18n.t('drive.trashActions.filterEmpty'))).toBeOnTheScreen()
    })
  })
})
