import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Text, useTheme } from 'react-native-paper'

import { cozyTokens } from '@/ui/theme'

type Tone = 'error' | 'info'

interface Action {
  label: string
  onPress: () => void
  testID?: string
}

interface Props {
  message: string
  tone?: Tone
  action?: Action
  testID?: string
}

/** Inline notice block inside a scrolling screen (disk full, quota, …). */
export const InlineBanner = ({
  message,
  tone = 'info',
  action,
  testID
}: Props): React.ReactElement => {
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
      {action ? (
        <Button
          testID={action.testID}
          mode="text"
          textColor={foreground}
          style={styles.action}
          onPress={action.onPress}
        >
          {action.label}
        </Button>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    padding: cozyTokens.spacing.sm + cozyTokens.spacing.xs,
    marginHorizontal: cozyTokens.spacing.md,
    marginVertical: cozyTokens.spacing.sm,
    borderRadius: cozyTokens.radius.sm
  },
  action: { alignSelf: 'flex-end', marginTop: cozyTokens.spacing.xs }
})
