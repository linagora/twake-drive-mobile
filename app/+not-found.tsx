import React from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/ui/ErrorState'

export default function NotFound() {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <ErrorState
      message={t('errors.linkNotFound')}
      retryLabel={t('errors.backToDrive')}
      onRetry={() => router.dismissTo('/(drive)/files')}
    />
  )
}
