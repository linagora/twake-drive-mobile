import React, { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ScreenContainer } from '@/ui/ScreenContainer'
import { LoadingState } from '@/ui/LoadingState'
import { ErrorState } from '@/ui/ErrorState'
import { FolderPicker } from '@/ui/FolderPicker'
import { previousFolderId } from '@/ui/FolderPicker/upNavigation'

import { useMoveContext } from '@/drive/moveContext'

interface Props {
  pathSegments: string[]
}

export const MoveScreen = ({ pathSegments }: Props): React.ReactElement => {
  const { t } = useTranslation()
  const router = useRouter()
  const ctx = useMoveContext()

  const onDrillIn = useCallback(
    (item: { _id: string }) => {
      const segments = [...pathSegments, item._id].filter(Boolean)
      const ids = ctx.idList.join(',')
      router.push(`/move/${ids}/${segments.join('/')}`)
    },
    [pathSegments, ctx.idList, router]
  )

  const sourceDirId = ctx.firstDoc?.dir_id ?? ''

  const onNavigateUp = useCallback(
    (parentId: string) => {
      if (previousFolderId(pathSegments, sourceDirId) === parentId && router.canGoBack()) {
        router.back()
        return
      }
      const ids = ctx.idList.join(',')
      router.push(`/move/${ids}/${[...pathSegments, parentId].join('/')}`)
    },
    [pathSegments, sourceDirId, ctx.idList, router]
  )

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

  const currentFolderId =
    pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : sourceDirId
  const excludeIds = new Set<string>([...ctx.idList, sourceDirId].filter(Boolean))

  return (
    <FolderPicker
      currentFolderId={currentFolderId}
      excludeIds={excludeIds}
      confirmLabel={t('drive.move.action')}
      isBusy={ctx.isBusy}
      onDrillIn={onDrillIn}
      onNavigateUp={onNavigateUp}
      onConfirm={ctx.onConfirm}
      onCancel={ctx.onCancel}
    />
  )
}
