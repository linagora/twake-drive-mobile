import React from 'react'
import { useTranslation } from 'react-i18next'

import { AppBar } from '@/ui/AppBar'
import { ScreenContainer } from '@/ui/ScreenContainer'
import { EmptyState } from '@/ui/EmptyState'
import { useAuth } from '@/auth/useAuth'

export default function FavoritesScreen() {
  const { t } = useTranslation()
  const { logout } = useAuth()

  return (
    <ScreenContainer>
      <AppBar title={t('drive.favorites')} onLogout={logout} showSearch />
      <EmptyState icon="star" message={t('drive.emptyFavorites')} />
    </ScreenContainer>
  )
}
