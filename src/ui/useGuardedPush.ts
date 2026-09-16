import { useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'

type Push = ReturnType<typeof useRouter>['push']
type Href = Parameters<Push>[0]

/** How long the same destination is ignored after a push. */
const REPEAT_WINDOW_MS = 700

/**
 * router.push that drops a repeat of the destination it just pushed.
 *
 * The lists push on every tap, and the JS thread can stall long enough for a
 * user to tap a row several times before the first navigation renders: each
 * tap then stacked another copy of the same folder, needing as many backs to
 * get out.
 */
export const useGuardedPush = (): ((href: Href) => void) => {
  const router = useRouter()
  const last = useRef<{ href: string; at: number } | null>(null)

  return useCallback(
    (href: Href) => {
      const key = typeof href === 'string' ? href : JSON.stringify(href)
      const now = Date.now()
      if (last.current && last.current.href === key && now - last.current.at < REPEAT_WINDOW_MS) {
        return
      }
      last.current = { href: key, at: now }
      router.push(href)
    },
    [router]
  )
}
