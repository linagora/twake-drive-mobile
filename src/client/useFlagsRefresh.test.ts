import { AppState } from 'react-native'
import { renderHook } from '@testing-library/react-native'

const mockRefresh = jest.fn()
const mockClient = { plugins: { flags: { refresh: mockRefresh } } }
let mockOnline = true

jest.mock('cozy-client', () => ({ useClient: () => mockClient }))
jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({ getCurrent: () => mockOnline })
}))

import { useFlagsRefresh } from './useFlagsRefresh'

describe('useFlagsRefresh', () => {
  let changeTo: (state: string) => void = () => undefined
  const initialState = AppState.currentState

  beforeEach(() => {
    mockOnline = true
    mockRefresh.mockReset().mockResolvedValue(undefined)
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

  it('asks the flags plugin to refresh when the app comes back to the foreground', () => {
    renderHook(() => useFlagsRefresh())
    expect(mockRefresh).not.toHaveBeenCalled()
    changeTo('background')
    changeTo('active')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('logs a refresh that fails', async () => {
    const error = new Error('stack down')
    mockRefresh.mockRejectedValue(error)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderHook(() => useFlagsRefresh())
    changeTo('background')
    changeTo('active')
    await Promise.resolve()
    expect(warn).toHaveBeenCalledWith('[useFlagsRefresh] could not refresh the flags', error)
  })

  it('leaves the flags as they are offline', () => {
    mockOnline = false
    renderHook(() => useFlagsRefresh())
    changeTo('background')
    changeTo('active')
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
