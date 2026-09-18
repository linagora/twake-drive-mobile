import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw } from '@excalidraw/excalidraw'

/**
 * The Excalidraw editor, bundled into the app and run in a local WebView.
 *
 * It is handed the scene over the bridge and hands its changes back; it never
 * receives a token, a cookie or a stack URL, so it works with no network and
 * cannot become an authentication channel.
 */
const post = message => {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message))
}

const App = () => {
  const [scene, setScene] = useState(null)
  const [viewMode, setViewMode] = useState(true)
  const apiRef = useRef(null)
  const lastSent = useRef('')

  useEffect(() => {
    const onMessage = event => {
      let payload
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (payload.type === 'scene') {
        const elements = payload.elements ?? []
        setScene({
          elements,
          appState: { ...(payload.appState ?? {}), collaborators: new Map() },
          files: payload.files ?? {}
        })
        setViewMode(!!payload.viewMode)
        post({ type: 'log', message: `scene received: ${elements.length} elements` })
        // The scene keeps the scroll position it was saved with, which is
        // rarely where the drawing is on a phone screen.
        setTimeout(() => {
          apiRef.current?.scrollToContent(elements, { fitToContent: true, animate: false })
        }, 50)
      }
      if (payload.type === 'setViewMode') setViewMode(!!payload.viewMode)
    }
    // iOS posts on window, Android on document.
    window.addEventListener('message', onMessage)
    document.addEventListener('message', onMessage)
    post({ type: 'ready' })
    return () => {
      window.removeEventListener('message', onMessage)
      document.removeEventListener('message', onMessage)
    }
  }, [])

  const onChange = useCallback((elements, appState, files) => {
    const payload = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'twake-drive-mobile',
      elements: elements.filter(element => !element.isDeleted),
      appState: {
        gridSize: appState.gridSize ?? null,
        viewBackgroundColor: appState.viewBackgroundColor
      },
      files: files ?? {}
    })
    // The editor fires on every pointer move; only a real change is worth
    // sending back, and the app debounces the save on its side.
    if (payload === lastSent.current) return
    lastSent.current = payload
    post({ type: 'change', scene: payload })
  }, [])

  if (!scene) return null

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Excalidraw
        initialData={scene}
        viewModeEnabled={viewMode}
        onChange={onChange}
        excalidrawAPI={api => {
          apiRef.current = api
        }}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }}
      />
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
