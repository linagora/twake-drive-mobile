import React from 'react'
import { Redirect, Stack } from 'expo-router'
import { useClient } from 'cozy-client'

export default function SettingsLayout(): React.ReactElement {
  const client = useClient()
  if (!client) return <Redirect href="/(auth)/welcome" />
  // Headers are the app's own AppBar, mounted by each screen inside its
  // ScreenContainer — same as the drive screens.
  return <Stack screenOptions={{ headerShown: false }} />
}
