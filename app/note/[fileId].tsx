import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { EditorHeader } from '@/ui/EditorHeader'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { fileByIdQuery, fileByIdQueryAs } from '@/client/queries'
import { buildCozyAppUrl } from '@/files/cozyAppLink'
import { useSessionCode } from '@/auth/useSessionCode'
import { HIDE_COZY_BAR } from '@/files/webviewInject'

// Mirrors twake-drive web's "note" file-type routing: open the cozy `notes`
// web app inside a WebView with a session_code so the notes editor renders
// already authenticated. The hash `/n/<fileId>` is the notes app route for a
// single document, identical to what computePath returns for `type === 'note'`.

export default function CozyNoteScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>()
  const client = useClient()
  const router = useRouter()
  const fetchSessionCode = useSessionCode()
  const [editorUrl, setEditorUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
    as: fileByIdQueryAs(fileId ?? ''),
    enabled: !!fileId
  })
  const doc = Array.isArray(fileLookup.data) ? fileLookup.data[0] : fileLookup.data
  const documentTitle = (doc as { name?: string })?.name ?? ''

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!client || !fileId) return
      try {
        const stackUri = client.getStackClient().uri as string
        const sessionCode = await fetchSessionCode()
        const url = buildCozyAppUrl(stackUri, 'notes', sessionCode, `/n/${fileId}`)
        console.log('[CozyNoteScreen] editorUrl', url)
        if (!cancelled) setEditorUrl(url)
      } catch (e) {
        console.error('[CozyNoteScreen] failed', e)
        if (!cancelled) setError((e as Error).message ?? 'Failed to load')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, fileId, reloadTick, fetchSessionCode])

  return (
    <ScreenContainer>
      <EditorHeader
        title={documentTitle}
        onBack={() => router.back()}
        onShare={() => router.push(`/share/${fileId}`)}
      />
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            setEditorUrl(null)
            setReloadTick(t => t + 1)
          }}
        />
      ) : !editorUrl ? (
        <LoadingState />
      ) : (
        <WebView
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          sharedCookiesEnabled
          source={{ uri: editorUrl }}
          style={styles.webview}
          injectedJavaScriptBeforeContentLoaded={HIDE_COZY_BAR}
          injectedJavaScript={HIDE_COZY_BAR}
          onMessage={event => {
            console.log('[CozyNoteScreen] webview message', event.nativeEvent.data)
          }}
          onError={syntheticEvent => {
            console.error('[CozyNoteScreen] webview error', syntheticEvent.nativeEvent)
          }}
        />
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 }
})
