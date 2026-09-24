import React from 'react'
import { act, render } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, push: mockPush, canGoBack: () => true })
}))

const captured: { onStart?: () => void; onStop?: () => void; nativeControls?: boolean } = {}

jest.mock('expo-video', () => ({
  __esModule: true,
  VideoView: (props: {
    onPictureInPictureStart?: () => void
    onPictureInPictureStop?: () => void
    nativeControls?: boolean
  }) => {
    captured.onStart = props.onPictureInPictureStart
    captured.onStop = props.onPictureInPictureStop
    captured.nativeControls = props.nativeControls
    return null
  },
  useVideoPlayer: jest.fn()
}))

import { PiPSessionContext, PiPSessionContextValue } from './PiPSession'
import { VideoPreview } from './VideoPreview'

const mockClaim = jest.fn()
const mockRelease = jest.fn()

const makePlayer = (playing: boolean) => ({
  play: jest.fn(),
  pause: jest.fn(),
  replace: jest.fn(),
  playing,
  loop: false,
  staysActiveInBackground: false,
  addListener: jest.fn().mockReturnValue({ remove: jest.fn() })
})

let inPictureInPicture = false
const mockSetPiP = jest.fn((value: boolean) => {
  inPictureInPicture = value
})
const mockIsPiP = jest.fn(() => inPictureInPicture)

const wrap = (ui: React.ReactElement, playing = true) => {
  const ctxValue: PiPSessionContextValue = {
    active: null,
    player: makePlayer(playing) as unknown as PiPSessionContextValue['player'],
    claim: mockClaim,
    release: mockRelease,
    setPictureInPicture: mockSetPiP,
    isPictureInPicture: mockIsPiP
  }
  return <PiPSessionContext.Provider value={ctxValue}>{ui}</PiPSessionContext.Provider>
}

describe('VideoPreview', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockPush.mockReset()
    mockClaim.mockReset()
    mockRelease.mockReset()
    mockSetPiP.mockClear()
    mockIsPiP.mockClear()
    inPictureInPicture = false
    captured.onStart = undefined
    captured.onStop = undefined
  })

  // The controls appear with the view and hide a few seconds later, so on a
  // slow stream they were already gone by the time the first frame arrived.
  it('keeps the native controls off until the player is ready', () => {
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    expect(captured.nativeControls).toBe(false)
  })

  it('turns the native controls on when the player reports readyToPlay', () => {
    const player = makePlayer(true) as unknown as PiPSessionContextValue['player'] & {
      addListener: jest.Mock
    }
    const ctxValue: PiPSessionContextValue = {
      active: null,
      player,
      claim: mockClaim,
      release: mockRelease,
      setPictureInPicture: mockSetPiP,
      isPictureInPicture: mockIsPiP
    }
    render(
      <PiPSessionContext.Provider value={ctxValue}>
        <VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />
      </PiPSessionContext.Provider>
    )
    expect(captured.nativeControls).toBe(false)
    const onStatusChange = player.addListener.mock.calls[0][1] as (e: { status: string }) => void
    act(() => onStatusChange({ status: 'readyToPlay' }))
    expect(captured.nativeControls).toBe(true)
  })

  it('dismisses the modal when PiP starts', () => {
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    captured.onStart!()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  it('re-pushes the preview route when PiP stops (restore or close)', async () => {
    // We always re-push on stop because expo-video does not let us tell
    // restore vs close apart reliably — see VideoPreview.tsx for the
    // rationale. The push is deferred one tick to let iOS finish its
    // PiP teardown.
    render(
      wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />, true)
    )
    captured.onStop!()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockPush).toHaveBeenCalledWith('/preview/f1')
  })

  it('still re-pushes on PiP stop when the player is paused', async () => {
    render(
      wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />, false)
    )
    captured.onStop!()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockPush).toHaveBeenCalledWith('/preview/f1')
  })

  // The video kept playing, sound and all, once the preview was gone.
  it('stops the video when the preview is left', () => {
    const view = render(
      wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />)
    )

    view.unmount()

    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  // Starting PiP unmounts this view on purpose, and the player has to survive
  // it for the OS layer to keep going.
  it('leaves the player alone when PiP took the video', () => {
    const view = render(
      wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />)
    )
    act(() => captured.onStart!())

    view.unmount()

    expect(mockSetPiP).toHaveBeenCalledWith(true)
    expect(mockRelease).not.toHaveBeenCalled()
  })

  it('tells the session the PiP window is gone', () => {
    render(wrap(<VideoPreview fileId="f1" source={{ uri: 'https://x/v.mp4', headers: {} }} />))
    act(() => captured.onStart!())

    act(() => captured.onStop!())

    expect(mockSetPiP).toHaveBeenLastCalledWith(false)
  })
})
