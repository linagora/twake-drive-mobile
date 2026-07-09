import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Snackbar } from 'react-native-paper'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'

import { moveEntry, MoveEntryTarget } from '@/files/moveEntry'
import { filesByIdsQuery, filesByIdsQueryAs, FileQueryResult } from '@/client/queries'

const SNACKBAR_DISMISS_DELAY_MS = 600

interface MoveContextValue {
  idList: string[]
  firstDoc: FileQueryResult | null
  isLoading: boolean
  hasError: boolean
  isBusy: boolean
  onConfirm: (dest: { _id: string; name: string }) => Promise<void>
  onCancel: () => void
  retry: () => void
}

const MoveContext = createContext<MoveContextValue | null>(null)

export const useMoveContext = (): MoveContextValue => {
  const ctx = useContext(MoveContext)
  if (!ctx) throw new Error('useMoveContext must be used inside MoveLayout')
  return ctx
}

export default function MoveLayout() {
  const { t } = useTranslation()
  const router = useRouter()
  const client = useClient()
  const { ids } = useLocalSearchParams<{ ids: string }>()
  const idList = useMemo(() => (ids ? ids.split(',').filter(Boolean) : []), [ids])
  const firstId = idList[0] ?? ''

  const allLookup = useQuery(filesByIdsQuery(idList), {
    as: filesByIdsQueryAs(idList),
    enabled: idList.length > 0
  })
  const docsRef = useRef<FileQueryResult[]>([])
  const rawDocs = Array.isArray(allLookup.data)
    ? allLookup.data
    : allLookup.data
      ? [allLookup.data]
      : []
  if (rawDocs.length) docsRef.current = rawDocs as FileQueryResult[]
  const docs = docsRef.current
  const docById = useMemo(() => {
    const m = new Map<string, FileQueryResult>()
    for (const d of docs) m.set(d._id, d)
    return m
  }, [docs])
  const firstDoc = docById.get(firstId) ?? null

  const [isBusy, setIsBusy] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  // Cancel/close: dismiss closes the pageSheet modal from any depth in the
  // nested stack. Falls back to back() if dismiss isn't available.
  const close = useCallback((): void => {
    type MaybeDismiss = { dismiss?: () => void; canDismiss?: () => boolean }
    const r = router as unknown as MaybeDismiss
    if (typeof r.dismiss === 'function' && r.canDismiss?.() !== false) {
      r.dismiss()
      return
    }
    if (router.canGoBack()) router.back()
  }, [router])

  const onConfirm = useCallback(
    async (dest: { _id: string; name: string }): Promise<void> => {
      if (!client || !firstDoc) return
      setIsBusy(true)
      setSnackbar(null)
      try {
        for (const id of idList) {
          const doc = docById.get(id)
          const target: MoveEntryTarget = {
            _id: id,
            name: doc?.name ?? '',
            type: (doc?.type as 'file' | 'directory') ?? 'file',
            dir_id: doc?.dir_id ?? firstDoc.dir_id ?? ''
          }
          await moveEntry(client, target, dest._id, { force: true })
        }
        const key =
          idList.length > 1
            ? 'drive.move.successBulk'
            : firstDoc.type === 'directory'
              ? 'drive.move.successFolder'
              : 'drive.move.successFile'
        setSnackbar(t(key, { count: idList.length }))
        setTimeout(close, SNACKBAR_DISMISS_DELAY_MS)
      } catch (e) {
        console.error('[MoveLayout] move failed', e)
        setSnackbar(t('drive.move.errorGeneric'))
      } finally {
        setIsBusy(false)
      }
    },
    [client, firstDoc, docById, idList, t, close]
  )

  const value = useMemo<MoveContextValue>(
    () => ({
      idList,
      firstDoc,
      isLoading: allLookup.fetchStatus === 'loading' && !firstDoc,
      hasError: !firstDoc && allLookup.fetchStatus !== 'loading',
      isBusy,
      onConfirm,
      onCancel: close,
      retry: () => allLookup.fetch()
    }),
    [idList, firstDoc, allLookup.fetchStatus, isBusy, onConfirm, close, allLookup]
  )

  return (
    <MoveContext.Provider value={value}>
      <Stack
        screenOptions={{
          headerShown: false,
          // Mirror the file-screen drill UX: enable the iOS native swipe-back
          // gesture. gestureEnabled is on by default but defaults to a small
          // edge-only zone; fullScreenGestureEnabled extends it to the whole
          // screen so it stays discoverable inside the page-sheet modal.
          gestureEnabled: true,
          fullScreenGestureEnabled: true
        }}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </MoveContext.Provider>
  )
}
