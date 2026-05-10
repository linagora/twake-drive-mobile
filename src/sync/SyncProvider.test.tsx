import React from 'react'
import { Text, AppState, AppStateStatus } from 'react-native'
import { act, render } from '@testing-library/react-native'

const mockStart = jest.fn()
const mockStop = jest.fn()
const mockSyncNow = jest.fn()
jest.mock('@/client/createClient', () => ({
  pouchLink: {
    startReplication: (...args: unknown[]) => mockStart(...args),
    stopReplication: (...args: unknown[]) => mockStop(...args),
    syncImmediately: (...args: unknown[]) => mockSyncNow(...args)
  }
}))

const mockUseClient = jest.fn()
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => mockUseClient()
}))

let netInfoListener: ((s: { isConnected: boolean }) => void) | null = null
const mockNetInfoUnsubscribe = jest.fn()
const mockNetInfoFetch = jest.fn().mockResolvedValue({ isConnected: true })
const mockNetInfoAddListener = jest.fn(cb => {
  netInfoListener = cb
  return mockNetInfoUnsubscribe
})
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: (...args: unknown[]) => mockNetInfoFetch(...args),
    addEventListener: (cb: never) => mockNetInfoAddListener(cb)
  }
}))

import { SyncProvider } from './SyncProvider'
import { useSyncStatus } from './useSyncStatus'

const Probe = () => {
  const { status } = useSyncStatus()
  return <Text testID="probe">{status}</Text>
}

const clientOn = jest.fn()
const clientOff = jest.fn()

let appStateListener: ((s: string) => void) | null = null
const mockAppStateRemove = jest.fn()

const renderWithProvider = (clientPresent: boolean) => {
  mockUseClient.mockReturnValue(
    clientPresent ? { on: clientOn, removeListener: clientOff } : null
  )
  return render(
    <SyncProvider>
      <Probe />
    </SyncProvider>
  )
}

describe('SyncProvider', () => {
  beforeEach(() => {
    mockStart.mockReset()
    mockStop.mockReset()
    mockSyncNow.mockReset()
    clientOn.mockReset()
    clientOff.mockReset()
    mockNetInfoUnsubscribe.mockReset()
    netInfoListener = null
    appStateListener = null
    mockAppStateRemove.mockReset()

    // Spy on AppState.addEventListener (already a jest.fn() from RN preset)
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (evt: string, cb: (s: AppStateStatus) => void) => {
        if (evt === 'change') appStateListener = cb as (s: string) => void
        return { remove: mockAppStateRemove }
      }
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('starts replication when authenticated', () => {
    renderWithProvider(true)
    expect(mockStart).toHaveBeenCalled()
  })

  it('does not start when client is null (unauthenticated)', () => {
    renderWithProvider(false)
    expect(mockStart).not.toHaveBeenCalled()
  })

  it('stops replication when going to background', () => {
    renderWithProvider(true)
    expect(appStateListener).toBeTruthy()
    act(() => appStateListener!('background'))
    expect(mockStop).toHaveBeenCalled()
  })

  it('schedules an immediate sync when returning to foreground', () => {
    renderWithProvider(true)
    act(() => appStateListener!('background'))
    mockSyncNow.mockClear()
    act(() => appStateListener!('active'))
    expect(mockSyncNow).toHaveBeenCalled()
  })

  it('flips to offline status when NetInfo reports disconnected', () => {
    const { getByTestId } = renderWithProvider(true)
    act(() => netInfoListener!({ isConnected: false } as never))
    expect(getByTestId('probe').props.children).toBe('offline')
    expect(mockStop).toHaveBeenCalled()
  })

  it('resumes syncing when NetInfo flips back online', () => {
    const { getByTestId } = renderWithProvider(true)
    act(() => netInfoListener!({ isConnected: false } as never))
    mockSyncNow.mockClear()
    mockStart.mockClear()
    act(() => netInfoListener!({ isConnected: true } as never))
    expect(mockStart).toHaveBeenCalled()
    expect(mockSyncNow).toHaveBeenCalled()
    expect(getByTestId('probe').props.children).toBe('syncing')
  })

  it('subscribes to pouchlink:doctypesync:start and pouchlink:sync:end on the client', () => {
    renderWithProvider(true)
    expect(clientOn).toHaveBeenCalledWith(
      'pouchlink:doctypesync:start',
      expect.any(Function)
    )
    expect(clientOn).toHaveBeenCalledWith(
      'pouchlink:sync:end',
      expect.any(Function)
    )
  })

  it('updates status to syncing on doctypesync:start, idle on sync:end', () => {
    const { getByTestId } = renderWithProvider(true)
    const startHandler = clientOn.mock.calls.find(
      c => c[0] === 'pouchlink:doctypesync:start'
    )![1]
    const endHandler = clientOn.mock.calls.find(c => c[0] === 'pouchlink:sync:end')![1]
    act(() => startHandler('io.cozy.files'))
    expect(getByTestId('probe').props.children).toBe('syncing')
    act(() => endHandler())
    expect(getByTestId('probe').props.children).toBe('idle')
  })
})
