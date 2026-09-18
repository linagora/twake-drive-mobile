import React, { useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Menu, Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { SortAttr, SortDir, useFolderSort } from './useFolderSort'

/**
 * A pressable label (A-Z / Z-A) that opens a Paper Menu to select the folder
 * sort direction. Sort state is persisted via MMKV and shared across all
 * consumers of `useFolderSort`.
 */
export function SortControl() {
  const { sort, setSort } = useFolderSort()
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [menuVisible, setMenuVisible] = useState(false)

  const options: { attr: SortAttr; dir: SortDir; key: string }[] = [
    { attr: 'name', dir: 'asc', key: 'drive.sortAZ' },
    { attr: 'name', dir: 'desc', key: 'drive.sortZA' },
    { attr: 'updated_at', dir: 'desc', key: 'drive.sortRecent' },
    { attr: 'updated_at', dir: 'asc', key: 'drive.sortOldest' }
  ]
  const current = options.find(o => o.attr === sort.attr && o.dir === sort.dir) ?? options[0]
  const label = t(current.key)

  return (
    <Menu
      visible={menuVisible}
      onDismiss={() => setMenuVisible(false)}
      anchor={
        <Pressable
          onPress={() => setMenuVisible(true)}
          accessibilityLabel={label}
          accessibilityRole="button"
          style={styles.anchor}
        >
          <Text style={[styles.label, { color: colors.onSurface }]}>{label}</Text>
        </Pressable>
      }
    >
      {options.map(option => (
        <Menu.Item
          key={option.key}
          onPress={() => {
            setSort({ attr: option.attr, dir: option.dir })
            setMenuVisible(false)
          }}
          title={t(option.key)}
        />
      ))}
    </Menu>
  )
}

const styles = StyleSheet.create({
  anchor: {
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  label: {
    fontSize: 14
  }
})
