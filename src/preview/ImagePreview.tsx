import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { StreamSource } from '@/files/streamUrl'
import { ZoomableImage } from '@/ui/ZoomableImage'
import { ErrorOverlay, LoadingOverlay } from './PreviewOverlays'

interface Props {
  source: StreamSource
  thumbnailUrl: string | null
}

export const ImagePreview = ({ source, thumbnailUrl }: Props): React.ReactElement => {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <View style={styles.container}>
      <ZoomableImage
        uri={source.uri}
        headers={source.headers}
        placeholderUri={thumbnailUrl}
        onLoad={() => setLoaded(true)}
        onError={err => {
          console.error('[ImagePreview] image error', err)
          const e = err as { error?: string } | null
          setError(e?.error ?? 'Image error')
        }}
      />
      {error ? (
        <ErrorOverlay message={error} />
      ) : !loaded && !thumbnailUrl ? (
        <LoadingOverlay />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 }
})
