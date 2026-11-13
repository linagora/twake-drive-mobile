import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Text, TouchableRipple, useTheme } from 'react-native-paper'

import { ProgressLine } from '@/ui/ProgressLine'
import { cozyTokens } from '@/ui/theme'

type Tone = 'error' | 'info'

interface Action {
  label: string
  onPress: () => void
  testID?: string
}

interface Props {
  message: string
  /** A second, smaller line under the message. */
  detail?: string
  /** From 0 to 1, drawn as a bar under the text. */
  progress?: number
  progressTestID?: string
  tone?: Tone
  actions?: Action[]
  /** The whole block opens something; say what in `accessibilityHint`. */
  onPress?: () => void
  accessibilityHint?: string
  testID?: string
}

/** Inline notice block inside a scrolling screen (disk full, quota, …). */
export const InlineBanner = ({
  message,
  detail,
  progress,
  progressTestID,
  tone = 'info',
  actions = [],
  onPress,
  accessibilityHint,
  testID
}: Props): React.ReactElement => {
  const theme = useTheme()
  const background =
    tone === 'error' ? theme.colors.errorContainer : theme.colors.secondaryContainer
  const foreground =
    tone === 'error' ? theme.colors.onErrorContainer : theme.colors.onSecondaryContainer
  const content = (
    <>
      <Text variant="bodyMedium" style={{ color: foreground }}>
        {message}
      </Text>
      {detail ? (
        <Text variant="bodySmall" style={{ color: foreground }}>
          {detail}
        </Text>
      ) : null}
      {progress !== undefined ? (
        <ProgressLine progress={progress} testID={progressTestID} style={styles.progress} />
      ) : null}
    </>
  )
  const style = [styles.banner, { backgroundColor: background }]
  if (onPress) {
    return (
      <TouchableRipple
        testID={testID}
        accessibilityRole="button"
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        style={style}
      >
        <View>{content}</View>
      </TouchableRipple>
    )
  }
  return (
    <View testID={testID} style={style}>
      {content}
      {actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((action, index) => (
            <Button
              key={action.testID ?? index}
              testID={action.testID}
              mode="text"
              textColor={foreground}
              // Not the press event: an action may be a native function that takes no argument.
              onPress={() => action.onPress()}
            >
              {action.label}
            </Button>
          ))}
        </View>
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
  progress: { marginTop: cozyTokens.spacing.sm },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    marginTop: cozyTokens.spacing.xs
  }
})
