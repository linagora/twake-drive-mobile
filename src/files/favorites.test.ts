import { isFavorite, toggleFavorite } from './favorites'
import { optimisticFiles } from '@/files/optimisticFiles'
import type { FileQueryResult } from '@/client/queries'

const mockRevert = jest.fn()
jest.mock('@/files/optimisticFiles', () => ({
  optimisticFiles: jest.fn(() => mockRevert)
}))

// Minimal fake file used across tests
const makeFile = (favorite?: boolean): FileQueryResult => ({
  _id: 'file-1',
  _type: 'io.cozy.files',
  name: 'test.pdf',
  type: 'file',
  cozyMetadata: favorite !== undefined ? { favorite } : undefined
})

// Fake cozy-client exposing collection('io.cozy.files').updateAttributes — the
// SAME stack-direct path renameEntry/moveEntry use (NOT the generic client.save,
// which on mobile writes only to the offline pouch and never persists files).
const makeMockClient = () => {
  const updateAttributes = jest.fn().mockResolvedValue({ data: {} })
  const collection = jest.fn().mockReturnValue({ updateAttributes })
  return {
    client: { collection } as unknown as import('cozy-client').default,
    collection,
    updateAttributes
  }
}

describe('isFavorite', () => {
  it('returns true when cozyMetadata.favorite is true', () => {
    expect(isFavorite(makeFile(true))).toBe(true)
  })

  it('returns false when cozyMetadata.favorite is false', () => {
    expect(isFavorite(makeFile(false))).toBe(false)
  })

  it('returns false when cozyMetadata is absent', () => {
    expect(isFavorite(makeFile())).toBe(false)
  })

  it('returns false when the file has no cozyMetadata at all', () => {
    const f = { _id: 'f', _type: 'io.cozy.files', name: 'x', type: 'file' } as FileQueryResult
    expect(isFavorite(f)).toBe(false)
  })
})

describe('toggleFavorite', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // The stack mutation does not write to the local replica, so the lists only
  // saw the new favourite on the next replication.
  it('pushes the updated doc to the store so the queries re-evaluate at once', async () => {
    const { client } = makeMockClient()
    await toggleFavorite(client, makeFile(false), true)
    expect(optimisticFiles).toHaveBeenCalledWith(client, [
      expect.objectContaining({ _id: 'file-1', cozyMetadata: { favorite: true } })
    ])
  })

  it('reverts the store update and rethrows when the stack refuses', async () => {
    const { client, updateAttributes } = makeMockClient()
    updateAttributes.mockRejectedValue(new Error('403'))
    await expect(toggleFavorite(client, makeFile(false), true)).rejects.toThrow('403')
    expect(mockRevert).toHaveBeenCalled()
  })

  it('keeps the store update when the stack accepts', async () => {
    const { client } = makeMockClient()
    await toggleFavorite(client, makeFile(false), true)
    expect(mockRevert).not.toHaveBeenCalled()
  })

  it('updates io.cozy.files via updateAttributes with favorite = true when next is true', async () => {
    const { client, collection, updateAttributes } = makeMockClient()
    await toggleFavorite(client, makeFile(false), true)
    expect(collection).toHaveBeenCalledWith('io.cozy.files')
    expect(updateAttributes).toHaveBeenCalledTimes(1)
    const [id, attributes] = updateAttributes.mock.calls[0] as [
      string,
      { cozyMetadata: { favorite: boolean } }
    ]
    expect(id).toBe('file-1')
    expect(attributes.cozyMetadata.favorite).toBe(true)
  })

  it('sets favorite = false when next is false', async () => {
    const { client, updateAttributes } = makeMockClient()
    await toggleFavorite(client, makeFile(true), false)
    const attributes = updateAttributes.mock.calls[0][1] as { cozyMetadata: { favorite: boolean } }
    expect(attributes.cozyMetadata.favorite).toBe(false)
  })

  it('merges into existing cozyMetadata without losing other fields', async () => {
    const { client, updateAttributes } = makeMockClient()
    const file: FileQueryResult = {
      _id: 'f',
      _type: 'io.cozy.files',
      name: 'doc.txt',
      type: 'file',
      cozyMetadata: { createdBy: { account: 'acct-1' }, favorite: false }
    }
    await toggleFavorite(client, file, true)
    const attributes = updateAttributes.mock.calls[0][1] as {
      cozyMetadata: Record<string, unknown>
    }
    expect(attributes.cozyMetadata.createdBy).toEqual({ account: 'acct-1' })
    expect(attributes.cozyMetadata.favorite).toBe(true)
  })

  it('resolves to undefined', async () => {
    const { client } = makeMockClient()
    await expect(toggleFavorite(client, makeFile(false), true)).resolves.toBeUndefined()
  })
})
