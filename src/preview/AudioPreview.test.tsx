import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import '@/i18n'

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }
let mockStatus = {
  isLoaded: true,
  playing: false,
  didJustFinish: false,
  duration: 200,
  currentTime: 50
}

jest.mock('expo-audio', () => ({
  __esModule: true,
  AudioModule: { setAudioModeAsync: jest.fn().mockResolvedValue(undefined) },
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus
}))

jest.mock('cozy-client', () => ({ __esModule: true, useClient: () => null }))

import { AudioPreview } from './AudioPreview'

const renderPlayer = () =>
  render(
    <PaperProvider>
      <AudioPreview
        fileId="f1"
        source={{ uri: 'https://example.test/song.mp3', headers: {} }}
        name="song.mp3"
        mime="audio/mpeg"
      />
    </PaperProvider>
  )

describe('AudioPreview accessibility', () => {
  beforeEach(() => {
    mockPlayer.play.mockReset()
    mockPlayer.pause.mockReset()
    mockPlayer.seekTo.mockReset().mockResolvedValue(undefined)
  })

  // The player's only control is an icon: without a label it is announced as
  // an anonymous button, and nothing says whether it plays or pauses.
  it('names the play button after what it does', () => {
    mockStatus = { ...mockStatus, playing: false }
    renderPlayer()
    const button = screen.getByTestId('audio-play-pause')
    expect(button.props.accessibilityLabel).toBe('Lire')
    fireEvent.press(button)
    return waitFor(() => expect(mockPlayer.play).toHaveBeenCalled())
  })

  it('names it pause while playing', () => {
    mockStatus = { ...mockStatus, playing: true }
    renderPlayer()
    expect(screen.getByTestId('audio-play-pause').props.accessibilityLabel).toBe('Mettre en pause')
  })

  it('names the progress bar and exposes the position as its value', () => {
    renderPlayer()
    const bar = screen.getByTestId('audio-progress')
    expect(bar.props.accessibilityLabel).toBe('Position de lecture')
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 })
  })
})

describe('AudioPreview playback', () => {
  beforeEach(() => {
    mockPlayer.play.mockReset()
    mockPlayer.pause.mockReset()
    mockPlayer.seekTo.mockReset().mockResolvedValue(undefined)
  })

  it('starts a finished track again from the beginning', async () => {
    mockStatus = { ...mockStatus, playing: false, didJustFinish: true, currentTime: 200 }
    renderPlayer()
    fireEvent.press(screen.getByTestId('audio-play-pause'))
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled())
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0)
    expect(mockPlayer.seekTo.mock.invocationCallOrder[0]).toBeLessThan(
      mockPlayer.play.mock.invocationCallOrder[0]
    )
  })

  it('starts it again once at its end, even after the finish event has passed', async () => {
    mockStatus = { ...mockStatus, playing: false, didJustFinish: false, currentTime: 200 }
    renderPlayer()
    fireEvent.press(screen.getByTestId('audio-play-pause'))
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled())
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0)
  })

  it('resumes a paused track where it stopped', async () => {
    mockStatus = { ...mockStatus, playing: false, didJustFinish: false, currentTime: 50 }
    renderPlayer()
    fireEvent.press(screen.getByTestId('audio-play-pause'))
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled())
    expect(mockPlayer.seekTo).not.toHaveBeenCalled()
  })
})
