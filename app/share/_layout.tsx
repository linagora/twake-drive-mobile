import React from 'react'
import { Stack } from 'expo-router'
import { Portal } from 'react-native-paper'

// The share route is a pageSheet: without a Portal.Host of its own, the role
// menus and the link dialogs mount into the app-level host, below the sheet.
export default function ShareLayout(): React.ReactElement {
  return (
    <Portal.Host>
      <Stack screenOptions={{ headerShown: false }} />
    </Portal.Host>
  )
}
