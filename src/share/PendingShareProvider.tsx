import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter, useSegments } from 'expo-router'

import { useAuth } from '@/auth/useAuth'
import { useIncomingShare } from '@/share/useIncomingShare'
import { textToSharedItem } from '@/share/textToFile'
import type { SharedItem } from '@/files/uploadSharedFile'

interface PendingShareValue {
  items: SharedItem[]
  clear: () => void
}
const PendingShareContext = createContext<PendingShareValue>({ items: [], clear: () => undefined })
export const usePendingShare = (): PendingShareValue => useContext(PendingShareContext)

export const PendingShareProvider = ({ children }: { children: React.ReactNode }) => {
  const { items: fileItems, text, hasShare, reset } = useIncomingShare()
  const { client } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const section = segments[0]
  const sectionRef = useRef(section)
  sectionRef.current = section
  const inApp = !!client && !!section && section !== '(auth)'
  const [pending, setPending] = useState<SharedItem[]>([])

  // Stage the incoming OS share into the pending list. Convert a shared
  // text/URL into a .txt file so it flows through the same upload path.
  useEffect(() => {
    if (!hasShare) return
    let cancelled = false
    void (async () => {
      const extra = text ? [await textToSharedItem(text)] : []
      if (cancelled) return
      const all = [...fileItems, ...extra]
      if (all.length > 0) setPending(all)
      reset()
    })()
    return () => {
      cancelled = true
    }
  }, [hasShare, fileItems, text, reset])

  // Open the picker once we have pending items AND an authenticated client.
  // While unauthenticated the items wait here. The push waits until the auth
  // screens are gone too: right after a login they are still redirecting to
  // the drive, and a push issued meanwhile is swallowed by that redirect while
  // the items stay staged. Already on the picker, the new items replace the
  // old ones in place.
  useEffect(() => {
    if (pending.length === 0 || !inApp || sectionRef.current === 'import') return
    router.push('/import')
  }, [pending, inApp, router])

  const clear = useCallback(() => setPending([]), [])
  return (
    <PendingShareContext.Provider value={{ items: pending, clear }}>
      {children}
    </PendingShareContext.Provider>
  )
}
