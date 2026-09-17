import { useCallback, useMemo } from 'react'
import { Linking } from 'react-native'
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes'

import { isInstanceUrl, instanceOriginWhitelist } from '@/files/cozyAppLink'

/**
 * Navigation policy for the editor WebViews (Notes, OnlyOffice).
 *
 * These WebViews are loaded with a session_code, so whatever they navigate to
 * inherits an authenticated context. They shipped with `originWhitelist={['*']}`
 * and no request guard, which let a link inside a document steer that
 * authenticated view anywhere.
 *
 * The allowed set is NOT "the signed-in instance": a document opened from a
 * sharing lives on the owner's instance, so the guard is bound to whichever
 * instances the caller says this document may legitimately use. Pass the stack
 * URI the editor URL was built from — plus the user's own instance when they
 * differ — so the policy follows the document rather than the session.
 *
 * Sub-frames are allowed through: OnlyOffice renders its editor in an iframe
 * pointing at the document server, which is legitimately a different host, and
 * the same-origin policy already keeps it away from the parent's session.
 */
export const useEditorNavigationGuard = (
  allowedStackUris: (string | null | undefined)[]
): {
  originWhitelist: string[]
  onShouldStartLoadWithRequest: (request: ShouldStartLoadRequest) => boolean
} => {
  // Keyed on the joined value rather than the array identity: callers build the
  // list inline, so a fresh array every render would hand the WebView a new
  // request handler on each pass.
  const key = allowedStackUris.filter((u): u is string => !!u).join('|')
  const stackUris = useMemo(() => (key ? key.split('|') : []), [key])

  const originWhitelist = useMemo(
    () => Array.from(new Set(stackUris.flatMap(instanceOriginWhitelist))),
    [stackUris]
  )

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest): boolean => {
      if (stackUris.length === 0) return false
      // about:blank is how the WebView starts and how editors bootstrap frames.
      if (request.url === 'about:blank') return true
      if (!request.isTopFrame) return true
      if (stackUris.some(uri => isInstanceUrl(uri, request.url))) return true
      void Linking.openURL(request.url).catch(() => {
        // A link the OS cannot open is simply not followed.
      })
      return false
    },
    [stackUris]
  )

  return { originWhitelist, onShouldStartLoadWithRequest }
}
