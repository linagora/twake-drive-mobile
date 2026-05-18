import React, { useEffect, useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
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
  const { claim, release } = usePiPSession()
  const player = useVideoPlayer({ uri: source.uri, headers: source.headers }, p => {
    p.loop = false
    p.staysActiveInBackground = true
    p.play()
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    claim(fileId, source)
    return () => release()
  }, [fileId, source, claim, release])

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
          // dismissed first.
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
