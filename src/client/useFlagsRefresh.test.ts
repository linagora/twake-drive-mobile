import { AppState } from 'react-native'
import { renderHook } from '@testing-library/react-native'

const mockRefresh = jest.fn()
const mockClient = { plugins: { flags: { refresh: mockRefresh } } }
let mockOnline = true

jest.mock('cozy-client', () => ({ useClient: () => mockClient }))
jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({ getCurrent: () => mockOnline })
}))
const mockStopBackup = jest.fn()
jest.mock('@/backup/backupFlag', () => ({
  stopBackupTheInstanceTurnedOff: () => mockStopBackup()
}))

import { useFlagsRefresh } from './useFlagsRefresh'

describe('useFlagsRefresh', () => {
  let changeTo: (state: string) => void = () => undefined
  const initialState = AppState.currentState

  beforeEach(() => {
    mockOnline = true
    mockRefresh.mockReset().mockResolvedValue(undefined)
    mockStopBackup.mockReset()
    AppState.currentState = 'active'
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _evt: string,
      cb: (state: string) => void
    ) => {
      changeTo = cb
      return { remove: jest.fn() }
    }) as never)
  })

  afterEach(() => {
    AppState.currentState = initialState
    jest.restoreAllMocks()
  })

  it('asks the flags plugin to refresh at launch and back in the foreground', () => {
    renderHook(() => useFlagsRefresh())
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    changeTo('background')
    changeTo('active')
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })

  it('stops a backup the instance turned off once the stack answered', async () => {
    renderHook(() => useFlagsRefresh())
    await Promise.resolve()
    expect(mockStopBackup).toHaveBeenCalledTimes(1)
  })

  it('logs a refresh that fails, and leaves the backup alone', async () => {
    const error = new Error('stack down')
    mockRefresh.mockRejectedValue(error)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderHook(() => useFlagsRefresh())
    await Promise.resolve()
    await Promise.resolve()
    expect(warn).toHaveBeenCalledWith('[useFlagsRefresh] could not refresh the flags', error)
    expect(mockStopBackup).not.toHaveBeenCalled()
  })

  it('leaves the flags as they are offline', () => {
    mockOnline = false
    renderHook(() => useFlagsRefresh())
    changeTo('background')
    changeTo('active')
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
