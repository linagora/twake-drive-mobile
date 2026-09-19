import React, { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { FolderPicker } from '@/ui/FolderPicker'
import { previousFolderId } from '@/ui/FolderPicker/upNavigation'
import { ROOT_DIR_ID } from '@/client/queries'

import { useImportContext } from '@/drive/importContext'

interface Props {
  pathSegments: string[]
}

export const ImportScreen = ({ pathSegments }: Props): React.ReactElement => {
  const { t } = useTranslation()
  const router = useRouter()
  const ctx = useImportContext()

  const onDrillIn = useCallback(
    (item: { _id: string }) => {
      const segments = [...pathSegments, item._id].filter(Boolean)
      router.push(`/import/${segments.join('/')}`)
    },
    [pathSegments, router]
  )

  const onNavigateUp = useCallback(
    (parentId: string) => {
      if (previousFolderId(pathSegments, ROOT_DIR_ID) === parentId && router.canGoBack()) {
        router.back()
        return
      }
      router.push(`/import/${[...pathSegments, parentId].join('/')}`)
    },
    [pathSegments, router]
  )

  const currentFolderId =
    pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : ROOT_DIR_ID

  return (
    <FolderPicker
      currentFolderId={currentFolderId}
      excludeIds={new Set<string>()}
      confirmLabel={t('drive.import.confirm')}
      isBusy={ctx.isBusy}
      onDrillIn={onDrillIn}
      onNavigateUp={onNavigateUp}
      onConfirm={ctx.onConfirm}
      onCancel={ctx.onCancel}
    />
  )
}
