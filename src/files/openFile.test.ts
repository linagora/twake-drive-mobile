import FileViewer from 'react-native-file-viewer'

import { openFileNatively } from './openFile'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'

const mockIsPinnedAndDownloaded = OfflineFilesStore.isPinnedAndDownloaded as jest.Mock

// In-memory fs for class-based expo-file-system. Tests assert on this map
// rather than on call records, to mirror the API's stateful semantics.
const mockFs = new Map<string, { kind: 'file' | 'dir'; size?: number }>()
const mockDownload = jest.fn()
let mockDownloadImpl:
  | ((url: string, dest: string, opts?: unknown) => Promise<{ status?: number } | undefined>)
  | undefined

jest.mock('expo-file-system', () => {
  const join = (...parts: (string | { uri: string })[]): string =>
    parts.map(p => (typeof p === 'string' ? p : p.uri)).reduce((a, b) => a + b)

  class MockFile {
    uri: string
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(...parts)
    }
    get exists(): boolean { return mockFs.get(this.uri)?.kind === 'file' }
    get size(): number { return mockFs.get(this.uri)?.size ?? 0 }
    copy(dest: { uri: string }): void {
      const src = mockFs.get(this.uri)
      if (!src) throw new Error(`copy: source missing ${this.uri}`)
      mockFs.set(dest.uri, { ...src })
    }
    static async downloadFileAsync(
      url: string,
      destination: { uri: string },
      options?: { headers?: Record<string, string>; idempotent?: boolean }
    ): Promise<MockFile> {
      // Capture the call so tests can assert against it.
      mockDownload(url, destination.uri, options)
      const result = await mockDownloadImpl?.(url, destination.uri, options)
      if (result?.status && result.status >= 400) {
        throw new Error(`UnableToDownload: HTTP ${result.status}`)
      }
      mockFs.set(destination.uri, { kind: 'file', size: 1024 })
      return new MockFile(destination.uri)
    }
  }
  class MockDirectory {
    uri: string
    constructor(...parts: (string | { uri: string })[]) {
      const j = join(...parts)
      this.uri = j.endsWith('/') ? j : `${j}/`
    }
    get exists(): boolean { return mockFs.get(this.uri)?.kind === 'dir' }
    create(): void { mockFs.set(this.uri, { kind: 'dir' }) }
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { cache: { uri: 'file:///cache/' } }
  }
})

jest.mock('react-native-file-viewer', () => ({
  __esModule: true,
  default: { open: jest.fn().mockResolvedValue(undefined) }
}))

jest.mock('@/offline/OfflineFilesStore', () => ({
  OfflineFilesStore: { isPinnedAndDownloaded: jest.fn().mockReturnValue(false) }
}))
jest.mock('@/offline/FileSystemRepo', () => ({
  FileSystemRepo: { localPath: (id: string) => `file:///offline/${id}` }
}))

const makeClient = (token: string | null = 'tok-1', uri = 'https://alice.example.com') =>
  ({
    getStackClient: () => ({
      uri,
      getAccessToken: () => token
    })
  }) as unknown as import('cozy-client').default

describe('openFileNatively', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFs.clear()
    mockDownloadImpl = undefined
  })

  it('downloads to cache and opens via FileViewer', async () => {
    await openFileNatively(makeClient(), { _id: 'abc', name: 'test.pdf', mime: 'application/pdf' })
    expect(mockFs.get('file:///cache/twake-drive/')?.kind).toBe('dir')
    expect(mockDownload).toHaveBeenCalledWith(
      'https://alice.example.com/files/download/abc',
      'file:///cache/twake-drive/abc-test.pdf',
      { headers: { Authorization: 'Bearer tok-1' }, idempotent: true }
    )
    expect(FileViewer.open).toHaveBeenCalledWith('file:///cache/twake-drive/abc-test.pdf', {
      showOpenWithDialog: true,
      showAppsSuggestions: true
    })
  })

  it('throws when no token is available', async () => {
    await expect(
      openFileNatively(makeClient(null), { _id: 'abc', name: 't.pdf' })
    ).rejects.toThrow(/access token/)
  })

  it('throws when download fails', async () => {
    mockDownloadImpl = () => Promise.resolve({ status: 404 })
    await expect(
      openFileNatively(makeClient(), { _id: 'abc', name: 't.pdf' })
    ).rejects.toThrow(/HTTP 404/)
  })

  it('copies the pinned blob to cache (with extension) then opens it', async () => {
    mockIsPinnedAndDownloaded.mockReturnValueOnce(true)
    mockFs.set('file:///offline/abc', { kind: 'file', size: 1024 })
    await openFileNatively(makeClient(), { _id: 'abc', name: 't.pdf' })
    expect(mockDownload).not.toHaveBeenCalled()
    expect(mockFs.get('file:///cache/twake-drive/abc-t.pdf')?.kind).toBe('file')
    expect(FileViewer.open).toHaveBeenCalledWith(
      'file:///cache/twake-drive/abc-t.pdf',
      expect.any(Object)
    )
  })

  it('skips the copy if the cache alias already exists', async () => {
    mockIsPinnedAndDownloaded.mockReturnValueOnce(true)
    mockFs.set('file:///offline/abc', { kind: 'file', size: 1024 })
    mockFs.set('file:///cache/twake-drive/abc-t.pdf', { kind: 'file', size: 999 })
    await openFileNatively(makeClient(), { _id: 'abc', name: 't.pdf' })
    // Pre-existing alias preserved (size still 999, not overwritten by copy).
    expect(mockFs.get('file:///cache/twake-drive/abc-t.pdf')?.size).toBe(999)
    expect(FileViewer.open).toHaveBeenCalledWith(
      'file:///cache/twake-drive/abc-t.pdf',
      expect.any(Object)
    )
  })

  it('throws when the pinned blob is missing on disk', async () => {
    mockIsPinnedAndDownloaded.mockReturnValueOnce(true)
    await expect(
      openFileNatively(makeClient(), { _id: 'abc', name: 't.pdf' })
    ).rejects.toThrow(/missing on disk/)
  })

  it('sanitizes filename slashes', async () => {
    await openFileNatively(makeClient(), { _id: 'abc', name: 'weird/name' })
    expect(mockDownload).toHaveBeenCalledWith(
      'https://alice.example.com/files/download/abc',
      'file:///cache/twake-drive/abc-weird_name',
      expect.any(Object)
    )
  })
})

