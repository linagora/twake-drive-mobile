import React from 'react'
import { StyleSheet, View } from 'react-native'
import { List, useTheme } from 'react-native-paper'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { cozyTokens } from '@/ui/theme'

export type SettingsRowTrailing = 'chevron' | 'check' | 'none'

interface Props {
  title: string
  description?: string
  /** Name in the CozyIcon registry. Omit to keep the row aligned without one. */
  icon?: string
  /** Trailing affordance: a chevron for drill-down, a check for a picked option. */
  trailing?: SettingsRowTrailing
  /** Rendered in the trailing slot instead of `trailing` (a Switch, a Button…). */
  accessory?: React.ReactNode
  /** Tint the row with the error colour (irreversible actions). */
  destructive?: boolean
  /** Room for a description that has to be read in full, e.g. what a switch
   *  consents to. Paper clamps to two lines otherwise. */
  descriptionLines?: number
  onPress?: () => void
  testID?: string
}

/**
 * One row of a settings list. Every row reserves the leading icon slot so rows
 * with and without an icon share the same text baseline.
 */
export const SettingsRow = ({
  title,
  description,
  icon,
  trailing = 'none',
  accessory,
  destructive,
  onPress,
  testID,
  descriptionLines
}: Props): React.ReactElement => {
  const theme = useTheme()
  const tint = destructive ? theme.colors.error : theme.colors.onSurfaceVariant

  const renderTrailing = (): React.ReactNode => {
    if (accessory) return accessory
    if (trailing === 'none') return null
    const isChevron = trailing === 'chevron'
    return (
      <CozyIcon
        name={isChevron ? 'chevronRight' : 'check'}
        size={isChevron ? cozyTokens.iconSize.md : cozyTokens.iconSize.sm}
        color={isChevron ? theme.colors.onSurfaceVariant : theme.colors.primary}
      />
    )
  }

  return (
    <List.Item
      testID={testID}
      title={title}
      titleStyle={destructive ? { color: theme.colors.error } : undefined}
      description={description}
      descriptionNumberOfLines={descriptionLines}
      onPress={onPress}
      style={styles.row}
      left={props => (
        <View testID="settings-row-leading" style={[props.style, styles.leadingSlot]}>
          {icon ? <CozyIcon name={icon} size={cozyTokens.iconSize.md} color={tint} /> : null}
        </View>
      )}
      right={props => <View style={[props.style, styles.trailingSlot]}>{renderTrailing()}</View>}
    />
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: cozyTokens.spacing.xs },
  leadingSlot: {
    width: cozyTokens.rowLeadingSlot,
    height: cozyTokens.rowLeadingSlot,
    justifyContent: 'center',
    alignItems: 'center'
  },
  trailingSlot: { justifyContent: 'center', alignItems: 'center' }
})
