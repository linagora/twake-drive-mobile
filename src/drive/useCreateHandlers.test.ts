import { renderHook } from '@testing-library/react-native'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

const mockClient = { getStackClient: () => ({ uri: 'https://alice.mycozy.cloud' }) }
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => mockClient
}))

let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({
  useIsOnline: () => mockOnline
}))

const mockOpenEditor = jest.fn()
jest.mock('@/viewer/useWebEditor', () => ({
  useWebEditor: () => mockOpenEditor
}))

const mockCreateFolder = jest.fn()
const mockCreateNote = jest.fn()
const mockCreateOffice = jest.fn()
const mockCreateExcalidraw = jest.fn()
const mockCreateShortcut = jest.fn()
jest.mock('@/files/createFolder', () => ({
  createFolder: (...args: unknown[]) => mockCreateFolder(...args)
}))
jest.mock('@/files/createCozyNote', () => ({
  createCozyNote: (...args: unknown[]) => mockCreateNote(...args)
}))
jest.mock('@/files/createOfficeFile', () => ({
  createOfficeFile: (...args: unknown[]) => mockCreateOffice(...args)
}))
jest.mock('@/files/createExcalidrawFile', () => ({
  createExcalidrawFile: (...args: unknown[]) => mockCreateExcalidraw(...args)
}))
jest.mock('@/files/createShortcut', () => ({
  createShortcut: (...args: unknown[]) => mockCreateShortcut(...args)
}))

const mockOptimisticFiles = jest.fn()
jest.mock('@/files/optimisticFiles', () => ({
  optimisticFiles: (...args: unknown[]) => mockOptimisticFiles(...args)
}))
jest.mock('@/files/optimisticCreated', () => ({ optimisticCreated: (doc: unknown) => doc }))
jest.mock('@/pouchdb/triggerReplication', () => ({ triggerPouchReplication: jest.fn() }))

const mockPickDocuments = jest.fn()
jest.mock('./pickDocuments', () => ({
  pickDocuments: (...args: unknown[]) => mockPickDocuments(...args)
}))
const mockUploadBatch = jest.fn()
jest.mock('@/share/uploadBatch', () => ({
  uploadBatch: (...args: unknown[]) => mockUploadBatch(...args)
}))

import { CreateHandlersDeps, useCreateHandlers } from './useCreateHandlers'

const handlers = (deps: Partial<CreateHandlersDeps> = {}) =>
  renderHook(() => useCreateHandlers({ dirId: 'd1', notify: jest.fn(), ...deps })).result.current

beforeEach(() => {
  mockOnline = true
  mockCreateFolder.mockReset().mockResolvedValue({ _id: 'new', name: 'Foo' })
  mockCreateNote.mockReset().mockResolvedValue({ _id: 'n1', name: 'Note' })
  mockCreateOffice.mockReset().mockResolvedValue({ _id: 'o1', name: 'Report.docx' })
  mockCreateExcalidraw.mockReset().mockResolvedValue({ _id: 'e1', name: 'Sketch.excalidraw' })
  mockCreateShortcut.mockReset().mockResolvedValue({ _id: 's1', name: 'Link.url' })
  mockOptimisticFiles.mockReset()
  mockPickDocuments.mockReset()
  mockUploadBatch.mockReset()
  mockOpenEditor.mockReset()
})

