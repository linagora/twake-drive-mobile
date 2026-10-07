import React from 'react'
import { StyleSheet, View } from 'react-native'
import { cozyTokens } from './theme'
import { SortControl } from './SortControl'
import { ViewSwitcher } from './ViewSwitcher'

interface Props {
  /** Show the sort control on the left. Off for screens whose order is fixed. */
  sortable?: boolean
}

/**
 * The strip above a file list: the sort control on the left (when the screen
 * can be sorted) and the list/grid toggle on the right.
 */
export function FileListToolbar({ sortable = true }: Props): React.ReactElement {
  return (
    <View style={styles.toolbar} testID="file-list-toolbar">
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
    paddingHorizontal: cozyTokens.spacing.sm,
    paddingVertical: cozyTokens.spacing.xs
  }
})
