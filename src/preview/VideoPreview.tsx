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
  const { player, claim, release } = usePiPSession()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    claim(fileId, source)
    // Important: do NOT release on unmount. When PiP starts we router.back()
    // which unmounts this component, but the player must stay alive at the
    // session level for the OS PiP layer to keep playing. release() is called
    // explicitly when the user taps "close" on the PiP window
    // (onPictureInPictureStop with paused player), not from cleanup here.
  }, [fileId, source, claim])

  useEffect(() => {
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
          // expo-video does not distinguish PiP "restore" vs "close" in the
          // same callback. Heuristic: if the player is still playing, the
          // user tapped restore — re-open the preview route. If paused,
          // they tapped close — release the session.
          if (player.playing) {
            router.push(`/preview/${fileId}`)
          } else {
            release()
          }
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
