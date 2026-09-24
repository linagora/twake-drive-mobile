import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useVideoPlayer, VideoPlayer } from 'expo-video'

import type { StreamSource } from '@/files/streamUrl'

export interface PiPSessionState {
  fileId: string
  source: StreamSource
}

export interface PiPSessionContextValue {
  active: PiPSessionState | null
  // The video player is owned at the root so it survives the preview
  // modal unmounting (e.g. on PiP start → router.back()). If the player
  // were created inside the route via useVideoPlayer, its cleanup would
  // release the underlying AVPlayer the moment the route unmounts, and
  // the iOS PiP layer would freeze. Hoisting the player here keeps it
  // alive for the whole app lifetime.
  player: VideoPlayer
  claim: (fileId: string, source: StreamSource) => void
  release: () => void
  /** Told by the player view when the OS takes the video into a PiP window. */
  setPictureInPicture: (inPictureInPicture: boolean) => void
  /** Read rather than watched: the answer is wanted at unmount, where a value
   *  captured on the last render would already be stale. */
  isPictureInPicture: () => boolean
}

export const PiPSessionContext = createContext<PiPSessionContextValue | null>(null)

export const PiPSessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [active, setActive] = useState<PiPSessionState | null>(null)
  const player = useVideoPlayer(null, p => {
    p.loop = false
    // Only a PiP window earns the right to keep playing once the app is no
    // longer in front. Left on for good, it turned "the view is gone" into
    // "the sound follows you around".
    p.staysActiveInBackground = false
  })
  const pictureInPicture = useRef(false)

  // Source swap is driven by `active`. Keeping it in a useEffect (rather
  // than inside claim) avoids touching the player from a render path.
  useEffect(() => {
    if (active) {
      player.replace({ uri: active.source.uri, headers: active.source.headers })
      player.play()
    } else {
      player.replace(null)
    }
  }, [active, player])

  const claim = useCallback((fileId: string, source: StreamSource): void => {
    setActive(prev => {
      if (prev && prev.fileId === fileId && prev.source.uri === source.uri) {
        return prev
      }
      return { fileId, source }
    })
  }, [])

  const release = useCallback((): void => {
    setActive(null)
  }, [])

  const setPictureInPicture = useCallback(
    (inPictureInPicture: boolean): void => {
      pictureInPicture.current = inPictureInPicture
      player.staysActiveInBackground = inPictureInPicture
    },
    [player]
  )

  const isPictureInPicture = useCallback((): boolean => pictureInPicture.current, [])

  const value = useMemo(
    () => ({ active, player, claim, release, setPictureInPicture, isPictureInPicture }),
    [active, player, claim, release, setPictureInPicture, isPictureInPicture]
  )

  return <PiPSessionContext.Provider value={value}>{children}</PiPSessionContext.Provider>
}

export const usePiPSession = (): PiPSessionContextValue => {
  const ctx = useContext(PiPSessionContext)
  if (!ctx) throw new Error('usePiPSession must be used inside <PiPSessionProvider>')
  return ctx
}
