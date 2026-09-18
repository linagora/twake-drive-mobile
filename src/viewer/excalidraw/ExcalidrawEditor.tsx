import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView, WebViewMessageEvent } from 'react-native-webview'
import { Asset } from 'expo-asset'

import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'

// Built by `npm run build:excalidraw` from the pinned @excalidraw/excalidraw:
// one HTML file with the editor inside, so the WebView has nothing to fetch.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EDITOR_ASSET = require('../../../assets/webviewer/excalidraw.html') as number

export interface ExcalidrawEditorProps {
  /** The `.excalidraw` file as it was downloaded. */
  content: string
  /** Whether the drawing can be changed, or only looked at. */
  editable?: boolean
  /** Called with the whole scene, as a `.excalidraw` document, on every edit. */
  onChange?: (scene: string) => void
  testID?: string
}

interface BridgeMessage {
  type: 'ready' | 'change' | 'log'
  scene?: string
  message?: string
}

// The editor runs in its own JavaScript world: without this, anything it logs
// or throws is invisible from the app.
const FORWARD_CONSOLE = `
  (function () {
    var post = function (level, args) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'log', message: level + ': ' + Array.from(args).map(String).join(' ') })
        )
      } catch (e) {}
    }
    var error = console.error
    console.error = function () { post('error', arguments); error.apply(console, arguments) }
    window.addEventListener('error', function (event) { post('error', [event.message]) })
    window.addEventListener('unhandledrejection', function (event) {
      post('error', ['unhandled rejection: ' + event.reason])
    })
    true;
  })();
`

/**
 * The Excalidraw editor itself, running in a local WebView.
 *
 * The scene travels over the bridge and comes back changed; the WebView is
 * handed no token, no cookie and no stack URL, so it works with no network and
 * cannot become an authentication channel.
 */
export const ExcalidrawEditor = ({
  content,
  editable = false,
  onChange,
  testID
}: ExcalidrawEditorProps): React.ReactElement => {
  const webViewRef = useRef<WebView>(null)
  const [uri, setUri] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Asset.fromModule(EDITOR_ASSET)
      .downloadAsync()
      .then(asset => {
        if (!cancelled) setUri(asset.localUri ?? asset.uri)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sendScene = useCallback(() => {
    let scene: { elements?: unknown; appState?: unknown; files?: unknown } = {}
    try {
      scene = JSON.parse(content) as typeof scene
    } catch {
      scene = {}
    }
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: 'scene',
        elements: scene.elements ?? [],
        appState: scene.appState ?? {},
        files: scene.files ?? {},
        viewMode: !editable
      })
    )
  }, [content, editable])

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: BridgeMessage
      try {
        message = JSON.parse(event.nativeEvent.data) as BridgeMessage
      } catch {
        return
      }
      if (message.type === 'log') {
        console.log('[ExcalidrawEditor][webview]', message.message)
        return
      }
      if (message.type === 'ready') sendScene()
      if (message.type === 'change' && message.scene) onChange?.(message.scene)
    },
    [onChange, sendScene]
  )

  if (failed) return <ErrorState message="drive.preview.loadFailed" />
  if (!uri) return <LoadingState />

  return (
    <View style={styles.container} testID={testID}>
      <WebView
        ref={webViewRef}
        source={{ uri }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={FORWARD_CONSOLE}
        onMessage={onMessage}
        style={styles.webview}
        onError={event => {
          console.error('[ExcalidrawEditor] webview error', event.nativeEvent)
          setFailed(true)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' }
})
