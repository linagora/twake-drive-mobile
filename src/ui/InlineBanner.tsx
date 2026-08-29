import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

import { cozyTokens } from '@/ui/theme'

type Tone = 'error' | 'info'

interface Props {
  message: string
  tone?: Tone
  testID?: string
}

/** Inline notice block inside a scrolling screen (disk full, quota, …). */
export const InlineBanner = ({ message, tone = 'info', testID }: Props): React.ReactElement => {
  const theme = useTheme()
  const background =
    tone === 'error' ? theme.colors.errorContainer : theme.colors.secondaryContainer
  const foreground =
    tone === 'error' ? theme.colors.onErrorContainer : theme.colors.onSecondaryContainer
  return (
    <View testID={testID} style={[styles.banner, { backgroundColor: background }]}>
      <Text variant="bodyMedium" style={{ color: foreground }}>
        {message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    padding: cozyTokens.spacing.sm + cozyTokens.spacing.xs,
    marginHorizontal: cozyTokens.spacing.md,
    marginVertical: cozyTokens.spacing.sm,
    borderRadius: cozyTokens.radius.sm
  }
})
