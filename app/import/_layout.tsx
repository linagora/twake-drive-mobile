import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Snackbar } from 'react-native-paper'
import { Stack, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { uploadBatch } from '@/share/uploadBatch'
import { usePendingShare } from '@/share/PendingShareProvider'
import type { SharedItem } from '@/files/uploadSharedFile'

const SNACKBAR_DISMISS_DELAY_MS = 600

interface ImportContextValue {
  items: SharedItem[]
  isBusy: boolean
  onConfirm: (dest: { _id: string; name: string }) => Promise<void>
  onCancel: () => void
}

const ImportContext = createContext<ImportContextValue | null>(null)
export const useImportContext = (): ImportContextValue => {
  const ctx = useContext(ImportContext)
  if (!ctx) throw new Error('useImportContext must be used inside ImportLayout')
  return ctx
}

export default function ImportLayout({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation()
  const router = useRouter()
  const client = useClient()
  const { items, clear } = usePendingShare()
  const [isBusy, setIsBusy] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const close = useCallback((): void => {
    type MaybeDismiss = { dismiss?: () => void; canDismiss?: () => boolean }
    const r = router as unknown as MaybeDismiss
    if (typeof r.dismiss === 'function' && r.canDismiss?.() !== false) {
      r.dismiss()
      return
    }
    if (router.canGoBack()) router.back()
  }, [router])

  // Declining the import must also drop the staged share — otherwise `pending`
  // stays populated and a later client/pending effect re-pop `/import` again.
  const onCancel = useCallback((): void => {
    clear()
    close()
  }, [clear, close])

  const onConfirm = useCallback(
    async (dest: { _id: string; name: string }): Promise<void> => {
      if (!client || items.length === 0) return
      setIsBusy(true)
      setSnackbar(null)
      try {
        const res = await uploadBatch(client, items, dest._id)
        if (res.failed > 0 && res.succeeded > 0) {
          setSnackbar(
            t('drive.import.partial', {
              succeeded: res.succeeded,
              total: res.results.length,
              failed: res.failed
            })
          )
        } else if (res.failed > 0) {
          setSnackbar(t('drive.import.errorGeneric'))
        } else {
          setSnackbar(
            res.succeeded > 1
              ? t('drive.import.successBulk', { count: res.succeeded })
              : t('drive.import.successFile')
          )
        }
        if (res.succeeded > 0) {
          clear()
          setTimeout(close, SNACKBAR_DISMISS_DELAY_MS)
        }
      } catch (e) {
        console.error('[ImportLayout] upload failed', e)
        setSnackbar(t('drive.import.errorGeneric'))
      } finally {
        setIsBusy(false)
      }
    },
    [client, items, t, close, clear]
  )

  const value = useMemo<ImportContextValue>(
    () => ({ items, isBusy, onConfirm, onCancel }),
    [items, isBusy, onConfirm, onCancel]
  )

  return (
    <ImportContext.Provider value={value}>
      {children ?? (
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            fullScreenGestureEnabled: true
          }}
        />
      )}
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </ImportContext.Provider>
  )
}
