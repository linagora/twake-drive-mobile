import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient } from 'cozy-client'

import { DocumentScreen } from '@/ui/DocumentScreen'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { useSessionCode } from '@/auth/useSessionCode'

// Reading a drawing is done by the app itself (src/viewer/excalidraw); editing
// is the drive web app's own excalidraw route, loaded with a session_code the
// same way the office editor is. The web app owns the editor, the saving and
// the conflicts, so the phone does not have a second implementation of any of
// it.
export const buildDriveExcalidrawUrl = (
  stackUri: string,
  fileId: string,
  sessionCode: string,
  driveId?: string
): string => {
  const url = new URL(stackUri)
  const [instance, ...rest] = url.host.split('.')
  const driveHost = `${instance}-drive.${rest.join('.')}`
  const params = new URLSearchParams({ session_code: sessionCode })
  const path = driveId
    ? `/excalidraw/${encodeURIComponent(driveId)}/${encodeURIComponent(fileId)}`
    : `/excalidraw/${encodeURIComponent(fileId)}`
  return `${url.protocol}//${driveHost}/?${params.toString()}#${path}`
}

export default function ExcalidrawScreen() {
  const { fileId, driveId } = useLocalSearchParams<{ fileId: string; driveId?: string }>()
  const client = useClient()
  const router = useRouter()
  const fetchSessionCode = useSessionCode()
  const [editorUrl, setEditorUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      if (!client || !fileId) return
      try {
        const stackUri = client.getStackClient().uri as string
        const sessionCode = await fetchSessionCode()
        const url = buildDriveExcalidrawUrl(stackUri, fileId, sessionCode, driveId)
        if (!cancelled) setEditorUrl(url)
      } catch (e) {
        console.error('[ExcalidrawScreen] failed', e)
        if (!cancelled) setError((e as Error).message ?? 'Failed to load')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, driveId, fileId, reloadTick, fetchSessionCode])

  return (
    <DocumentScreen onBack={() => router.back()} chrome="editor">
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            setEditorUrl(null)
            setReloadTick(tick => tick + 1)
          }}
        />
      ) : !editorUrl ? (
        <LoadingState />
      ) : (
        <WebView
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          source={{ uri: editorUrl }}
          style={styles.webview}
          onError={event => {
            console.error('[ExcalidrawScreen] webview error', event.nativeEvent)
          }}
        />
      )}
    </DocumentScreen>
  )
}

const styles = StyleSheet.create({
  webview: { flex: 1 }
})
