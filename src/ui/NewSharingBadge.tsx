import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

/** Width the badge takes at the end of a list row, for the title to keep clear of. */
export const NEW_SHARING_BADGE_INSET = 28

interface Props {
  /** `row` sits before the 3-dot menu, `tile` on the corner of a grid tile. */
  placement?: 'row' | 'tile'
}

/**
 * The counter on the line of a sharing nobody opened yet. A sharing is one
 * line, so it always reads 1; it is the per-line counterpart of the badge on
 * the Sharing tab (twake-drive web marks the same shortcuts as new).
 */
export const NewSharingBadge = ({ placement = 'row' }: Props): React.ReactElement => {
  const { t } = useTranslation()
  const theme = useTheme()
  return (
    <View
      testID="new-sharing-badge"
      accessible
      accessibilityLabel={t('a11y.newSharing')}
      style={[
        styles.badge,
        placement === 'row' ? styles.row : styles.tile,
        { backgroundColor: theme.colors.error }
      ]}
    >
      <Text style={[styles.label, { color: theme.colors.onError }]}>1</Text>
    </View>
  )
}

const SIZE = 20

const styles = StyleSheet.create({
  badge: {
    minWidth: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  // Right before the 3-dot slot (52 wide), centred on the row.
  row: { position: 'absolute', right: 52, top: '50%', marginTop: -SIZE / 2 },
  tile: { position: 'absolute', top: 0, left: 0 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' }
})
