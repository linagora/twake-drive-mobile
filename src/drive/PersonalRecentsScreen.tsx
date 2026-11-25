import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useQuery } from 'cozy-client'

import { personalRecentsQuery, personalRecentsQueryAs } from '@/client/queries'
import { isFirstLoad } from '@/client/queryLoading'
import { PersonalRecentsList } from '@/drive/PersonalRecentsList'
import {
  fetchMoreUntilRows,
  isOldEnoughToRefetch,
  makeRowsFromRecents,
  PersonalRecent,
  RecentsPage
} from '@/files/personalRecents'
import { useIsOnline } from '@/network/useIsOnline'
import { useNotify } from '@/ui/SnackbarHost'
import { getErrorMessageKey } from '@/utils/errorMessages'

export const PersonalRecentsScreen = (): React.ReactElement => {
  const { t } = useTranslation()
  const notify = useNotify()
  const isOnline = useIsOnline()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const paginationRef = useRef<Promise<void> | null>(null)

  const rowCountRef = useRef(0)
  // The list shows the error state when it has no row: the other failures leave the rows in place.
  const notifyFetchError = (error: unknown): void => {
    if (rowCountRef.current > 0) notify(t(getErrorMessageKey(error)))
  }

  // No fetchPolicy: the pull-to-refresh has to reach the stack, with no realtime on mobile.
  const query = useQuery(personalRecentsQuery(), {
    as: personalRecentsQueryAs,
    enabled: isOnline,
    // A refresh replaces the loaded pages with the first one, as on the web.
    backgroundFetching: true,
    onError: notifyFetchError
  })

  const rows = makeRowsFromRecents((query.data as PersonalRecent[] | null | undefined) ?? [])
  rowCountRef.current = rows.length

  const queryRef = useRef(query)
  queryRef.current = query
  const isOnlineRef = useRef(isOnline)
  isOnlineRef.current = isOnline

  // cozy-client types fetchMore as a bare Function.
  const fetchPage = (): Promise<RecentsPage | undefined> => queryRef.current.fetchMore()

  const fetchNextPages = (): void => {
    const pagination = fetchMoreUntilRows(fetchPage).catch(notifyFetchError)
    paginationRef.current = pagination
  }

  // cozy-client answers a fetch made while a next page loads without asking for the first one.
  const fetchFirstPage = async (): Promise<void> => {
    await paginationRef.current
    if (isOnlineRef.current) await queryRef.current.fetch()
  }

  useFocusEffect(
    useCallback(() => {
      if (!isOnlineRef.current || !isOldEnoughToRefetch(queryRef.current.lastUpdate, Date.now())) {
        return
      }
      void fetchFirstPage()
    }, [])
  )

  const isWaitingForNextPage = rows.length === 0 && query.hasMore === true
  const isIdle = query.fetchStatus === 'loaded' && !query.isFetching
  const isFailed = query.fetchStatus === 'failed'
  const isFetching = query.fetchStatus === 'loading' || query.isFetching === true
  const isLoading = isFirstLoad(query) || (isWaitingForNextPage && !isFailed)
  const error = isFailed && rows.length === 0 ? query.lastError : null

  useEffect(() => {
    if (isWaitingForNextPage && isIdle) fetchNextPages()
  }, [isWaitingForNextPage, isIdle])

  const fetchMore = (): void => {
    if (query.hasMore !== true || isFetching) return
    fetchNextPages()
  }

  const refresh = (): void => {
    setIsRefreshing(true)
    void fetchFirstPage().finally(() => setIsRefreshing(false))
  }

  const retry = (): void => {
    void fetchFirstPage()
  }

  return (
    <PersonalRecentsList
      rows={rows}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      isOffline={!isOnline}
      error={error}
      onRetry={retry}
      onRefresh={refresh}
      onEndReached={fetchMore}
    />
  )
}
