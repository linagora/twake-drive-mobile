import React from 'react'
import { render } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: mockPush, canGoBack: () => true })
}))

const captured: { onStart?: () => void; onStop?: () => void } = {}

jest.mock('expo-video', () => ({
  __esModule: true,
  VideoView: (props: { onPictureInPictureStart?: () => void; onPictureInPictureStop?: () => void }) => {
    captured.onStart = props.onPictureInPictureStart
    captured.onStop = props.onPictureInPictureStop
    return null
  },
  useVideoPlayer: jest.fn()
}))

import { PiPSessionContext, PiPSessionContextValue } from './PiPSession'
import { VideoPreview } from './VideoPreview'

const mockClaim = jest.fn()
const mockRelease = jest.fn()
const ctxValue: PiPSessionContextValue = {
  active: null,
  claim: mockClaim,
  release: mockRelease
}

const wrap = (ui: React.ReactElement) => (
  <PiPSessionContext.Provider value={ctxValue}>{ui}</PiPSessionContext.Provider>
)

const stablePlayer = (playing: boolean) => ({
  play: jest.fn(),
  pause: jest.fn(),
  playing,
  addListener: jest.fn().mockReturnValue({ remove: jest.fn() })
})

describe('VideoPreview', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockPush.mockReset()
    mockClaim.mockReset()
    mockRelease.mockReset()
    captured.onStart = undefined
    captured.onStop = undefined
    const { useVideoPlayer } = jest.requireMock('expo-video') as { useVideoPlayer: jest.Mock }
    useVideoPlayer.mockReturnValue(stablePlayer(true))
  })

  it('dismisses the modal when PiP starts', () => {
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    captured.onStart!()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('re-pushes the preview route when PiP stops while still playing', () => {
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    captured.onStop!()
    expect(mockPush).toHaveBeenCalledWith('/preview/f1')
    expect(mockRelease).not.toHaveBeenCalled()
  })

  it('releases the session when PiP stops while paused', () => {
    const { useVideoPlayer } = jest.requireMock('expo-video') as { useVideoPlayer: jest.Mock }
    useVideoPlayer.mockReturnValue(stablePlayer(false))
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    captured.onStop!()
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })
})
