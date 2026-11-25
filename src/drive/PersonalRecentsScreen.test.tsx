import React from 'react'
import { act, render, waitFor } from '@testing-library/react-native'

const mockUseQuery = jest.fn()
const mockNotify = jest.fn()
const mockListProps = jest.fn()
const mockIsOnline = jest.fn<boolean, []>()

jest.mock('cozy-client', () => ({
  __esModule: true,
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  Q: () => ({})
}))
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react')
    useEffect(callback, [])
  }
}))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/ui/SnackbarHost', () => ({ useNotify: () => mockNotify }))
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockIsOnline() }))
jest.mock('@/drive/PersonalRecentsList', () => ({
  PersonalRecentsList: (props: unknown) => {
    mockListProps(props)
    return null
  }
}))

import { PersonalRecentsScreen } from './PersonalRecentsScreen'

const file = { _id: 'file-1', _type: 'io.cozy.files', name: 'report.pdf', type: 'file' }
const recent = { _id: 'recent-1', _type: 'io.cozy.files.recents', file: { data: file } }
const networkError = Object.assign(new Error('offline'), { status: 0 })

const lastListProps = (): {
  rows: unknown[]
  error: unknown
  isOffline: boolean
  onEndReached: () => void
  onRefresh: () => void
} => mockListProps.mock.calls[mockListProps.mock.calls.length - 1][0]

const lastQueryOptions = (): { enabled: boolean; onError: (error: unknown) => void } =>
  mockUseQuery.mock.calls[mockUseQuery.mock.calls.length - 1][1]

const makeQuery = (state: Record<string, unknown>): Record<string, unknown> => ({
  data: [],
  fetchStatus: 'loaded',
  lastUpdate: Date.now(),
  hasMore: false,
  fetch: jest.fn().mockResolvedValue(undefined),
  fetchMore: jest.fn().mockResolvedValue({ data: [], next: false }),
  ...state
})

beforeEach(() => {
  jest.clearAllMocks()
  mockIsOnline.mockReturnValue(true)
})

describe('PersonalRecentsScreen', () => {
  it('keeps the loaded rows and reports a failed fetch in the snackbar', () => {
    mockUseQuery.mockReturnValue(
      makeQuery({ data: [recent], fetchStatus: 'failed', lastError: networkError })
    )

    render(<PersonalRecentsScreen />)
    lastQueryOptions().onError(networkError)

    expect(lastListProps().rows).toEqual([file])
    expect(lastListProps().error).toBe(null)
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('shows the error state when no row was loaded', () => {
    mockUseQuery.mockReturnValue(makeQuery({ fetchStatus: 'failed', lastError: networkError }))

    render(<PersonalRecentsScreen />)
    lastQueryOptions().onError(networkError)

    expect(lastListProps().error).toBe(networkError)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('asks for the next page again after a failed one', async () => {
    const fetchMore = jest.fn().mockResolvedValue({ data: [recent], next: false })
    mockUseQuery.mockReturnValue(
      makeQuery({
        data: [recent],
        fetchStatus: 'failed',
        lastError: networkError,
        hasMore: true,
        fetchMore
      })
    )

    render(<PersonalRecentsScreen />)
    lastListProps().onEndReached()

    await waitFor(() => expect(fetchMore).toHaveBeenCalledTimes(1))
  })

  it('refreshes the list once the next page being loaded has come', async () => {
    let resolvePage: (page: unknown) => void = () => undefined
    const fetchMore = jest.fn(() => new Promise(resolve => (resolvePage = resolve)))
    const fetch = jest.fn().mockResolvedValue(undefined)
    mockUseQuery.mockReturnValue(makeQuery({ data: [recent], hasMore: true, fetch, fetchMore }))

    render(<PersonalRecentsScreen />)
    lastListProps().onEndReached()
    lastListProps().onRefresh()
    await act(async () => {})

    expect(fetch).not.toHaveBeenCalled()

    await act(async () => resolvePage({ data: [recent], next: false }))

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  // The stack serves the recents and none is kept on the device.
  it('tells the recents are not available offline', () => {
    mockIsOnline.mockReturnValue(false)
    mockUseQuery.mockReturnValue(makeQuery({ fetchStatus: 'pending', lastUpdate: null }))

    render(<PersonalRecentsScreen />)

    expect(lastListProps().isOffline).toBe(true)
  })

  it('asks the stack for the recents only while online', () => {
    mockIsOnline.mockReturnValue(false)
    mockUseQuery.mockReturnValue(makeQuery({ fetchStatus: 'pending', lastUpdate: null }))
    const { rerender } = render(<PersonalRecentsScreen />)

    expect(lastQueryOptions().enabled).toBe(false)

    mockIsOnline.mockReturnValue(true)
    rerender(<PersonalRecentsScreen />)

    expect(lastQueryOptions().enabled).toBe(true)
  })

  // A refetch drops the pages loaded after the first one.
  it('keeps a list fetched less than a minute ago when the screen gets the focus back', () => {
    const fetch = jest.fn().mockResolvedValue(undefined)
    mockUseQuery.mockReturnValue(makeQuery({ data: [recent], hasMore: true, fetch }))

    render(<PersonalRecentsScreen />)

    expect(fetch).not.toHaveBeenCalled()
  })

  it('refetches an older list when the screen gets the focus back', async () => {
    const fetch = jest.fn().mockResolvedValue(undefined)
    mockUseQuery.mockReturnValue(
      makeQuery({ data: [recent], lastUpdate: Date.now() - 2 * 60 * 1000, hasMore: true, fetch })
    )

    render(<PersonalRecentsScreen />)
    await act(async () => {})

    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
