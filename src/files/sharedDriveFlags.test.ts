jest.mock('cozy-flags', () => ({ __esModule: true, default: jest.fn() }))

import flag from 'cozy-flags'

import { EAGER_SHARED_DRIVE_SYNC_FLAG, isEagerSharedDriveSyncEnabled } from './sharedDriveFlags'

const mockFlag = flag as unknown as jest.Mock

describe('isEagerSharedDriveSyncEnabled', () => {
  beforeEach(() => mockFlag.mockReset())

  it('asks the instance for the flag it is named after', () => {
    isEagerSharedDriveSyncEnabled()

    expect(mockFlag).toHaveBeenCalledWith(EAGER_SHARED_DRIVE_SYNC_FLAG)
  })

  // Pulling every drive at launch is the cost the per-drive registration was
  // written to avoid, so an instance that never heard of the flag keeps that.
  it('stays off on an instance that does not serve the flag', () => {
    mockFlag.mockReturnValue(undefined)

    expect(isEagerSharedDriveSyncEnabled()).toBe(false)
  })

  it('is on only on an explicit true', () => {
    mockFlag.mockReturnValue(true)
    expect(isEagerSharedDriveSyncEnabled()).toBe(true)

    mockFlag.mockReturnValue('yes')
    expect(isEagerSharedDriveSyncEnabled()).toBe(false)
  })
})
