// iOS AVPlayer (and therefore expo-audio) refuses to parse an Ogg container,
// even when the codec inside is Opus — which iOS would otherwise decode
// natively. Same for Vorbis. This helper flags those files so the preview
// route can render an "open externally" fallback instead of an audio player
// that never starts.
//
// Long-term fix is a server-side remux (Ogg → CAF/m4a); see docs/TODO.md.

const UNSUPPORTED_MIMES = new Set([
  'audio/ogg',
  'audio/x-ogg',
  'audio/ogg-opus',
  'audio/vorbis',
  'audio/x-vorbis',
  'audio/x-vorbis+ogg'
])

const UNSUPPORTED_EXTENSIONS = ['.ogg', '.oga', '.ogv']

export const isUnsupportedAudio = (
  mime: string | null | undefined,
  name: string | null | undefined
): boolean => {
  if (mime && UNSUPPORTED_MIMES.has(mime.toLowerCase())) return true
  if (name) {
    const lower = name.toLowerCase()
    if (UNSUPPORTED_EXTENSIONS.some(ext => lower.endsWith(ext))) return true
  }
  return false
}
