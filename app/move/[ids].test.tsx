import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ ids: 'a,b' })
}))

const mockMoveEntry = jest.fn()
jest.mock('@/files/moveEntry', () => ({
  moveEntry: (...args: unknown[]) => mockMoveEntry(...args)
}))

const mockUseQuery = jest.fn()

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({}),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
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

import MoveRoute from './[ids]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

const setupQueries = ({
  firstEntry,
  folderName = 'Work'
}: {
  firstEntry?: { _id: string; name: string; type: 'file' | 'directory'; dir_id: string } | null
  folderName?: string
} = {}): void => {
  const sequence = [
    // 1st useQuery: first-entry lookup (fileByIdQuery(a))
    {
      data:
        firstEntry === undefined
          ? { _id: 'a', name: 'Report.pdf', type: 'file', dir_id: 'src' }
          : firstEntry,
      fetchStatus: 'loaded',
      fetch: jest.fn()
    },
    // 2nd: FolderPicker's fileByIdQuery for the current folder doc
    {
      data: { _id: 'src', name: folderName, type: 'directory', path: '/' + folderName },
      fetchStatus: 'loaded',
      fetch: jest.fn()
    },
    // 3rd: subfolders
    { data: [], fetchStatus: 'loaded', fetch: jest.fn() },
    // 4th: files
    { data: [], fetchStatus: 'loaded', fetch: jest.fn() }
  ]
  let i = 0
  mockUseQuery.mockImplementation(() => sequence[Math.min(i++, sequence.length - 1)])
}

describe('MoveRoute', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockReplace.mockReset()
    mockMoveEntry.mockReset()
    mockUseQuery.mockReset()
  })

  it('renders the folder picker once the source folder is known', () => {
    setupQueries()
    render(wrap(<MoveRoute />))
    expect(screen.getByText('Work')).toBeOnTheScreen()
  })

  it('renders a loading state until the first entry is known', () => {
    mockUseQuery.mockReturnValue({ data: undefined, fetchStatus: 'loading', fetch: jest.fn() })
    render(wrap(<MoveRoute />))
    expect(screen.queryByText('Work')).toBeNull()
  })

  it('shows an error state when the first entry resolves to null', () => {
    mockUseQuery.mockReturnValue({ data: null, fetchStatus: 'loaded', fetch: jest.fn() })
    render(wrap(<MoveRoute />))
    expect(screen.getByText('drive.preview.loadFailed')).toBeOnTheScreen()
  })

  it('calls moveEntry sequentially for each id on confirm', async () => {
    setupQueries()
    mockMoveEntry.mockResolvedValue({ moved: { _id: 'a', dir_id: 'src' }, deleted: null })
    render(wrap(<MoveRoute />))
    fireEvent.press(screen.getByText('drive.move.action'))
    await waitFor(() => {
      expect(mockMoveEntry).toHaveBeenCalledTimes(2)
    })
    const firstCallEntryId = (mockMoveEntry.mock.calls[0][1] as { _id: string })._id
    const secondCallEntryId = (mockMoveEntry.mock.calls[1][1] as { _id: string })._id
    expect([firstCallEntryId, secondCallEntryId]).toEqual(['a', 'b'])
  })

  it('shows error snackbar when moveEntry rejects, keeps modal open', async () => {
    setupQueries()
    mockMoveEntry.mockRejectedValue(new Error('boom'))
    render(wrap(<MoveRoute />))
    fireEvent.press(screen.getByText('drive.move.action'))
    await waitFor(() => {
      expect(screen.getByText('drive.move.errorGeneric')).toBeOnTheScreen()
    })
    expect(mockBack).not.toHaveBeenCalled()
  })
})
