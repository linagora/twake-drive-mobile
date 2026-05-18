// Class-based expo-file-system mock backed by an in-memory map. We assert on
// the resulting fs state, not on individual native calls.
const mockFsState = new Map<string, { kind: 'file' | 'dir'; size?: number }>()

jest.mock('expo-file-system', () => {
  const join = (...parts: (string | { uri: string })[]): string =>
    parts.map(p => (typeof p === 'string' ? p : p.uri)).reduce((a, b) => a + b)

  class MockFile {
    uri: string
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(...parts)
    }
    get exists(): boolean { return mockFsState.get(this.uri)?.kind === 'file' }
    get size(): number { return mockFsState.get(this.uri)?.size ?? 0 }
    delete(): void { mockFsState.delete(this.uri) }
  }
  class MockDirectory {
    uri: string
    constructor(...parts: (string | { uri: string })[]) {
      const j = join(...parts)
      this.uri = j.endsWith('/') ? j : `${j}/`
    }
    get exists(): boolean { return mockFsState.get(this.uri)?.kind === 'dir' }
    create(): void { mockFsState.set(this.uri, { kind: 'dir' }) }
    list(): MockFile[] {
      const out: MockFile[] = []
      for (const [uri, entry] of mockFsState) {
        if (entry.kind !== 'file') continue
        if (!uri.startsWith(this.uri)) continue
        if (uri.slice(this.uri.length).includes('/')) continue
        out.push(new MockFile(uri))
      }
      return out
    }
  }
  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///doc/' } }
  }
})

import { FileSystemRepo } from './FileSystemRepo'

describe('FileSystemRepo', () => {
  beforeEach(() => { mockFsState.clear() })

  it('localPath returns documentDirectory/offline/{fileId}', () => {
    expect(FileSystemRepo.localPath('abc')).toBe('file:///doc/offline/abc')
  })

  it('init creates the offline directory if missing', async () => {
    await FileSystemRepo.init()
    expect(mockFsState.get('file:///doc/offline/')?.kind).toBe('dir')
  })

  it('init is idempotent', async () => {
    mockFsState.set('file:///doc/offline/', { kind: 'dir' })
    await FileSystemRepo.init()
    expect(mockFsState.get('file:///doc/offline/')?.kind).toBe('dir')
  })

  it('exists returns true when the file is on disk', async () => {
    mockFsState.set('file:///doc/offline/abc', { kind: 'file', size: 12 })
    expect(await FileSystemRepo.exists('abc')).toBe(true)
  })

  it('delete removes the blob and is silent if missing', async () => {
    mockFsState.set('file:///doc/offline/abc', { kind: 'file', size: 12 })
    await FileSystemRepo.delete('abc')
    expect(mockFsState.has('file:///doc/offline/abc')).toBe(false)
    await expect(FileSystemRepo.delete('abc')).resolves.toBeUndefined()
  })

  it('totalBytes sums file sizes in the directory', async () => {
    mockFsState.set('file:///doc/offline/', { kind: 'dir' })
    mockFsState.set('file:///doc/offline/abc', { kind: 'file', size: 10 })
    mockFsState.set('file:///doc/offline/def', { kind: 'file', size: 20 })
    expect(await FileSystemRepo.totalBytes()).toBe(30)
  })
})
