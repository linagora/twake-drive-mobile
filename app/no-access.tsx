import React from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { EmptyState } from '@/ui/EmptyState'
import { ScreenContainer } from '@/ui/ScreenContainer'

const NoAccessScreen = (): React.ReactElement => {
  const { t } = useTranslation()
  const router = useRouter()
  const { name, type } = useLocalSearchParams<{ name?: string; type?: string }>()
  const message = type === 'directory' ? t('drive.noAccess.folder') : t('drive.noAccess.file')

  return (
    <ScreenContainer surface>
      <AppBar title={name ?? ''} onBack={() => router.back()} />
      <EmptyState message={message} />
    </ScreenContainer>
  )
}

export default NoAccessScreen
