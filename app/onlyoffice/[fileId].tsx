import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useClient, useQuery } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { fileByIdQuery, fileByIdQueryAs } from '@/client/queries'

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

const buildDriveOnlyOfficeUrl = (stackUri: string, fileId: string, sessionCode: string): string => {
  const url = new URL(stackUri)
  const [instance, ...rest] = url.host.split('.')
  const driveHost = `${instance}-drive.${rest.join('.')}`
  const params = new URLSearchParams({ session_code: sessionCode })
  return `${url.protocol}//${driveHost}/?${params.toString()}#/onlyoffice/${encodeURIComponent(fileId)}`
}

interface SessionCodeResponse {
  session_code?: string
}

export default function OnlyOfficeScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { fileId } = useLocalSearchParams<{ fileId: string }>()
  const client = useClient()
  const [editorUrl, setEditorUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const fileLookup = useQuery(fileByIdQuery(fileId ?? ''), {
    as: fileByIdQueryAs(fileId ?? ''),
    enabled: !!fileId
  })
  const lookupData = fileLookup.data
  const lookupDoc = Array.isArray(lookupData) ? lookupData[0] : lookupData
  const fileName = (lookupDoc as { name?: string } | null | undefined)?.name

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!client || !fileId) return
      try {
        const stackClient = client.getStackClient()
        const stackUri = stackClient.uri as string
        let sessionCode: string | undefined
        const fetchSessionCode = (
          stackClient as unknown as { fetchSessionCode?: () => Promise<SessionCodeResponse> }
        ).fetchSessionCode
        if (typeof fetchSessionCode === 'function') {
          const resp = await fetchSessionCode.call(stackClient)
          sessionCode = resp?.session_code
        }
        if (!sessionCode) throw new Error('Could not obtain session code from cozy stack')

        const url = buildDriveOnlyOfficeUrl(stackUri, fileId, sessionCode)
        console.log('[OnlyOfficeScreen] editorUrl', url)
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
  }, [client, fileId, reloadTick])

  return (
    <ScreenContainer>
      <AppBar title={fileName ?? t('drive.onlyoffice.title')} onBack={() => router.back()} />
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
          onMessage={event => {
            console.log('[OnlyOfficeScreen] webview message', event.nativeEvent.data)
          }}
          onError={syntheticEvent => {
            console.error('[OnlyOfficeScreen] webview error', syntheticEvent.nativeEvent)
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
