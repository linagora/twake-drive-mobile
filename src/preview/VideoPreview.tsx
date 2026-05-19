import React, { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { VideoView } from 'expo-video'
import { ActivityIndicator } from 'react-native-paper'

import type { StreamSource } from '@/files/streamUrl'
import { usePiPSession } from './PiPSession'

interface VideoPreviewProps {
  fileId: string
  source: StreamSource
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export const VideoPreview = ({ fileId, source }: VideoPreviewProps): React.ReactElement => {
  const router = useRouter()
  const { player, claim } = usePiPSession()
  // Read the current player status synchronously so the spinner doesn't
  // get stuck when we mount after the player is already loaded (e.g. on
  // PiP restore, where the player has been streaming for a while and the
  // statusChange event we'd otherwise listen for has long since fired).
  const [ready, setReady] = useState(() => player.status === 'readyToPlay')

  useEffect(() => {
    claim(fileId, source)
    // Important: do NOT release on unmount. When PiP starts we router.back()
    // which unmounts this component, but the player must stay alive at the
    // session level for the OS PiP layer to keep playing.
  }, [fileId, source, claim])

  useEffect(() => {
    if (player.status === 'readyToPlay') setReady(true)
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setReady(true)
    })
    return () => sub.remove()
  }, [player])

  return (
    <View style={styles.viewerContainer}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        nativeControls
        onPictureInPictureStart={() => {
          // Dismiss the page-sheet modal so iOS can detach PiP at system
          // level. AVPictureInPictureController cannot detach from a
          // presented page-sheet view controller — the parent must be
          // dismissed first. The player itself is owned by PiPSession
          // (root-level), so it survives this unmount.
          if (router.canGoBack()) router.back()
        }}
        onPictureInPictureStop={() => {
          // Always re-push the preview modal on PiP stop, regardless of
          // whether the user tapped "restore" or "close": expo-video
          // gives us no reliable signal to differentiate (iOS pauses the
          // player on both paths just before this fires, so any
          // player-state heuristic is unreliable). If the user wanted to
          // close, they can swipe the reopened modal down — that's
          // milder UX friction than the previous "restore tap kills the
          // video" bug.
          router.push(`/preview/${fileId}`)
        }}
      />
      {!ready ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  viewerContainer: { flex: 1 },
  video: { flex: 1, width: SCREEN_WIDTH, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)'
  }
})
