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
  const { player, claim, release, setPictureInPicture, isPictureInPicture } = usePiPSession()
  // Read the current player status synchronously so the spinner doesn't
  // get stuck when we mount after the player is already loaded (e.g. on
  // PiP restore, where the player has been streaming for a while and the
  // statusChange event we'd otherwise listen for has long since fired).
  const [ready, setReady] = useState(() => player.status === 'readyToPlay')

  useEffect(() => {
    claim(fileId, source)
  }, [fileId, source, claim])

  // Leaving the preview stops the video, however it is left: the back control
  // or the sheet swiped away. Starting PiP also unmounts this view, on purpose
  // (router.back() below), and there the player must stay alive for the OS
  // layer — which is the one case this leaves alone.
  useEffect(
    () => () => {
      if (!isPictureInPicture()) release()
    },
    [release, isPictureInPicture]
  )

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
        // Bound to readiness: the controls appear when the view does and hide
        // themselves a few seconds later, which on a slow stream is before the
        // first frame is there. Enabling them on ready shows them over the
        // video instead of over a black rectangle the user has to tap.
        nativeControls={ready}
        onPictureInPictureStart={() => {
          setPictureInPicture(true)
          // Dismiss the page-sheet modal so iOS can detach PiP at system
          // level. AVPictureInPictureController cannot detach from a
          // presented page-sheet view controller — the parent must be
          // dismissed first. The player itself is owned by PiPSession
          // (root-level), so it survives this unmount.
          if (router.canGoBack()) router.back()
        }}
        onPictureInPictureStop={() => {
          setPictureInPicture(false)
          // KNOWN LIMITATION: tapping "restore" on the PiP window does
          // not bring the video back. expo-video does not expose iOS's
          // restoreUserInterfaceForPictureInPictureStop callback, so we
          // can't differentiate restore vs close and re-push reliably.
          // For now we always re-push: at least the close path lands
          // the user back on a preview (which they can dismiss).
          player.play()
          setTimeout(() => {
            router.push(`/preview/${fileId}`)
          }, 0)
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
