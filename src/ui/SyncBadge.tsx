import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { IconButton } from 'react-native-paper'

import { useSyncStatus } from '@/sync/useSyncStatus'

export const SyncBadge = () => {
  const { status } = useSyncStatus()

  if (status === 'idle') return null

  if (status === 'syncing') {
    return (
      <View style={styles.wrapper} testID="sync-badge">
        <ActivityIndicator size="small" testID="sync-badge-syncing" />
      </View>
    )
  }

  if (status === 'offline') {
    return (
      <IconButton
        icon="cloud-off-outline"
        accessibilityLabel="offline"
        testID="sync-badge-offline"
        size={20}
      />
    )
  }

  // status === 'error'
  return (
    <IconButton
      icon="alert-circle-outline"
      accessibilityLabel="sync error"
      testID="sync-badge-error"
      size={20}
    />
  )
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: 12, justifyContent: 'center' }
})
