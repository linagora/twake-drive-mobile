import React from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { ProgressBar, useTheme } from 'react-native-paper'

import { cozyTokens } from '@/ui/theme'

interface Props {
  /** From 0 to 1. */
  progress: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

/** A thin bar telling how far a long task is. */
export const ProgressLine = ({ progress, style, testID }: Props): React.ReactElement => {
  const theme = useTheme()
  return (
    <ProgressBar
      testID={testID}
      progress={progress}
      color={theme.colors.primary}
      style={[styles.bar, style]}
    />
  )
}

const styles = StyleSheet.create({
  bar: {
    height: cozyTokens.progressBarHeight,
    borderRadius: cozyTokens.progressBarHeight / 2
  }
})
