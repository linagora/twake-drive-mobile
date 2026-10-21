import React from 'react'
import { Platform } from 'react-native'
import { renderHook, act } from '@testing-library/react-native'

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  replace: jest.fn(),
  playing: true,
  loop: false,
  staysActiveInBackground: false,
  showNowPlayingNotification: false,
  addListener: jest.fn().mockReturnValue({ remove: jest.fn() })
}
jest.mock('expo-video', () => ({
  __esModule: true,
  useVideoPlayer: (_source: unknown, setup?: (p: typeof mockPlayer) => void) => {
    setup?.(mockPlayer)
    return mockPlayer
  }
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
      result.current.claim(
        'file-1',
        { uri: 'https://x/v.mp4', headers: { Authorization: 'B' } },
        'v.mp4'
      )
    })
    expect(result.current.active).toEqual({
      fileId: 'file-1',
      source: { uri: 'https://x/v.mp4', headers: { Authorization: 'B' } },
      title: 'v.mp4'
    })
  })

  it('names the video after the file on the lock screen and in Control Center', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    expect(mockPlayer.showNowPlayingNotification).toBe(true)
    act(() => {
      result.current.claim('file-1', { uri: 'https://x/v.mp4', headers: {} }, 'Holidays.mp4')
    })
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({
      uri: 'https://x/v.mp4',
      headers: {},
      metadata: { title: 'Holidays.mp4' }
    })
  })

  it('leaves Android without a media notification for videos', () => {
    Platform.OS = 'android'
    try {
      renderHook(() => usePiPSession(), { wrapper: wrap })
      expect(mockPlayer.showNowPlayingNotification).toBe(false)
    } finally {
      Platform.OS = 'ios'
    }
  })

  it('replaces the active session when claim is called with a new fileId', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    act(() => {
      result.current.claim('file-1', { uri: 'https://x/a.mp4', headers: {} }, 'a.mp4')
    })
    act(() => {
      result.current.claim('file-2', { uri: 'https://x/b.mp4', headers: {} }, 'b.mp4')
    })
    expect(result.current.active).toEqual({
      fileId: 'file-2',
      source: { uri: 'https://x/b.mp4', headers: {} },
      title: 'b.mp4'
    })
  })

  it('clears the active session when release is called', () => {
    const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
    act(() => {
      result.current.claim('file-1', { uri: 'https://x/a.mp4', headers: {} }, 'a.mp4')
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

  describe('picture in picture', () => {
    it('keeps the video out of the background until a PiP window takes it', () => {
      const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })

      expect(result.current.player.staysActiveInBackground).toBe(false)
      expect(result.current.isPictureInPicture()).toBe(false)

      act(() => result.current.setPictureInPicture(true))

      expect(result.current.player.staysActiveInBackground).toBe(true)
      expect(result.current.isPictureInPicture()).toBe(true)
    })

    it('stops following the user around once the PiP window is gone', () => {
      const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })

      act(() => result.current.setPictureInPicture(true))
      act(() => result.current.setPictureInPicture(false))

      expect(result.current.player.staysActiveInBackground).toBe(false)
      expect(result.current.isPictureInPicture()).toBe(false)
    })

    // Read at unmount, where a value captured on the last render is stale.
    it('answers with the state at the time of the question', () => {
      const { result } = renderHook(() => usePiPSession(), { wrapper: wrap })
      const ask = result.current.isPictureInPicture

      act(() => result.current.setPictureInPicture(true))

      expect(ask()).toBe(true)
    })
  })
})
