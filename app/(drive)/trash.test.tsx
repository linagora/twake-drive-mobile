import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { I18nextProvider } from 'react-i18next'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
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
    FileRow: (props: { file: { name: string }; onPress: (file: unknown) => void }) =>
      react.createElement(Text, { onPress: () => props.onPress(props.file) }, props.file.name)
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

// `lastFetch` is what cozy-client stamps once a query has answered, and what
// tells a refetch apart from the first load.
const queryResult = (data: unknown[], fetchStatus = 'loaded', lastFetch: number | null = 1) => ({
  data,
  fetchStatus,
  lastFetch,
  lastError: null,
  fetch: jest.fn().mockResolvedValue(undefined),
  fetchMore: jest.fn()
})

describe('TrashScreen', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
  })

  it('shows the loading state on the very first load', () => {
    mockUseQuery.mockReturnValue(queryResult([], 'loading', null))
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

  it('opens the read-only preview of a tapped file', () => {
    mockUseQuery.mockImplementation((def: unknown, opts: { as: string }) =>
      queryResult(opts.as.endsWith('/files') ? [{ _id: 'f1', name: 'note.txt', type: 'file' }] : [])
    )
    render(wrap(<TrashScreen />))
    fireEvent.press(screen.getByText('note.txt'))
    expect(mockPush).toHaveBeenCalledWith('/preview/f1')
  })

  // The index hands names back in byte order, which puts "Été" after "Zoo".
  it('lists folders first, then names as a person reads them', () => {
    mockUseQuery.mockImplementation((def: unknown, opts: { as: string }) =>
      queryResult(
        opts.as.endsWith('/files')
          ? [
              { _id: 'f1', name: 'Zoo.txt', type: 'file' },
              { _id: 'f2', name: 'abc.txt', type: 'file' },
              { _id: 'f3', name: 'Été.txt', type: 'file' }
            ]
          : [{ _id: 'd1', name: 'Photos', type: 'directory' }]
      )
    )
    render(wrap(<TrashScreen />))
    expect(
      screen.getAllByText(/^(Photos|Zoo\.txt|abc\.txt|Été\.txt)$/).map(n => n.props.children)
    ).toEqual(['Photos', 'abc.txt', 'Été.txt', 'Zoo.txt'])
  })
})
