import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Snackbar } from 'react-native-paper'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClient, useQuery } from 'cozy-client'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { ErrorState } from '@/ui/ErrorState'
import { FolderPicker, FolderPickerSelection } from '@/ui/FolderPicker'
import { moveEntry, MoveEntryTarget } from '@/files/moveEntry'
import { fileByIdQuery, fileByIdQueryAs, FileQueryResult } from '@/client/queries'

// Match the metadata route's snackbar-dismiss delay so the success
// message has time to be visible before the modal slides down.
const SNACKBAR_DISMISS_DELAY_MS = 600

export default function MoveRoute() {
  const router = useRouter()
  const { t } = useTranslation()
  const client = useClient()
  const { ids } = useLocalSearchParams<{ ids: string }>()
  const idList = useMemo(() => (ids ? ids.split(',').filter(Boolean) : []), [ids])
  const firstId = idList[0] ?? ''

  const firstLookup = useQuery(fileByIdQuery(firstId), {
    as: fileByIdQueryAs(firstId),
    enabled: !!firstId
  })
  const rawFirstDoc = (Array.isArray(firstLookup.data) ? firstLookup.data[0] : firstLookup.data) as
    | FileQueryResult
    | null
    | undefined

  // Persist the first successfully-loaded doc so that a stale re-render
  // (e.g. after a move error) does not flash the error state while the
  // document is still logically known.
  const firstDocRef = useRef<FileQueryResult | null>(null)
  if (rawFirstDoc) firstDocRef.current = rawFirstDoc
  const firstDoc = firstDocRef.current ?? rawFirstDoc

  const [busy, setBusy] = useState(false)
  const [snackbar, setSnackbar] = useState<string | null>(null)

  const close = useCallback((): void => {
    if (router.canGoBack()) router.back()
  }, [router])

  const onConfirm = useCallback(
    async (dest: FolderPickerSelection): Promise<void> => {
      if (!client || !firstDoc) return
      setBusy(true)
      setSnackbar(null)
      try {
        // Sequential, not parallel: cozy-stack can race on concurrent
        // dir_id mutations and we want to surface any single failure.
        // Mirrors the existing confirmBulkDelete pattern in
        // app/(drive)/files/[...path].tsx.
        for (const id of idList) {
          // Build a minimal target. The full entry doc is fetched on
          // demand only for the first one (above); other ids may be in
          // cozy-client's cache from the source list, but to keep this
          // simple we pass only the bits moveEntry needs.
          const target: MoveEntryTarget = {
            _id: id,
            name: id === firstDoc._id ? firstDoc.name : '',
            type: id === firstDoc._id ? (firstDoc.type ?? 'file') : 'file',
            dir_id: firstDoc.dir_id ?? ''
          }
          await moveEntry(client, target, dest._id, { force: true })
        }
        const successKey =
          idList.length > 1
            ? 'drive.move.successBulk'
            : firstDoc.type === 'directory'
              ? 'drive.move.successFolder'
              : 'drive.move.successFile'
        setSnackbar(t(successKey, { count: idList.length }))
        setTimeout(close, SNACKBAR_DISMISS_DELAY_MS)
      } catch (e) {
        console.error('[MoveRoute] move failed', e)
        setSnackbar(t('drive.move.errorGeneric'))
      } finally {
        setBusy(false)
      }
    },
    [client, firstDoc, idList, t, close]
  )

  if (firstLookup.fetchStatus === 'loading' && !firstDoc) {
    return (
      <ScreenContainer>
        <LoadingState />
      </ScreenContainer>
    )
  }

  if (!firstDoc) {
    return (
      <ScreenContainer>
        <ErrorState message={t('drive.preview.loadFailed')} onRetry={() => firstLookup.fetch()} />
      </ScreenContainer>
    )
  }

  const sourceDirId = firstDoc.dir_id ?? ''
  const excludeIds = new Set<string>([...idList])

  return (
    <>
      <FolderPicker
        initialFolderId={sourceDirId}
        excludeIds={excludeIds}
        confirmLabel={t('drive.move.action')}
        isBusy={busy}
        onConfirm={onConfirm}
        onCancel={close}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ''}
      </Snackbar>
    </>
  )
}
