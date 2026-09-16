import { renderHook, act } from '@testing-library/react-native'

const mockQueryAll = jest.fn()

jest.mock('cozy-client', () => {
  const chain = (): Record<string, unknown> => builder
  const builder: Record<string, unknown> = {}
  builder.where = chain
  builder.indexFields = chain
  builder.sortBy = chain
  return {
    __esModule: true,
    useClient: () => ({ queryAll: mockQueryAll }),
    Q: () => builder
  }
})

jest.mock('./OfflineFilesStore', () => ({
  OfflineFilesStore: {
    batch: (fn: () => void) => fn(),
    pinFolder: jest.fn(),
    pinViaFolder: jest.fn(),
    unpinFolder: jest.fn(),
    unpin: jest.fn()
  }
}))

jest.mock('./Downloader', () => ({
  Downloader: { enqueue: jest.fn(), cancel: jest.fn() }
}))

import { OfflineFilesStore } from './OfflineFilesStore'
import { Downloader } from './Downloader'
import { useOfflineActions } from './useOfflineActions'

const dir = (id: string, name: string) => ({ _id: id, name, type: 'directory' as const })
const file = (id: string, name: string) => ({ _id: id, name, type: 'file' as const, size: 1 })

describe('useOfflineActions.pinFolder', () => {
  beforeEach(() => jest.clearAllMocks())

  // A single page stopped the walk at the first hundred children, and each
  // subfolder left out took its whole subtree with it.
  it('walks every level of the tree', async () => {
    mockQueryAll.mockImplementation(() => {
      const calls = mockQueryAll.mock.calls.length
      if (calls === 1) return Promise.resolve([file('f1', 'a.txt'), dir('d1', 'sub')])
      if (calls === 2) return Promise.resolve([file('f2', 'b.txt'), dir('d2', 'deep')])
      if (calls === 3) return Promise.resolve([file('f3', 'c.txt')])
      return Promise.resolve([])
    })
    const { result } = renderHook(() => useOfflineActions())
    await act(async () => {
      await result.current.pinFolder(dir('root', 'Root'))
    })
    expect((OfflineFilesStore.pinFolder as jest.Mock).mock.calls.map(c => c[0])).toEqual([
      'root',
      'd1',
      'd2'
    ])
    expect((Downloader.enqueue as jest.Mock).mock.calls.map(c => c[0])).toEqual(['f1', 'f2', 'f3'])
  })

  it('records the ancestor chain of a nested subfolder', async () => {
    mockQueryAll.mockImplementation(() => {
      const calls = mockQueryAll.mock.calls.length
      if (calls === 1) return Promise.resolve([dir('d1', 'sub')])
      if (calls === 2) return Promise.resolve([dir('d2', 'deep')])
      return Promise.resolve([])
    })
    const { result } = renderHook(() => useOfflineActions())
    await act(async () => {
      await result.current.pinFolder(dir('root', 'Root'))
    })
    const deep = (OfflineFilesStore.pinFolder as jest.Mock).mock.calls.find(c => c[0] === 'd2')
    expect(deep?.[1].ancestorPins).toEqual(['root', 'd1'])
  })

  // The rejection used to bubble to a caller that discards it, leaving the pin
  // silently incomplete.
  it('keeps going when one subfolder cannot be read', async () => {
    mockQueryAll.mockImplementation(() => {
      const calls = mockQueryAll.mock.calls.length
      if (calls === 1) return Promise.resolve([dir('bad', 'nope'), dir('good', 'yes')])
      if (calls === 2) return Promise.reject(new Error('boom'))
      return Promise.resolve([file('f9', 'z.txt')])
    })
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useOfflineActions())
    await act(async () => {
      await result.current.pinFolder(dir('root', 'Root'))
    })
    expect((OfflineFilesStore.pinFolder as jest.Mock).mock.calls.map(c => c[0])).toEqual([
      'root',
      'good'
    ])
    expect((Downloader.enqueue as jest.Mock).mock.calls.map(c => c[0])).toEqual(['f9'])
  })
})
