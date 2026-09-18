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
import { useFlushPendingEdits } from '@/viewer/useFlushPendingEdits'
import { useSyncInstanceLocale } from '@/i18n/useSyncInstanceLocale'
import { initOfflineSubsystem } from '@/offline/initOffline'
import { useAuth } from '@/auth/useAuth'
import { LoadingState } from '@/ui/LoadingState'

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
  useFlushPendingEdits()
  useSyncInstanceLocale()
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
            tabBarIcon: ({ color, size }) => <CozyIcon name="cloud2" color={color} size={size} />
          }}
        />
        <Tabs.Screen
          name="favorites"
          options={{
            title: t('drive.favorites'),
            tabBarIcon: ({ color, size }) => <CozyIcon name="star" color={color} size={size} />
          }}
        />
        <Tabs.Screen
          name="recent"
          options={{
            title: t('drive.recent'),
            tabBarIcon: ({ color, size }) => (
              <CozyIcon name="clockOutline" color={color} size={size} />
            )
          }}
        />
        <Tabs.Screen
          name="shared"
          options={{
            title: t('drive.shares'),
            tabBarIcon: ({ color, size }) => (
              <CozyIcon name="shareExternal" color={color} size={size} />
            )
          }}
        />
        <Tabs.Screen
          name="trash"
          options={{
            title: t('drive.trash'),
            tabBarIcon: ({ color, size }) => <CozyIcon name="trash" color={color} size={size} />
          }}
        />
        <Tabs.Screen name="search" options={{ href: null }} />
      </Tabs>
    </>
  )
}
