import React from 'react'
import { Redirect, Stack } from 'expo-router'

import { useAuth } from '@/auth/useAuth'

export default function AuthLayout() {
  const { status } = useAuth()
  // The mirror of the drive layout's own guard. Without it, a session that is
  // restored while the router sits here has nothing to send it back, and the
  // user keeps looking at the login screen while signed in.
  if (status === 'authenticated') return <Redirect href="/(drive)/files" />
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true
      }}
    />
  )
}
