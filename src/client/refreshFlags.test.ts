const mockInitializeFromRemote = jest.fn()
jest.mock('cozy-flags', () => ({
  __esModule: true,
  default: { initializeFromRemote: (c: unknown) => mockInitializeFromRemote(c) }
}))

let mockOnline = true
jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({ getCurrent: () => mockOnline })
}))

import type CozyClient from 'cozy-client'
import { refreshFlags } from './refreshFlags'

const client = {} as CozyClient

describe('refreshFlags', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnline = true
    mockInitializeFromRemote.mockResolvedValue(undefined)
  })

  it('reads the flags from the instance when online', async () => {
    await refreshFlags(client)
    expect(mockInitializeFromRemote).toHaveBeenCalledWith(client)
  })

  // Flags are kept for the session: refreshing offline could only fail, and a
  // failure that cleared them would turn features off behind the user's back.
  it('does not read them while offline', async () => {
    mockOnline = false
    await refreshFlags(client)
    expect(mockInitializeFromRemote).not.toHaveBeenCalled()
  })

  it('keeps the previous values when the read fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockInitializeFromRemote.mockRejectedValue(new Error('boom'))
    await expect(refreshFlags(client)).resolves.toBeUndefined()
  })

  it('is a no-op without a client', async () => {
    await refreshFlags(null)
    expect(mockInitializeFromRemote).not.toHaveBeenCalled()
  })
})
