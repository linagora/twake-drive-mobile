import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'

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
  // While unauthenticated the items wait here; this effect re-runs when the
  // client becomes available (after login) and navigates then.
  useEffect(() => {
    if (pending.length === 0 || !client) return
    router.push('/import')
  }, [pending, client, router])

  const clear = useCallback(() => setPending([]), [])
  return (
    <PendingShareContext.Provider value={{ items: pending, clear }}>
      {children}
    </PendingShareContext.Provider>
  )
}
