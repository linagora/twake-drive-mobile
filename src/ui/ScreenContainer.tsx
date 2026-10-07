import React from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { useTheme } from 'react-native-paper'

import { useSheetBottomInset, useSheetTopInset } from './sheetInset'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /**
   * Set on a screen presented as a sheet that draws its own top edge. Adds the
   * inset the platform actually needs, which on iOS is none.
   */
  sheet?: boolean
  /**
   * Keeps the content clear of the system navigation bar. Implied by `sheet`;
   * set it alone on a sheet whose AppBar already adds the top inset.
   */
  bottomInset?: boolean
}

/**
 * Common flex-1 wrapper that paints the active Paper theme's background.
 * Used by every drive screen so dark mode looks consistent — without it
 * screens that don't explicitly set a backgroundColor end up with whatever
 * the parent (Tabs sceneStyle) supplies, which has been flaky.
 */
export const ScreenContainer = ({
  children,
  style,
  sheet,
  bottomInset
}: Props): React.ReactElement => {
  const theme = useTheme()
  const sheetTopInset = useSheetTopInset()
  const sheetBottomInset = useSheetBottomInset()
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingTop: sheet ? sheetTopInset : 0,
          paddingBottom: sheet || bottomInset ? sheetBottomInset : 0
        },
        style
      ]}
    >
      {children}
    </View>
  )
}
