import React from 'react'
import { Stack } from 'expo-router'

export default function FavoritesStackLayout() {
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
