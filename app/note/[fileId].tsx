import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { models, useClient } from 'cozy-client'

import { DocumentScreen } from '@/ui/DocumentScreen'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { buildCozyAppUrl } from '@/files/cozyAppLink'
import { useSessionCode } from '@/auth/useSessionCode'
import { useRefreshOnLeave } from '@/viewer/useRefreshOnLeave'

// Mirrors twake-drive web's "note" file-type routing: open the cozy `notes`
// web app inside a WebView with a session_code so the notes editor renders
// already authenticated. The hash `/n/<fileId>` is the notes app route for a
// single document, identical to what computePath returns for `type === 'note'`.

export default function CozyNoteScreen() {
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
        // A note of a shared drive is served by the owner instance: the stack
        // hands back its notes-app URL, with a sharecode, through the drive's
        // own open route.
        const url = driveId
          ? ((await (
              models as unknown as {
                note: {
                  fetchURL: (
                    c: typeof client,
                    f: { id: string },
                    o: { driveId: string }
                  ) => Promise<string>
                }
              }
            ).note.fetchURL(client, { id: fileId }, { driveId })) as string)
          : buildCozyAppUrl(
              client.getStackClient().uri as string,
              'notes',
              await fetchSessionCode(),
              `/n/${fileId}`
            )
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
            console.log('[CozyNoteScreen] webview message', event.nativeEvent.data)
          }}
          onError={syntheticEvent => {
            console.error('[CozyNoteScreen] webview error', syntheticEvent.nativeEvent)
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
