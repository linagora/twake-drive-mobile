import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient } from 'cozy-client'

import { DocumentScreen } from '@/ui/DocumentScreen'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { useSessionCode } from '@/auth/useSessionCode'
import { useRefreshOnLeave } from '@/viewer/useRefreshOnLeave'

// TODO(backend): cozy-stack returns 403 Forbidden on `GET /office/{id}/open`
// for OAuth clients of kind=mobile. The endpoint is currently restricted to the
// registered drive web app, which forces this workaround: we generate a
// session_code on the stack and load the drive web app's onlyoffice route in a
// WebView, delegating the entire OnlyOffice editor flow (config, save, realtime)
// to the web app.
//
// The proper fix is server-side: allow OAuth clients with the right scope
// (e.g. `io.cozy.files`) to call /office/{id}/open directly so we can render
// the editor with our own native chrome. Once the stack permits it, replace
// this WebView delegate with a direct API call returning {url, document,
// editor, token, documentType} that we pass into the OnlyOffice DocsAPI in a
// minimal HTML wrapper (see git history for the previous implementation).

const buildDriveOnlyOfficeUrl = (
  stackUri: string,
  fileId: string,
  sessionCode: string,
  driveId?: string
): string => {
  const url = new URL(stackUri)
  const [instance, ...rest] = url.host.split('.')
  const driveHost = `${instance}-drive.${rest.join('.')}`
  const params = new URLSearchParams({ session_code: sessionCode })
  // The web app takes the drive in the route itself: #/onlyoffice/:driveId/:fileId.
  const path = driveId
    ? `/onlyoffice/${encodeURIComponent(driveId)}/${encodeURIComponent(fileId)}`
    : `/onlyoffice/${encodeURIComponent(fileId)}`
  return `${url.protocol}//${driveHost}/?${params.toString()}#${path}`
}

export default function OnlyOfficeScreen() {
  const { fileId, driveId } = useLocalSearchParams<{ fileId: string; driveId?: string }>()
  useRefreshOnLeave(fileId, driveId)
  const client = useClient()
  const router = useRouter()
  const fetchSessionCode = useSessionCode()
  const [editorUrl, setEditorUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!client || !fileId) return
      try {
        const stackUri = client.getStackClient().uri as string
        const sessionCode = await fetchSessionCode()
        const url = buildDriveOnlyOfficeUrl(stackUri, fileId, sessionCode, driveId)
        if (!cancelled) setEditorUrl(url)
      } catch (e) {
        console.error('[OnlyOfficeScreen] failed', e)
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
          source={{ uri: editorUrl }}
          style={styles.webview}
          onMessage={event => {
            console.log('[OnlyOfficeScreen] webview message', event.nativeEvent.data)
          }}
          onError={syntheticEvent => {
            console.error('[OnlyOfficeScreen] webview error', syntheticEvent.nativeEvent)
          }}
        />
      )}
    </DocumentScreen>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 }
})
