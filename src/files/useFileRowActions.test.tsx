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

const mockRenameEntry = jest.fn()
jest.mock('./renameEntry', () => ({
  renameEntry: (...args: unknown[]) => mockRenameEntry(...args)
}))
jest.mock('./optimisticFiles', () => ({ optimisticFiles: () => jest.fn() }))

const mockOpenFileFromList = jest.fn().mockResolvedValue(undefined)
jest.mock('@/files/openDriveFile', () => ({
  openFileFromList: (...args: unknown[]) => mockOpenFileFromList(...args)
}))

const mockDownloadFolder = jest.fn().mockResolvedValue(undefined)
jest.mock('@/files/download', () => ({
  downloadFolder: (...args: unknown[]) => mockDownloadFolder(...args),
  DownloadCancelledError: class extends Error {}
}))

import React from 'react'
import { Pressable } from 'react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import i18n from '@/i18n'

import { RenameDialog } from '@/ui/RenameDialog'
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

  it('downloads a folder as a zip', () => {
    setup().folderProps(folder).onDownload?.({ _id: 'd1', name: 'Dossier' })
    expect(mockDownloadFolder).toHaveBeenCalledWith(mockClient, { _id: 'd1', name: 'Dossier' })
  })

  it('offers no zip inside a shared drive', () => {
    expect(setup({ driveId: 'drive-1' }).folderProps(folder).onDownload).toBeUndefined()
  })

  it('opens the share screen on the document alone outside a drive', () => {
    setup().fileProps(file).onShare?.(file)
    expect(mockPush).toHaveBeenCalledWith('/share/f1')
  })

  it('carries the drive to the share screen for a document inside one', () => {
    setup({ driveId: 'drive-1' }).fileProps(file).onShare?.(file)
    expect(mockPush).toHaveBeenCalledWith('/share/f1?driveId=drive-1')
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

describe('renaming from a list', () => {
  const Harness = () => {
    const actions = useFileRowActions({ screen: 'Test' })
    return (
      <PaperProvider>
        {actions.dialogs}
        <Pressable testID="open-rename" onPress={() => actions.fileProps(file).onRename?.()} />
      </PaperProvider>
    )
  }

  const submit = async (): Promise<void> => {
    render(<Harness />)
    fireEvent.press(screen.getByTestId('open-rename'))
    fireEvent.changeText(await screen.findByTestId('rename-name-input'), 'taken.pdf')
    await act(async () => {
      fireEvent.press(screen.getByTestId('rename-submit'))
    })
  }

  it('keeps the dialog open with the conflict message when the name is taken', async () => {
    const conflict = new Error('conflict')
    conflict.name = 'RenameConflictError'
    mockRenameEntry.mockRejectedValueOnce(conflict)
    await submit()
    expect(screen.getByText('Un élément avec ce nom existe déjà.')).toBeOnTheScreen()
    expect(screen.UNSAFE_getByType(RenameDialog).props.visible).toBe(true)
  })

  it('keeps the dialog open with the generic message on any other failure', async () => {
    mockRenameEntry.mockRejectedValueOnce(new Error('boom'))
    await submit()
    expect(screen.getByText(i18n.t('drive.rename.errorGeneric'))).toBeOnTheScreen()
    expect(screen.UNSAFE_getByType(RenameDialog).props.visible).toBe(true)
  })

  it('closes the dialog once the rename went through', async () => {
    mockRenameEntry.mockResolvedValueOnce(undefined)
    await submit()
    expect(screen.UNSAFE_getByType(RenameDialog).props.visible).toBe(false)
  })
})
