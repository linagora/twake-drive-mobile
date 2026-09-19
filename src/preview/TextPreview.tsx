import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

import { StreamSource } from '@/files/streamUrl'
import { cozyTokens } from '@/ui/theme'
import { ErrorOverlay, LoadingOverlay } from './PreviewOverlays'

const TEXT_MAX_BYTES = 1_000_000

export const TextPreview = ({ source }: { source: StreamSource }): React.ReactElement => {
  const theme = useTheme()
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const resp = await fetch(source.uri, {
          headers: { ...source.headers, Range: `bytes=0-${TEXT_MAX_BYTES - 1}` }
        })
        if (!resp.ok && resp.status !== 206) throw new Error(`HTTP ${resp.status}`)
        const text = await resp.text()
        if (cancelled) return
        const totalHeader = resp.headers.get('Content-Range')
        if (totalHeader) {
          const total = Number(totalHeader.split('/')[1])
          if (Number.isFinite(total) && total > text.length) setTruncated(true)
        }
        setContent(text)
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? 'Fetch error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source.uri, source.headers])

  if (error) return <ErrorOverlay message={error} />
  if (content === null) return <LoadingOverlay />
  return (
    <ScrollView style={[styles.scroll, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.text, { color: theme.colors.onBackground }]} selectable>
        {content}
      </Text>
      {truncated ? (
        <Text style={[styles.truncated, { color: theme.colors.onSurfaceVariant }]}>
          … (truncated)
        </Text>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, padding: cozyTokens.spacing.md },
  text: { fontFamily: 'Menlo', fontSize: 13, lineHeight: 18 },
  truncated: { fontStyle: 'italic', marginTop: cozyTokens.spacing.md, textAlign: 'center' }
})
