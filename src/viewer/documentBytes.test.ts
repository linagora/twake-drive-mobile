const mockGetInfoAsync = jest.fn()
const mockReadAsStringAsync = jest.fn()
const mockDownloadAsync = jest.fn()
const mockMakeDirectoryAsync = jest.fn()
const mockCopyAsync = jest.fn()
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: (...a: unknown[]) => mockGetInfoAsync(...a),
  readAsStringAsync: (...a: unknown[]) => mockReadAsStringAsync(...a),
  downloadAsync: (...a: unknown[]) => mockDownloadAsync(...a),
  makeDirectoryAsync: (...a: unknown[]) => mockMakeDirectoryAsync(...a),
  copyAsync: (...a: unknown[]) => mockCopyAsync(...a)
}))

const mockIsPinned = jest.fn()
jest.mock('@/offline/OfflineFilesStore', () => ({
  OfflineFilesStore: { isPinnedAndDownloaded: (id: string) => mockIsPinned(id) }
}))

jest.mock('@/offline/FileSystemRepo', () => ({
  FileSystemRepo: { localPath: (id: string) => `file:///offline/${id}` }
}))

let mockOnline = true
jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({ getCurrent: () => mockOnline })
}))

import {
  DocumentUnavailableOfflineError,
  readDocumentBytes,
  readDocumentPathWithName
} from './documentBytes'

const client = {
  getStackClient: () => ({ uri: 'https://alice.cozy.test', getAccessToken: () => 'TOK' })
} as never

const file = { _id: 'f1', _rev: '3-abc', name: 'note.cozy-note' }
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

describe('readDocumentBytes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnline = true
    global.atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary')
    mockReadAsStringAsync.mockResolvedValue(Buffer.from('hello').toString('base64'))
  })

  it('reads a pinned file from what the pin keeps up to date', async () => {
    mockIsPinned.mockReturnValue(true)
    expect(decode(await readDocumentBytes(client, file))).toBe('hello')
    expect(mockReadAsStringAsync).toHaveBeenCalledWith('file:///offline/f1', expect.anything())
    expect(mockDownloadAsync).not.toHaveBeenCalled()
  })

  it('reads the copy cached for that revision rather than downloading again', async () => {
    mockIsPinned.mockReturnValue(false)
    mockGetInfoAsync.mockResolvedValue({ exists: true })
    await readDocumentBytes(client, file)
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/twake-drive/viewer/f1-3-abc',
      expect.anything()
    )
    expect(mockDownloadAsync).not.toHaveBeenCalled()
  })

  it('downloads the file once when nothing local holds it', async () => {
    mockIsPinned.mockReturnValue(false)
    mockGetInfoAsync.mockResolvedValue({ exists: false })
    mockDownloadAsync.mockResolvedValue({ status: 200 })
    await readDocumentBytes(client, file)
    expect(mockDownloadAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/alice\.cozy\.test\/files\/download\/f1\?fresh=/),
      'file:///cache/twake-drive/viewer/f1-3-abc',
      { headers: { Authorization: 'Bearer TOK' } }
    )
  })

  it('downloads a file of a shared drive through that drive', async () => {
    mockIsPinned.mockReturnValue(false)
    mockGetInfoAsync.mockResolvedValue({ exists: false })
    mockDownloadAsync.mockResolvedValue({ status: 200 })
    await readDocumentBytes(client, file, 'drive-1')
    expect(mockDownloadAsync.mock.calls[0][0]).toMatch(
      /^https:\/\/alice\.cozy\.test\/sharings\/drives\/drive-1\/download\/f1\?fresh=/
    )
  })

  it('says so rather than hang when the file is nowhere local and there is no network', async () => {
    mockIsPinned.mockReturnValue(false)
    mockGetInfoAsync.mockResolvedValue({ exists: false })
    mockOnline = false
    await expect(readDocumentBytes(client, file)).rejects.toBeInstanceOf(
      DocumentUnavailableOfflineError
    )
  })

  it('surfaces a refused download', async () => {
    mockIsPinned.mockReturnValue(false)
    mockGetInfoAsync.mockResolvedValue({ exists: false })
    mockDownloadAsync.mockResolvedValue({ status: 403 })
    await expect(readDocumentBytes(client, file)).rejects.toThrow('HTTP 403')
  })
})

describe('readDocumentPathWithName', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnline = true
    mockIsPinned.mockReturnValue(false)
    mockDownloadAsync.mockResolvedValue({ status: 200 })
  })

  it('hands the OS viewer a copy of the revision it was asked for', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false })
    const path = await readDocumentPathWithName(client, { ...file, _rev: '4-def' })
    expect(path).toBe('file:///cache/twake-drive/viewer/open/f1-4-def/note.cozy-note')
    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/twake-drive/viewer/f1-4-def',
      to: 'file:///cache/twake-drive/viewer/open/f1-4-def/note.cozy-note'
    })
  })

  it('does not reuse the copy made for an earlier revision', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false })
    const before = await readDocumentPathWithName(client, { ...file, _rev: '3-abc' })
    const after = await readDocumentPathWithName(client, { ...file, _rev: '4-def' })
    expect(before).not.toBe(after)
  })
})
