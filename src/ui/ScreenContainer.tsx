import React from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { useTheme } from 'react-native-paper'

import { useSheetTopInset } from './sheetInset'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /**
   * Set on a screen presented as a sheet that draws its own top edge. Adds the
   * inset the platform actually needs, which on iOS is none.
   */
  sheet?: boolean
}

/**
 * Common flex-1 wrapper that paints the active Paper theme's background.
 * Used by every drive screen so dark mode looks consistent — without it
 * screens that don't explicitly set a backgroundColor end up with whatever
 * the parent (Tabs sceneStyle) supplies, which has been flaky.
 */
export const ScreenContainer = ({ children, style, sheet }: Props): React.ReactElement => {
  const theme = useTheme()
  const sheetTopInset = useSheetTopInset()
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingTop: sheet ? sheetTopInset : 0
        },
        style
      ]}
    >
      {children}
    </View>
  )
}
