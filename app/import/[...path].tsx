import React from 'react'
import { useLocalSearchParams } from 'expo-router'

import { ImportScreen } from '@/drive/ImportScreen'

export default function ImportDrillScreen() {
  const { path } = useLocalSearchParams<{ path: string | string[] }>()
  const pathSegments = Array.isArray(path) ? path.filter(Boolean) : path ? [path] : []
  return <ImportScreen pathSegments={pathSegments} />
}
