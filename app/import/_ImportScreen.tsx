import React, { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { FolderPicker } from '@/ui/FolderPicker'
import { ROOT_DIR_ID } from '@/client/queries'

import { useImportContext } from './_layout'

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

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back()
  }, [router])

  const currentFolderId =
    pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : ROOT_DIR_ID

  return (
    <FolderPicker
      currentFolderId={currentFolderId}
      excludeIds={new Set<string>()}
      confirmLabel={t('drive.import.confirm')}
      isBusy={ctx.isBusy}
      isAtRoot={pathSegments.length === 0}
      onDrillIn={onDrillIn}
      onBack={onBack}
      onConfirm={ctx.onConfirm}
      onCancel={ctx.onCancel}
    />
  )
}
