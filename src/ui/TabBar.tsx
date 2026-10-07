import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import { cozyTokens } from './theme'

export type TabBarItem<T extends string> = {
  value: T
  label: string
  testID?: string
}

type TabBarProps<T extends string> = {
  tabs: ReadonlyArray<TabBarItem<T>>
  value: T
  onChange: (value: T) => void
}

const INDICATOR_HEIGHT = 2

/**
 * Material text tabs: equal-width labels, the active one in `primary` with an
 * underline indicator, over a hairline divider.
 */
export function TabBar<T extends string>({ tabs, value, onChange }: TabBarProps<T>) {
  const { colors } = useTheme()

  return (
    <View accessibilityRole="tablist" style={[styles.bar, { borderBottomColor: colors.outline }]}>
      {tabs.map(tab => {
        const selected = tab.value === value
        return (
          <Pressable
            key={tab.value}
            onPress={() => onChange(tab.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            testID={tab.testID}
            style={styles.tab}
          >
            <Text
              variant="titleSmall"
              numberOfLines={1}
              style={{ color: selected ? colors.primary : colors.onSurfaceVariant }}
            >
              {tab.label}
            </Text>
            <View
              testID={tab.testID ? `${tab.testID}-indicator` : undefined}
              style={[
                styles.indicator,
                { backgroundColor: selected ? colors.primary : 'transparent' }
              ]}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: cozyTokens.spacing.md,
    minHeight: 48
  },
  indicator: {
    alignSelf: 'stretch',
    height: INDICATOR_HEIGHT,
    marginTop: cozyTokens.spacing.sm + cozyTokens.spacing.xs,
    borderTopLeftRadius: INDICATOR_HEIGHT,
    borderTopRightRadius: INDICATOR_HEIGHT
  }
})
