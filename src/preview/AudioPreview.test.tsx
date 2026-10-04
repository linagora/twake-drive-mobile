import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import '@/i18n'

const mockPlayer = { play: jest.fn(), pause: jest.fn() }
let mockStatus = { isLoaded: true, playing: false, duration: 200, currentTime: 50 }

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
  })

  // The player's only control is an icon: without a label it is announced as
  // an anonymous button, and nothing says whether it plays or pauses.
  it('names the play button after what it does', () => {
    mockStatus = { ...mockStatus, playing: false }
    renderPlayer()
    const button = screen.getByTestId('audio-play-pause')
    expect(button.props.accessibilityLabel).toBe('Lire')
    fireEvent.press(button)
    expect(mockPlayer.play).toHaveBeenCalled()
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
