const mockOpenEditor = jest.fn()
jest.mock('@/viewer/useWebEditor', () => ({ useWebEditor: () => mockOpenEditor }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

const mockClient = { query: jest.fn() }
jest.mock('cozy-client', () => ({ useClient: () => mockClient }))

let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))

const mockPin = jest.fn()
const mockUnpin = jest.fn()
const mockPinFolder = jest.fn()
const mockUnpinFolder = jest.fn()
jest.mock('@/offline/useOfflineActions', () => ({
  useOfflineActions: () => ({
    pin: mockPin,
    unpin: mockUnpin,
    pinFolder: mockPinFolder,
    unpinFolder: mockUnpinFolder,
    pendingConfirmation: null,
    confirmPending: jest.fn(),
    cancelPending: jest.fn()
  })
}))

const mockGet = jest.fn()
const mockGetFolder = jest.fn()
jest.mock('@/offline/OfflineFilesStore', () => ({
  OfflineFilesStore: {
    get: (id: string) => mockGet(id),
    getFolder: (id: string) => mockGetFolder(id)
  }
}))

const mockOpenFileFromList = jest.fn().mockResolvedValue(undefined)
jest.mock('@/files/openFromList', () => ({
  openFileFromList: (...args: unknown[]) => mockOpenFileFromList(...args)
}))

import { renderHook } from '@testing-library/react-native'

import { useFileRowActions } from './useFileRowActions'
import { FileQueryResult } from '@/client/queries'

const file = { _id: 'f1', name: 'rapport.pdf', type: 'file' } as unknown as FileQueryResult
const folder = { _id: 'd1', name: 'Dossier', type: 'directory' } as unknown as FileQueryResult

const setup = (options = {}) =>
  renderHook(() => useFileRowActions({ screen: 'Test', ...options })).result.current

describe('useFileRowActions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnline = true
  })

  it('opens a file through the list opener', () => {
    setup().fileProps(file).onPress(file)
    expect(mockOpenFileFromList).toHaveBeenCalledWith(
      mockClient,
      expect.anything(),
      file,
      undefined,
      mockOpenEditor
    )
  })

  it('opens a file of a shared drive through that drive', () => {
    setup({ driveId: 'drive-1' }).fileProps(file).onPress(file)
    expect(mockOpenFileFromList).toHaveBeenCalledWith(
      mockClient,
      expect.anything(),
      file,
      'drive-1',
      mockOpenEditor
    )
  })

  it('pins a file that is not kept offline yet', () => {
    mockGet.mockReturnValue(undefined)
    setup().fileProps(file).onTogglePin?.({ _id: 'f1', name: 'rapport.pdf', size: 12 })
    expect(mockPin).toHaveBeenCalledWith({ _id: 'f1', name: 'rapport.pdf', size: 12 })
  })

  it('unpins a file that was pinned on its own', () => {
    mockGet.mockReturnValue({ isDirectPin: true })
    setup().fileProps(file).onTogglePin?.({ _id: 'f1', name: 'rapport.pdf' })
    expect(mockUnpin).toHaveBeenCalledWith('f1')
  })

  it('takes a folder offline', () => {
    mockGetFolder.mockReturnValue(undefined)
    setup().folderProps(folder).onTogglePin?.({ _id: 'd1', name: 'Dossier' })
    expect(mockPinFolder).toHaveBeenCalledWith({ _id: 'd1', name: 'Dossier' })
  })

  it('refuses to open the share screen offline', () => {
    mockOnline = false
    setup().fileProps(file).onShare?.(file)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('leaves out the actions a screen does not offer', () => {
    const actions = setup({ can: { rename: false, delete: false } })
    expect(actions.fileProps(file).onRename).toBeUndefined()
    expect(actions.fileProps(file).onDelete).toBeUndefined()
    expect(actions.folderProps(folder).onMove).toBeDefined()
  })
})
