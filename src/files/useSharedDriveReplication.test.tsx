import React from 'react'
import { render, waitFor } from '@testing-library/react-native'

const mockRestore = jest.fn().mockResolvedValue(undefined)
const mockSync = jest.fn()
const mockReplicateAll = jest.fn().mockResolvedValue(0)
jest.mock('./sharedDriveReplication', () => ({
  restoreSharedDriveReplication: (...a: unknown[]) => mockRestore(...a),
  syncSharedDrives: (...a: unknown[]) => mockSync(...a),
  replicateAllSharedDrives: (...a: unknown[]) => mockReplicateAll(...a)
}))

const mockEager = jest.fn()
jest.mock('./sharedDriveFlags', () => ({ isEagerSharedDriveSyncEnabled: () => mockEager() }))

jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({ getCurrent: () => true })
}))

const client = {}
jest.mock('cozy-client', () => ({ __esModule: true, useClient: () => client }))

import { useSharedDriveReplication } from './useSharedDriveReplication'

const Probe = (): React.ReactElement | null => {
  useSharedDriveReplication()
  return null
}

const drives = [
  { driveId: 'drive-1', name: 'One', rootFolderId: 'r1', owner: false },
  { driveId: 'drive-2', name: 'Two', rootFolderId: 'r2', owner: false }
]

describe('useSharedDriveReplication', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSync.mockResolvedValue(drives)
  })

  it('brings back the drives replicated in a past session', async () => {
    render(<Probe />)

    await waitFor(() => expect(mockRestore).toHaveBeenCalledTimes(1))
  })

  // Pulling every drive at launch is exactly the cost the per-drive
  // registration avoids, so it happens only when an instance asks for it.
  it('replicates only what was opened before while the flag is off', async () => {
    mockEager.mockReturnValue(false)

    render(<Probe />)

    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1))
    expect(mockReplicateAll).not.toHaveBeenCalled()
  })

  it('replicates every drive of the listing once the instance turns it on', async () => {
    mockEager.mockReturnValue(true)

    render(<Probe />)

    await waitFor(() => expect(mockReplicateAll).toHaveBeenCalledTimes(1))
    expect(mockReplicateAll).toHaveBeenCalledWith(client, drives)
  })

  it('leaves the listing alone when it could not be refreshed', async () => {
    mockEager.mockReturnValue(true)
    mockSync.mockRejectedValue(new Error('offline'))

    render(<Probe />)

    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1))
    expect(mockReplicateAll).not.toHaveBeenCalled()
  })
})
