import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, ProgressBar, Text } from 'react-native-paper'

import { cozyTokens } from '@/ui/theme'

export const LoadingOverlay = ({ progress }: { progress?: number }): React.ReactElement => (
  <View style={styles.overlay} pointerEvents="none">
    <ActivityIndicator size="large" color={cozyTokens.canvas.on} />
    {typeof progress === 'number' ? (
      <View style={styles.progressWrapper}>
        <ProgressBar progress={Math.max(0, Math.min(1, progress))} color={cozyTokens.canvas.on} />
      </View>
    ) : null}
  </View>
)

export const ErrorOverlay = ({ message }: { message: string }): React.ReactElement => (
  <View style={styles.overlay} pointerEvents="none">
    <Text style={styles.errorText}>{message}</Text>
  </View>
)

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cozyTokens.canvas.scrim,
    gap: cozyTokens.spacing.md
  },
  progressWrapper: { width: 200 },
  errorText: {
    color: cozyTokens.canvas.on,
    textAlign: 'center',
    paddingHorizontal: cozyTokens.spacing.xxl
  }
})
