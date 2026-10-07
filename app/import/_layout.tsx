import React, { useCallback, useMemo, useState } from 'react'
import { Snackbar } from 'react-native-paper'
import { Stack, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { uploadBatch } from '@/share/uploadBatch'
import { batchMessage, optimisticUploaded } from '@/share/importFeedback'
import { usePendingShare } from '@/share/PendingShareProvider'
import { ImportContext, ImportContextValue } from '@/drive/importContext'
import { closeSheet, SheetRouter } from '@/ui/closeSheet'

const SNACKBAR_DISMISS_DELAY_MS = 200

export default function ImportLayout({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation()
  const router = useRouter()
  const client = useClient()
  const { items, clear } = usePendingShare()
  const [isBusy, setIsBusy] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const close = useCallback((): void => {
    closeSheet(router as unknown as SheetRouter)
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
        optimisticUploaded(client, res, dest._id)
        setSnackbar(batchMessage(t, res))
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
