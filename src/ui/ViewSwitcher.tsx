import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { CozyIcon } from './icons/CozyIcon'
import { cozyTokens } from './theme'
import { useViewMode } from './useViewMode'

/** Visual size of the button; the touch target is widened to 44 by `hitSlop`. */
const BUTTON_SIZE = 32
const HIT_SLOP = 6

/**
 * Single button that toggles between list and grid view modes. It shows the
 * icon of the mode a tap switches to: the grid icon while the list is on
 * screen, the list icon while the grid is. View mode state is persisted via
 * MMKV and shared across all consumers of `useViewMode`.
 */
export function ViewSwitcher() {
  const { mode, setMode } = useViewMode()
  const { colors } = useTheme()
  const { t } = useTranslation()

  const target = mode === 'list' ? 'grid' : 'list'

  return (
    <Pressable
      onPress={() => setMode(target)}
      accessibilityLabel={t(target === 'grid' ? 'a11y.gridView' : 'a11y.listView')}
      testID="view-toggle"
      accessibilityRole="button"
      hitSlop={HIT_SLOP}
      style={styles.button}
    >
      <CozyIcon
        name={target === 'grid' ? 'mosaicMin' : 'listMin'}
        size={cozyTokens.iconSize.sm}
        color={colors.onSurfaceVariant}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
