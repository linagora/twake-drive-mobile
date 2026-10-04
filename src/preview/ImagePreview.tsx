import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { StreamSource } from '@/files/streamUrl'
import { ZoomableImage } from '@/ui/ZoomableImage'
import { ErrorOverlay, LoadingOverlay } from './PreviewOverlays'

interface Props {
  source: StreamSource
  thumbnailUrl: string | null
}

export const ImagePreview = ({ source, thumbnailUrl }: Props): React.ReactElement => {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <View style={styles.container}>
      <ZoomableImage
        testID="preview-image"
        uri={source.uri}
        headers={source.headers}
        placeholderUri={thumbnailUrl}
        onLoad={() => setLoaded(true)}
        onError={err => {
          console.error('[ImagePreview] image error', err)
          setError(t('drive.preview.loadFailed'))
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
