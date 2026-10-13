import React from 'react'
import { StyleSheet, View } from 'react-native'
import { cozyTokens } from './theme'
import { SortControl } from './SortControl'
import { ViewSwitcher } from './ViewSwitcher'
import { useSideInset } from './useSideInset'

interface Props {
  /** Show the sort control on the left. Off for screens whose order is fixed. */
  sortable?: boolean
}

/**
 * The strip above a file list: the sort control on the left (when the screen
 * can be sorted) and the list/grid toggle on the right.
 */
export function FileListToolbar({ sortable = true }: Props): React.ReactElement {
  const sideInset = useSideInset()
  return (
    <View
      style={[styles.toolbar, { paddingHorizontal: cozyTokens.spacing.sm + sideInset }]}
      testID="file-list-toolbar"
    >
      {sortable ? <SortControl /> : <View />}
      <ViewSwitcher />
    </View>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: cozyTokens.spacing.xs
  }
})
