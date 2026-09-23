import { renderHook } from '@testing-library/react-native'

// See PendingShareProvider.test.tsx on the `mock` prefix: babel-plugin-jest-hoist
// only lets a module factory reach out-of-scope names starting with it.
const mockShareIntent = {
  hasShareIntent: false,
  shareIntent: null as unknown,
  resetShareIntent: jest.fn()
}

jest.mock('expo-share-intent', () => ({
  useShareIntent: () => mockShareIntent
}))

import { useIncomingShare } from './useIncomingShare'

const givenShareIntent = (shareIntent: unknown): void => {
  mockShareIntent.hasShareIntent = true
  mockShareIntent.shareIntent = shareIntent
}

describe('useIncomingShare', () => {
  it('maps a shared file to an item', () => {
    givenShareIntent({
      files: [{ path: '/tmp/a.png', fileName: 'a.png', mimeType: 'image/png', size: 12 }]
    })
    const { result } = renderHook(() => useIncomingShare())
    expect(result.current.items).toEqual([
      { uri: 'file:///tmp/a.png', name: 'a.png', mimeType: 'image/png', size: 12 }
    ])
  })

  // The native module can report a file it could not read, and it pads the
  // single-file share with an entry that is not a file at all (#268).
  it('drops an entry that carries no path', () => {
    givenShareIntent({ files: [{ fileName: 'a.png', mimeType: 'image/png' }] })
    const { result } = renderHook(() => useIncomingShare())
    expect(result.current.items).toEqual([])
  })

  it('drops entries that are not files', () => {
    givenShareIntent({ files: [{ path: '/tmp/a.png' }, 'type', ['type', 'file'], null] })
    const { result } = renderHook(() => useIncomingShare())
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].uri).toBe('file:///tmp/a.png')
  })

  it('keeps a content:// uri as it is', () => {
    givenShareIntent({ files: [{ path: 'content://media/external/images/media/42' }] })
    const { result } = renderHook(() => useIncomingShare())
    expect(result.current.items[0].uri).toBe('content://media/external/images/media/42')
  })

  it('has no item when the share carries no file', () => {
    givenShareIntent({ text: 'hello' })
    const { result } = renderHook(() => useIncomingShare())
    expect(result.current.items).toEqual([])
    expect(result.current.text).toBe('hello')
  })
})
