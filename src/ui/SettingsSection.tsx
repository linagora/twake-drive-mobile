import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Divider, Text, useTheme } from 'react-native-paper'

import { cozyTokens } from '@/ui/theme'

interface Props {
  title: string
  children: React.ReactNode
  /** Skip the leading rule — used by the first section of a screen. */
  first?: boolean
}

/**
 * Single sectioning idiom for settings-style lists. Replaces the mix of bare
 * List.Subheader and List.Section the settings screens each used.
 */
export const SettingsSection = ({ title, children, first }: Props): React.ReactElement => {
  const theme = useTheme()
  return (
    <View>
      {first ? null : <Divider />}
      <Text
        variant="labelLarge"
        style={[styles.title, { color: theme.colors.onSurfaceVariant }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

/** Placeholder for a section whose list is empty, aligned on the section title. */
export const SettingsSectionEmpty = ({ message }: { message: string }): React.ReactElement => {
  const theme = useTheme()
  return (
    <Text variant="bodyMedium" style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
      {message}
    </Text>
  )
}

const styles = StyleSheet.create({
  title: {
    paddingHorizontal: cozyTokens.spacing.md,
    paddingTop: cozyTokens.spacing.lg,
    paddingBottom: cozyTokens.spacing.xs
  },
  empty: {
    paddingHorizontal: cozyTokens.spacing.md,
    paddingVertical: cozyTokens.spacing.sm + cozyTokens.spacing.xs
  }
})
