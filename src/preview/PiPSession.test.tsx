import React from 'react'
import { renderHook, act } from '@testing-library/react-native'

jest.mock('expo-video', () => ({
  __esModule: true,
  useVideoPlayer: jest.fn().mockReturnValue({
    play: jest.fn(),
    pause: jest.fn(),
    replace: jest.fn(),
    playing: true,
    loop: false,
    staysActiveInBackground: false,
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() })
  })
}))

import { PiPSessionProvider, usePiPSession } from './PiPSession'

const wrap = ({ children }: { children: React.ReactNode }) => (
  <PiPSessionProvider>{children}</PiPSessionProvider>
)

describe('PiPSession', () => {
  it('starts with no active session', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    expect(result.current.active).toBeNull()
  })

  it('records the active session when claim is called', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    act(() => {
      result.current.claim('file-1', { uri: 'https://x/v.mp4', headers: { Authorization: 'B' } })
    })
    expect(result.current.active).toEqual({
      fileId: 'file-1',
      source: { uri: 'https://x/v.mp4', headers: { Authorization: 'B' } }
    })
  })

  it('replaces the active session when claim is called with a new fileId', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    act(() => {
      result.current.claim('file-1', { uri: 'https://x/a.mp4', headers: {} })
    })
    act(() => {
      result.current.claim('file-2', { uri: 'https://x/b.mp4', headers: {} })
    })
    expect(result.current.active).toEqual({
      fileId: 'file-2',
      source: { uri: 'https://x/b.mp4', headers: {} }
    })
  })

  it('clears the active session when release is called', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    act(() => {
      result.current.claim('file-1', { uri: 'https://x/a.mp4', headers: {} })
    })
    act(() => {
      result.current.release()
    })
    expect(result.current.active).toBeNull()
  })

  it('throws when usePiPSession is called outside a provider', () => {
    const { result } = renderHook(() => {
      try {
        return usePiPSession()
      } catch (e) {
        return e
      }
    })
    expect(result.current).toBeInstanceOf(Error)
  })
})
