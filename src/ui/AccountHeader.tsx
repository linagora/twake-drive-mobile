import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Avatar, Text, useTheme } from 'react-native-paper'

import { cozyTokens } from '@/ui/theme'

interface Props {
  /** Display name; falls back to `email`, then to `fallbackLabel`. */
  name?: string
  email?: string
  initials: string
  /** Shown when the account has neither a name nor an email. */
  fallbackLabel: string
  testID?: string
}

/** Avatar + identity block heading an account-scoped screen. */
export const AccountHeader = ({
  name,
  email,
  initials,
  fallbackLabel,
  testID = 'account-header'
}: Props): React.ReactElement => {
  const theme = useTheme()
  const title = name ?? email ?? fallbackLabel
  const subtitle = name && email ? email : undefined
  return (
    <View testID={testID} style={styles.container}>
      <Avatar.Text size={cozyTokens.avatarSize.md} label={initials} />
      <View style={styles.text}>
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: cozyTokens.spacing.md,
    padding: cozyTokens.spacing.md
  },
  text: { flex: 1 }
})