describe('useCreateHandlers on our own instance', () => {
  it('creates a folder with no drive scope', async () => {
    await handlers().createFolderNamed('Foo')
    expect(mockCreateFolder).toHaveBeenCalledWith(mockClient, 'Foo', 'd1', undefined)
  })

  it('adds an optimistic row so the list shows the folder before the sync', async () => {
    await handlers().createFolderNamed('Foo')
    expect(mockOptimisticFiles).toHaveBeenCalled()
  })

  it('does not report a failure when the optimistic row throws after the create', async () => {
    mockOptimisticFiles.mockImplementationOnce(() => {
      throw new Error('store failure')
    })
    await expect(handlers().createFolderNamed('Foo')).resolves.toBeUndefined()
  })

  it('does not report a failure when the screen callback throws after the create', async () => {
    const onCreated = jest.fn(() => {
      throw new Error('navigation failure')
    })
    await expect(handlers({ onCreated }).createFolderNamed('Foo')).resolves.toBeUndefined()
  })

  it('creates a note and opens it in the editor', async () => {
    await handlers().createNote()
    expect(mockCreateNote).toHaveBeenCalledWith(mockClient, 'd1', undefined)
    expect(mockOpenEditor).toHaveBeenCalledWith({ _id: 'n1', name: 'Note' })
  })

  it('creates an office file and opens it', async () => {
    await handlers().createOfficeNamed('text', 'Report')
    expect(mockCreateOffice).toHaveBeenCalledWith(mockClient, 'text', 'Report', 'd1', undefined)
    expect(mockOpenEditor).toHaveBeenCalled()
  })

  it('creates an excalidraw drawing without opening an editor', async () => {
    await handlers().createOfficeNamed('excalidraw', 'Sketch')
    expect(mockCreateExcalidraw).toHaveBeenCalledWith(mockClient, 'Sketch', 'd1', undefined)
    expect(mockOpenEditor).not.toHaveBeenCalled()
  })

  it('creates a shortcut', async () => {
    await handlers().createShortcutNamed('Link', 'https://example.org')
    expect(mockCreateShortcut).toHaveBeenCalledWith(mockClient, 'd1', 'Link', 'https://example.org')
  })
})

describe('useCreateHandlers uploadFiles', () => {
  const item = { uri: 'file:///cache/a.pdf', name: 'a.pdf', mimeType: 'application/pdf' }

  it('uploads the picked files into the folder and reports the outcome', async () => {
    const notify = jest.fn()
    mockPickDocuments.mockResolvedValue([item])
    mockUploadBatch.mockResolvedValue({
      results: [{ item, ok: true, file: { _id: 'f1', name: 'a.pdf' } }],
      succeeded: 1,
      failed: 0
    })
    await handlers({ notify }).uploadFiles()
    expect(mockUploadBatch).toHaveBeenCalledWith(mockClient, [item], 'd1', expect.any(Function))
    expect(mockOptimisticFiles).toHaveBeenCalled()
    expect(notify).toHaveBeenLastCalledWith('drive.import.successFile')
  })

  it('does nothing when the picker is cancelled', async () => {
    mockPickDocuments.mockResolvedValue([])
    await handlers().uploadFiles()
    expect(mockUploadBatch).not.toHaveBeenCalled()
  })

  it('reports a failed batch without adding rows', async () => {
    const notify = jest.fn()
    mockPickDocuments.mockResolvedValue([item])
    mockUploadBatch.mockResolvedValue({
      results: [{ item, ok: false, error: 'boom' }],
      succeeded: 0,
      failed: 1
    })
    await handlers({ notify }).uploadFiles()
    expect(notify).toHaveBeenLastCalledWith('drive.import.errorGeneric')
  })

  it('does not open the picker offline', async () => {
    mockOnline = false
    await handlers().uploadFiles()
    expect(mockPickDocuments).not.toHaveBeenCalled()
  })
})

describe('useCreateHandlers inside a shared drive', () => {
  const deps = { driveId: 'drive-1' }

  it('scopes the folder create to the drive', async () => {
    await handlers(deps).createFolderNamed('Foo')
    expect(mockCreateFolder).toHaveBeenCalledWith(mockClient, 'Foo', 'd1', 'drive-1')
  })

  it('scopes the note create to the drive', async () => {
    await handlers(deps).createNote()
    expect(mockCreateNote).toHaveBeenCalledWith(mockClient, 'd1', 'drive-1')
  })

  it('scopes the office create to the drive', async () => {
    await handlers(deps).createOfficeNamed('sheet', 'Budget')
    expect(mockCreateOffice).toHaveBeenCalledWith(mockClient, 'sheet', 'Budget', 'd1', 'drive-1')
  })

  it('skips the optimistic row, which our store would never reconcile', async () => {
    await handlers(deps).createFolderNamed('Foo')
    expect(mockOptimisticFiles).not.toHaveBeenCalled()
  })

  it('hands the screen what it created, to show it before the listing has it', async () => {
    const onCreated = jest.fn()
    await handlers({ ...deps, onCreated }).createFolderNamed('Foo')
    expect(onCreated).toHaveBeenCalledWith({ _id: 'new', name: 'Foo', type: 'directory' })
  })
})

describe('useCreateHandlers offline', () => {
  it('notifies and creates nothing', async () => {
    mockOnline = false
    const notify = jest.fn()
    await handlers({ notify }).createFolderNamed('Foo')
    expect(mockCreateFolder).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalled()
  })
})
