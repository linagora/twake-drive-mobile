import React from 'react'
import { ActivityIndicator } from 'react-native-paper'
import { Provider as PaperProvider } from 'react-native-paper'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: () => true
  }),
  useLocalSearchParams: () => ({ fileId: 'f1' })
}))

const mockUseQuery = jest.fn()

const mockClient = {
  collection: jest.fn(),
  getStackClient: () => ({ uri: 'https://example.twake.linagora.com' })
}

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => mockClient,
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  Q: () => ({ getById: () => ({}) })
}))

const mockPin = jest.fn()
const mockUnpin = jest.fn()

jest.mock('@/offline/useOfflineActions', () => ({
  useOfflineActions: () => ({ pin: mockPin, unpin: mockUnpin })
}))

jest.mock('@/offline/useOfflineState', () => ({ useOfflineState: () => undefined }))
const mockOpenEditor = jest.fn()
jest.mock('@/viewer/useWebEditor', () => ({ useWebEditor: () => mockOpenEditor }))
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))
jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => ({ name: 'Quentin V', initials: 'QV', loading: false })
}))

jest.mock('@/files/openFile', () => ({ openFileNatively: jest.fn() }))
jest.mock('@/files/shortcuts', () => ({ fetchShortcutUrl: jest.fn() }))
jest.mock('@/files/renameEntry', () => ({ renameEntry: jest.fn() }))
const mockRevert = jest.fn()
jest.mock('@/files/optimisticFiles', () => ({ optimisticFiles: jest.fn(() => mockRevert) }))
jest.mock('@/files/deleteFile', () => ({ softDeleteEntry: jest.fn() }))
jest.mock('@/offline/FileSystemRepo', () => ({
  FileSystemRepo: { localPath: (id: string) => `file://${id}` }
}))

import { renameEntry } from '@/files/renameEntry'
import { optimisticFiles } from '@/files/optimisticFiles'
import MetadataRoute from './[fileId]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

const defaultFileData = {
  _id: 'f1',
  name: 'rapport.pdf',
  type: 'file',
  size: 2_400_000,
  mime: 'application/pdf',
  updated_at: '2026-04-29T10:00:00.000Z',
  path: '/Drive/rapport.pdf',
  cozyMetadata: { createdBy: { account: 'me' } }
}

describe('MetadataRoute', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockPush.mockReset()
    mockReplace.mockReset()
    mockPin.mockReset()
    mockUnpin.mockReset()
    mockRevert.mockReset()
    ;(optimisticFiles as jest.Mock).mockClear()
    mockUseQuery.mockReturnValue({
      data: defaultFileData,
      fetchStatus: 'loaded',
      fetch: jest.fn()
    })
  })

  // The rename goes straight to the stack, which does not write to the local
  // replica: without this the list behind kept the old name until a sync.
  it('pushes the renamed doc to the store when renaming from the sheet', async () => {
    ;(renameEntry as jest.Mock).mockResolvedValue({ _id: 'f1', name: 'bilan.pdf' })
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('drive.fileMeta.rename'))
    fireEvent.changeText(screen.getByDisplayValue('rapport.pdf'), 'bilan.pdf')
    await act(async () => {
      fireEvent.press(screen.getByText('drive.rename.submit'))
    })
    expect(optimisticFiles).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ _id: 'f1', name: 'bilan.pdf' })
    ])
  })

  it('reverts the store update when the rename fails', async () => {
    ;(renameEntry as jest.Mock).mockRejectedValue(new Error('boom'))
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('drive.fileMeta.rename'))
    fireEvent.changeText(screen.getByDisplayValue('rapport.pdf'), 'bilan.pdf')
    await act(async () => {
      fireEvent.press(screen.getByText('drive.rename.submit'))
    })
    expect(mockRevert).toHaveBeenCalled()
  })

  it('renders the file name', () => {
    render(wrap(<MetadataRoute />))
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
  })

  it('calls router.replace with /share/<fileId> when Share is tapped', () => {
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('drive.fileMeta.share'))
    expect(mockReplace).toHaveBeenCalledWith('/share/f1')
  })

  it('calls router.replace with /move/<fileId> when Move is tapped', () => {
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('drive.fileMeta.move'))
    expect(mockReplace).toHaveBeenCalledWith('/move/f1')
  })

  it('calls router.back when Close is tapped', () => {
    render(wrap(<MetadataRoute />))
    fireEvent.press(screen.getByText('common.close'))
    expect(mockBack).toHaveBeenCalled()
  })

  it('renders a loading state while the file query is loading', () => {
    mockUseQuery.mockReturnValueOnce({ data: undefined, fetchStatus: 'loading', fetch: jest.fn() })
    render(wrap(<MetadataRoute />))
    expect(screen.queryByText('rapport.pdf')).toBeNull()
    expect(screen.UNSAFE_getAllByType(ActivityIndicator)).toBeTruthy()
  })

  it('renders an error state when the file lookup returns no data', () => {
    mockUseQuery.mockReturnValueOnce({ data: null, fetchStatus: 'loaded', fetch: jest.fn() })
    render(wrap(<MetadataRoute />))
    expect(screen.queryByText('rapport.pdf')).toBeNull()
    expect(screen.getByText('drive.preview.loadFailed')).toBeOnTheScreen()
  })

  it('calls pin when the offline switch is toggled on', () => {
    render(wrap(<MetadataRoute />))
    const sw = screen.getByRole('switch')
    fireEvent(sw, 'valueChange', true)
    expect(mockPin).toHaveBeenCalledWith({ _id: 'f1', name: 'rapport.pdf', size: 2_400_000 })
  })
})
