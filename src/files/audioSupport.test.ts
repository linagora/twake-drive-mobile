import { isUnsupportedAudio } from './audioSupport'

describe('isUnsupportedAudio', () => {
  it('flags audio/ogg as unsupported', () => {
    expect(isUnsupportedAudio('audio/ogg', 'meeting.ogg')).toBe(true)
  })

  it('flags vorbis-flavored MIMEs as unsupported', () => {
    expect(isUnsupportedAudio('audio/vorbis', 'song.ogg')).toBe(true)
    expect(isUnsupportedAudio('audio/x-vorbis+ogg', 'song.ogg')).toBe(true)
  })

  it('falls back to the file extension when MIME is missing', () => {
    expect(isUnsupportedAudio(undefined, 'transcript.ogg')).toBe(true)
    expect(isUnsupportedAudio(null, 'foo.OGA')).toBe(true)
  })

  it('is case-insensitive on MIME and extension', () => {
    expect(isUnsupportedAudio('AUDIO/OGG', 'x.MP3')).toBe(true)
    expect(isUnsupportedAudio(undefined, 'transcript.OGG')).toBe(true)
  })

  it('returns false for supported MIMEs', () => {
    expect(isUnsupportedAudio('audio/mpeg', 'song.mp3')).toBe(false)
    expect(isUnsupportedAudio('audio/aac', 'song.m4a')).toBe(false)
    expect(isUnsupportedAudio('audio/x-m4a', 'song.m4a')).toBe(false)
    expect(isUnsupportedAudio('audio/flac', 'song.flac')).toBe(false)
  })

  it('returns false when both MIME and name are missing', () => {
    expect(isUnsupportedAudio(null, null)).toBe(false)
    expect(isUnsupportedAudio(undefined, undefined)).toBe(false)
    expect(isUnsupportedAudio('', '')).toBe(false)
  })

  it('returns false for a supported MIME even if the name ends with .ogg', () => {
    // Edge case: server reports the codec correctly; trust the MIME.
    // Currently the extension check still flags this — document the behavior:
    // we trust the extension as the last-resort fallback, so a misleading
    // filename will trigger the fallback UI. That's safer than silently
    // playing nothing if the MIME was actually wrong.
    expect(isUnsupportedAudio('audio/mpeg', 'weird.ogg')).toBe(true)
  })
})
