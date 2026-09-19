import React, { useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import Pdf from 'react-native-pdf'

import { StreamSource } from '@/files/streamUrl'
import { cozyTokens } from '@/ui/theme'
import { ErrorOverlay, LoadingOverlay } from './PreviewOverlays'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface Props {
  source: StreamSource
  thumbnailUrl: string | null
}

export const PdfPreview = ({ source, thumbnailUrl }: Props): React.ReactElement => {
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  return (
    <View style={styles.container}>
      {thumbnailUrl && !loaded ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
        />
      ) : null}
      <Pdf
        source={{ uri: source.uri, headers: source.headers, cache: true }}
        trustAllCerts={false}
        enableDoubleTapZoom
        minScale={1}
        maxScale={3}
        style={[styles.pdf, !loaded && styles.transparent]}
        onLoadProgress={p => setProgress(p)}
        onLoadComplete={() => setLoaded(true)}
        onError={err => {
          console.error('[PdfPreview] pdf error', err)
          setError(typeof err === 'string' ? err : ((err as Error)?.message ?? 'PDF error'))
        }}
      />
      {error ? (
        <ErrorOverlay message={error} />
      ) : !loaded ? (
        <LoadingOverlay progress={progress} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: { flex: 1, width: SCREEN_WIDTH, backgroundColor: cozyTokens.canvas.background },
  transparent: { backgroundColor: 'transparent' }
})
