import React from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { useTheme } from 'react-native-paper'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * Common flex-1 wrapper that paints the active Paper theme's background.
 * Used by every drive screen so dark mode looks consistent — without it
 * screens that don't explicitly set a backgroundColor end up with whatever
 * the parent (Tabs sceneStyle) supplies, which has been flaky.
 */
export const ScreenContainer = ({ children, style }: Props): React.ReactElement => {
  const theme = useTheme()
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}>{children}</View>
  )
}
