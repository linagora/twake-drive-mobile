const mockFetch = jest.fn()
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fetch: (...a: unknown[]) => mockFetch(...a),
    wrap: (path: string) => `wrapped:${path}`
  }
}))

const mockWriteDocumentCache = jest.fn()
jest.mock('./documentBytes', () => ({
  writeDocumentCache: (...a: unknown[]) => mockWriteDocumentCache(...a)
}))

let mockOnline = true
jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({ getCurrent: () => mockOnline })
}))

const mockStore = new Map<string, string>()
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => mockStore.set(k, v)
  })
}))

import { flushPendingEdits, saveDocument } from './saveDocument'
import { pendingEdits } from './pendingEdits'

const client = {
  getStackClient: () => ({ uri: 'https://alice.cozy.test', getAccessToken: () => 'TOK' })
} as never

const file = { _id: 'f1', name: 'schema.excalidraw', mime: 'application/json' }

describe('saveDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStore.clear()
    mockOnline = true
    mockWriteDocumentCache.mockResolvedValue('file:///cache/f1-1')
    mockFetch.mockResolvedValue({ info: () => ({ status: 200 }) })
  })

  it('writes the local copy before anything else', async () => {
    await saveDocument(client, file, '{"elements":[]}')
    expect(mockWriteDocumentCache).toHaveBeenCalledWith(file, '{"elements":[]}')
  })

  it('sends the document to the instance when there is a network', async () => {
    expect(await saveDocument(client, file, '{}')).toBe('saved')
    expect(mockFetch).toHaveBeenCalledWith(
      'PUT',
      'https://alice.cozy.test/files/f1',
      expect.objectContaining({ Authorization: 'Bearer TOK' }),
      'wrapped:/cache/f1-1'
    )
    expect(pendingEdits()).toHaveLength(0)
  })

  it('writes a document of a shared drive through that drive', async () => {
    await saveDocument(client, file, '{}', 'drive-1')
    expect(mockFetch.mock.calls[0][1]).toBe('https://alice.cozy.test/sharings/drives/drive-1/f1')
  })

  it('keeps the edit for later when there is no network', async () => {
    mockOnline = false
    expect(await saveDocument(client, file, '{}')).toBe('queued')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(pendingEdits()).toHaveLength(1)
  })

  it('keeps the edit when the instance refuses it', async () => {
    mockFetch.mockResolvedValue({ info: () => ({ status: 500 }) })
    expect(await saveDocument(client, file, '{}')).toBe('queued')
    expect(pendingEdits()).toHaveLength(1)
  })

  it('remembers one edit per document, the last one', async () => {
    mockOnline = false
    await saveDocument(client, file, '{"a":1}')
    await saveDocument(client, file, '{"a":2}')
    expect(pendingEdits()).toHaveLength(1)
  })
})

describe('flushPendingEdits', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStore.clear()
    mockWriteDocumentCache.mockResolvedValue('file:///cache/f1-1')
  })

  it('sends what was edited with no network, once there is one', async () => {
    mockOnline = false
    await saveDocument(client, file, '{}')
    mockOnline = true
    mockFetch.mockResolvedValue({ info: () => ({ status: 200 }) })
    expect(await flushPendingEdits(client)).toBe(1)
    expect(pendingEdits()).toHaveLength(0)
  })

  it('keeps an edit that still cannot be sent', async () => {
    mockOnline = false
    await saveDocument(client, file, '{}')
    mockOnline = true
    mockFetch.mockRejectedValue(new Error('network'))
    expect(await flushPendingEdits(client)).toBe(0)
    expect(pendingEdits()).toHaveLength(1)
  })

  it('does nothing while there is still no network', async () => {
    mockOnline = false
    await saveDocument(client, file, '{}')
    expect(await flushPendingEdits(client)).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
