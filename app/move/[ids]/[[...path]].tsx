import React, { useCallback } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { ErrorState } from '@/ui/ErrorState'
import { FolderPicker } from '@/ui/FolderPicker'

import { useMoveContext } from './_layout'

export default function MoveScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{ ids: string; path?: string | string[] }>()
  const pathArr: string[] = Array.isArray(params.path)
    ? params.path.filter(Boolean)
    : params.path
      ? [params.path]
      : []
  const ctx = useMoveContext()

  const onDrillIn = useCallback(
    (item: { _id: string }) => {
      const segments = [...pathArr, item._id].filter(Boolean).join('/')
      router.push(`/move/${params.ids}/${segments}`)
    },
    [pathArr, params.ids, router]
  )

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back()
  }, [router])

  if (ctx.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState />
      </ScreenContainer>
    )
  }
  if (ctx.hasError || !ctx.firstDoc) {
    return (
      <ScreenContainer>
        <ErrorState message={t('drive.preview.loadFailed')} onRetry={ctx.retry} />
      </ScreenContainer>
    )
  }

  const sourceDirId = ctx.firstDoc.dir_id ?? ''
  const currentFolderId = pathArr.length > 0 ? pathArr[pathArr.length - 1] : sourceDirId
  const excludeIds = new Set<string>([...ctx.idList, sourceDirId].filter(Boolean))

  return (
    <FolderPicker
      currentFolderId={currentFolderId}
      excludeIds={excludeIds}
      confirmLabel={t('drive.move.action')}
      isBusy={ctx.isBusy}
      isAtRoot={pathArr.length === 0}
      onDrillIn={onDrillIn}
      onBack={onBack}
      onConfirm={ctx.onConfirm}
      onCancel={ctx.onCancel}
    />
  )
}
