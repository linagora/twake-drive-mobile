import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { act, render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  Redirect: () => null
}))

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, bottom: 0, left: 0, right: 0 }
  const context = require('react').createContext(insets)
  return {
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: context,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    initialWindowMetrics: { insets, frame: { x: 0, y: 0, width: 390, height: 844 } }
  }
})

jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => ({ initials: 'QV', loading: false })
}))

jest.mock('cozy-client', () => ({ __esModule: true, useClient: () => null }))

jest.mock('@/offline/keepOfflineFlag', () => ({ isKeepOfflineEnabled: () => true }))

jest.mock('@/offline/Downloader', () => ({ Downloader: { enqueue: jest.fn() } }))

jest.mock('@/offline/reconcileFolderPins', () => ({
  reconcileFolderPins: jest.fn().mockResolvedValue(0)
}))

let mockNotifyAll: (() => void) | undefined
const mockGetAll = jest.fn()
const mockGetAllFolders = jest.fn()

jest.mock('@/offline/OfflineFilesStore', () => ({
  OfflineFilesStore: {
    getAll: () => mockGetAll(),
    getAllFolders: () => mockGetAllFolders(),
    subscribeAll: (cb: () => void) => {
      mockNotifyAll = cb
      return () => {
        mockNotifyAll = undefined
      }
    },
    unpin: jest.fn(),
    unpinFolder: jest.fn(),
    purge: jest.fn(),
    update: jest.fn()
  }
}))

jest.mock('@/offline/offlineSettings', () => ({
  OfflineSettingsAPI: {
    get: () => ({ wifiOnly: false }),
    set: jest.fn(),
    subscribe: () => () => undefined,
    status: { get: () => ({ diskFull: false }), subscribe: () => () => undefined }
  }
}))

// A file-system walk on mount is what this screen must no longer do.
const mockGetInfoAsync = jest.fn()
const mockReadDirectoryAsync = jest.fn()
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn()
}))

import i18n from '@/i18n'
import { formatFileSize } from '@/utils/formatters'
import OfflineStorageScreen from './offline-storage'

const folderSummary = (count: number, bytes: number): string =>
  i18n.t('drive.offline.folderSummary', { count, size: formatFileSize(bytes) })

const show = (): ReturnType<typeof render> =>
  render(
    <PaperProvider>
      <OfflineStorageScreen />
    </PaperProvider>
  )

const file = (
  fileId: string,
  overrides: Partial<{
    size: number
    localBytes: number
    parentFolderPins: string[]
    state: string
  }> = {}
) => ({
  fileId,
  name: fileId,
  state: 'downloaded',
  rev: '1',
  md5sum: 'm',
  size: 100,
  localBytes: 100,
  localPath: `/p/${fileId}`,
  pinnedAt: 1,
  isDirectPin: true,
  parentFolderPins: [],
  ...overrides
})

describe('OfflineStorageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockGetAll.mockReturnValue([])
    mockGetAllFolders.mockReturnValue([])
  })
  afterEach(() => jest.useRealTimers())

  // Walking the directory meant one bridge round trip per pinned file, in
  // series, before anything could be painted.
  it('reads the size from the store instead of walking the file system', () => {
    mockGetAll.mockReturnValue([
      file('a', { localBytes: 1024 }),
      file('b', { localBytes: 2048 }),
      // Not downloaded yet: it takes no room on disk.
      file('c', { localBytes: undefined, state: 'pending' })
    ])

    show()

    expect(screen.getByText(formatFileSize(1024 + 2048))).toBeOnTheScreen()
    expect(mockReadDirectoryAsync).not.toHaveBeenCalled()
    expect(mockGetInfoAsync).not.toHaveBeenCalled()
  })

  // Every finished download woke this screen, and each wake re-read the whole
  // store, which is what kept the app busy long after it had opened.
  it('answers a burst of store changes with a single read', () => {
    show()
    mockGetAll.mockClear()
    mockGetAllFolders.mockClear()

    act(() => {
      for (let i = 0; i < 20; i++) mockNotifyAll?.()
    })

    expect(mockGetAll).not.toHaveBeenCalled()

    act(() => jest.advanceTimersByTime(300))

    expect(mockGetAll).toHaveBeenCalledTimes(1)
    expect(mockGetAllFolders).toHaveBeenCalledTimes(1)
  })

  it('counts a folder its children once, whatever the number of folders', () => {
    mockGetAllFolders.mockReturnValue([
      { dirId: 'dir-1', name: 'Reports', pinnedAt: 2 },
      { dirId: 'dir-2', name: 'Photos', pinnedAt: 1 }
    ])
    mockGetAll.mockReturnValue([
      file('a', { size: 500, parentFolderPins: ['dir-1'] }),
      file('b', { size: 300, parentFolderPins: ['dir-1'] }),
      file('c', { size: 700, parentFolderPins: ['dir-2'] })
    ])

    show()

    expect(screen.getByText(folderSummary(2, 800))).toBeOnTheScreen()
    expect(screen.getByText(folderSummary(1, 700))).toBeOnTheScreen()
  })
})
