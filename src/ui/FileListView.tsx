import React from 'react'
import { FlatList, RefreshControl, StyleProp, StyleSheet, ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'

import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'
import { getErrorMessageKey } from '@/utils/errorMessages'

export interface FileListViewProps<T> {
  items: T[]
  keyExtractor: (item: T) => string
  renderItem: (info: { item: T }) => React.ReactElement | null
  /** Whether the screen is still waiting for its first items. */
  loading?: boolean
  /** The error to surface instead of the list, if the fetch failed. */
  error?: unknown
  onRetry?: () => void
  refreshing?: boolean
  onRefresh?: () => void
  onEndReached?: () => void
  /** i18n key of what to say when there is nothing to list. */
  emptyMessage: string
  /** Rendered above the list, and kept on screen while it is empty. */
  header?: React.ReactNode
  numColumns?: number
  /** Extra padding a screen needs inside the list, e.g. to scroll its last rows
   *  clear of a floating button. */
  contentContainerStyle?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * The list every file screen draws: the four states it can be in, pull to
 * refresh, and paging. What a row looks like and where its items come from
 * stays with the screen.
 */
export const FileListView = <T,>({
  items,
  keyExtractor,
  renderItem,
  loading = false,
  error,
  onRetry,
  refreshing = false,
  onRefresh,
  onEndReached,
  emptyMessage,
  header,
  numColumns,
  contentContainerStyle,
  testID
}: FileListViewProps<T>): React.ReactElement => {
  const { t } = useTranslation()
  const isEmpty = items.length === 0

  if (error) {
    return (
      <>
        {header}
        <ErrorState message={t(getErrorMessageKey(error))} onRetry={onRetry} />
      </>
    )
  }

  if (loading && isEmpty) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    )
  }

  return (
    <>
      {header}
      {/* The list is rendered even when empty, so that pulling on it still asks
          for a refresh — the empty state alone left the user nothing to pull. */}
      <FlatList
        key={numColumns ? `columns-${numColumns}` : undefined}
        testID={testID}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={numColumns}
        ListEmptyComponent={<EmptyState message={t(emptyMessage)} />}
        contentContainerStyle={[
          styles.content,
          isEmpty ? styles.empty : undefined,
          contentContainerStyle
        ]}
        onEndReachedThreshold={onEndReached ? 0.5 : undefined}
        onEndReached={onEndReached}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
        }
      />
    </>
  )
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  empty: { justifyContent: 'center' }
})
