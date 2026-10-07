import React, { useEffect } from 'react'
import { Redirect, Tabs } from 'expo-router'
import { useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useClient } from 'cozy-client'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { OfflineBanner } from '@/ui/OfflineBanner'
import { useForegroundSync } from '@/pouchdb/useForegroundSync'
import { useFlagsRefresh } from '@/client/useFlagsRefresh'
import { useSharedDriveReplication } from '@/files/useSharedDriveReplication'
import { useSyncInstanceLocale } from '@/i18n/useSyncInstanceLocale'
import { initOfflineSubsystem } from '@/offline/initOffline'
import { formatBadgeCount, useNewSharesCount } from '@/sharing/newShares'
import { useAuth } from '@/auth/useAuth'
import { LoadingState } from '@/ui/LoadingState'

/** Glyph side in the bottom bar: the 16-grid icons read as a list-item icon, not the default 24. */
const TAB_ICON_SIZE = 20

export default function DriveLayout() {
  const client = useClient()
  const { status } = useAuth()
  // Only leave for the auth stack once the session is known to be gone. The
  // client is briefly null while it is being rebuilt — a dev resync, a
  // reconnection — and redirecting on that dropped the user on the welcome
  // screen with a perfectly valid session.
  if (!client && status === 'unauthenticated') return <Redirect href="/(auth)/welcome" />
  if (!client) return <LoadingState />
  return <DriveTabs />
}

function DriveTabs() {
  const theme = useTheme()
  const { t } = useTranslation()
  const client = useClient()
  useForegroundSync()
  useFlagsRefresh()
  useSharedDriveReplication()
  useSyncInstanceLocale()
  const newSharesCount = useNewSharesCount()
  useEffect(() => {
    if (!client) return
    void initOfflineSubsystem(client)
  }, [client])
  return (
    <>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          sceneStyle: { backgroundColor: theme.colors.background }
        }}
      >
        <Tabs.Screen
          name="files"
          options={{
            title: t('drive.myDrive'),
            tabBarButtonTestID: 'tab-files',
            tabBarIcon: ({ color }) => (
              <CozyIcon name="cloudOutline" color={color} size={TAB_ICON_SIZE} />
            )
          }}
        />
        <Tabs.Screen
          name="favorites"
          options={{
            title: t('drive.favorites'),
            tabBarButtonTestID: 'tab-favorites',
            tabBarIcon: ({ color }) => (
              <CozyIcon name="starOutline" color={color} size={TAB_ICON_SIZE} />
            )
          }}
        />
        <Tabs.Screen
          name="recent"
          options={{
            title: t('drive.recent'),
            tabBarButtonTestID: 'tab-recent',
            tabBarIcon: ({ color }) => (
              <CozyIcon name="clockOutline" color={color} size={TAB_ICON_SIZE} />
            )
          }}
        />
        <Tabs.Screen
          name="shared"
          options={{
            title: t('drive.shares'),
            tabBarButtonTestID: 'tab-shared',
            tabBarBadge: formatBadgeCount(newSharesCount),
            tabBarBadgeStyle: {
              backgroundColor: theme.colors.error,
              color: theme.colors.onError
            },
            tabBarIcon: ({ color }) => (
              <CozyIcon name="shareExternal" color={color} size={TAB_ICON_SIZE} />
            )
          }}
        />
        <Tabs.Screen
          name="trash"
          options={{
            title: t('drive.trash'),
            tabBarButtonTestID: 'tab-trash',
            tabBarIcon: ({ color }) => <CozyIcon name="trash" color={color} size={TAB_ICON_SIZE} />
          }}
        />
        <Tabs.Screen name="search" options={{ href: null }} />
      </Tabs>
    </>
  )
}
