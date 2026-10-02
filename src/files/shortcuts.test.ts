const mockRefresh = jest.fn()
jest.mock('./refreshDocument', () => ({
  __esModule: true,
  refreshDocumentFromStack: (...args: unknown[]) => mockRefresh(...args)
}))

import { fetchShortcutTarget, fetchShortcutUrl } from './shortcuts'

const buildClient = (response: unknown) => {
  const query = jest.fn().mockResolvedValue(response)
  return { client: { query } as never, query }
}

beforeEach(() => {
  mockRefresh.mockReset()
})

describe('fetchShortcutUrl', () => {
  it('queries io.cozy.files.shortcuts with the right shape', async () => {
    const { client, query } = buildClient({ data: { url: 'https://example.com/' } })
    const url = await fetchShortcutUrl(client, 'abc')
    expect(url).toBe('https://example.com/')
    expect(query).toHaveBeenCalledTimes(1)
    const [definition, options] = query.mock.calls[0]
    expect(definition.doctype).toBe('io.cozy.files.shortcuts')
    expect(definition.id).toBe('abc')
    expect(options).toMatchObject({
      as: 'io.cozy.files.shortcuts/abc',
      singleDocData: true
    })
  })

  it('falls back to attributes.url for raw JSON-API responses', async () => {
    const { client } = buildClient({ data: { attributes: { url: 'https://fallback.test/' } } })
    expect(await fetchShortcutUrl(client, 'id')).toBe('https://fallback.test/')
  })

  it('returns null when no URL is present', async () => {
    const { client } = buildClient({ data: {} })
    expect(await fetchShortcutUrl(client, 'id')).toBeNull()
  })

  // The stack flips `metadata.sharing.status` to `seen` while serving the
  // request, and the local copy only learns it by reading the file back.
  it('reads the file back when the shortcut is the one of a received share', async () => {
    const { client } = buildClient({
      data: { url: 'https://owner.test/preview', metadata: { sharing: { status: 'seen' } } }
    })
    expect(await fetchShortcutUrl(client, 'share-1')).toBe('https://owner.test/preview')
    expect(mockRefresh).toHaveBeenCalledWith(client, 'share-1')
  })

  it('leaves a plain shortcut alone', async () => {
    const { client } = buildClient({ data: { url: 'https://example.com/' } })
    await fetchShortcutUrl(client, 'abc')
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})

describe('fetchShortcutTarget', () => {
  it('reads metadata.target._id', async () => {
    const { client } = buildClient({
      data: { metadata: { target: { _id: 'folder-1', _type: 'io.cozy.files' } } }
    })
    expect(await fetchShortcutTarget(client, 'sc')).toEqual({
      _id: 'folder-1',
      _type: 'io.cozy.files'
    })
  })

  it('falls back to metadata.target.doctype when _type missing', async () => {
    const { client } = buildClient({
      data: { metadata: { target: { _id: 'f', doctype: 'io.cozy.files' } } }
    })
    expect(await fetchShortcutTarget(client, 'sc')).toEqual({
      _id: 'f',
      _type: 'io.cozy.files'
    })
  })

  it('returns null when no metadata.target is present', async () => {
    const { client } = buildClient({ data: { url: 'https://x' } })
    expect(await fetchShortcutTarget(client, 'sc')).toBeNull()
  })
})
