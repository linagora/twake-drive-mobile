import React from 'react'
import { Stack } from 'expo-router'

export default function SharedDrivesStackLayout() {
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
