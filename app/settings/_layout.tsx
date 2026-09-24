import React from 'react'
import { Redirect, Stack } from 'expo-router'
import { Portal } from 'react-native-paper'
import { useClient } from 'cozy-client'

export default function SettingsLayout(): React.ReactElement {
  const client = useClient()
  if (!client) return <Redirect href="/(auth)/welcome" />
  // Headers are the app's own AppBar, mounted by each screen inside its
  // ScreenContainer — same as the drive screens.
  // Portal.Host scopes Paper's <Portal> to this stack. The settings route is a
  // pageSheet, and without it a dialog mounts into the app-level PortalHost,
  // below the sheet, where the user never sees it.
  return (
    <Portal.Host>
      <Stack screenOptions={{ headerShown: false }} />
    </Portal.Host>
  )
}
