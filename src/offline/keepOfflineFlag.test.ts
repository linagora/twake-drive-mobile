const mockFlag = jest.fn()
jest.mock('cozy-flags', () => ({
  __esModule: true,
  default: (name: string) => mockFlag(name)
}))

import { isKeepOfflineEnabled, KEEP_OFFLINE_FLAG } from './keepOfflineFlag'

describe('isKeepOfflineEnabled', () => {
  beforeEach(() => mockFlag.mockReset())

  it('reads the keep-offline flag', () => {
    isKeepOfflineEnabled()
    expect(mockFlag).toHaveBeenCalledWith(KEEP_OFFLINE_FLAG)
  })

  it('keeps the feature on an instance that does not serve the flag', () => {
    mockFlag.mockReturnValue(undefined)
    expect(isKeepOfflineEnabled()).toBe(true)
  })

  it('keeps the feature when the flag is true', () => {
    mockFlag.mockReturnValue(true)
    expect(isKeepOfflineEnabled()).toBe(true)
  })

  it('turns the feature off only on an explicit false', () => {
    mockFlag.mockReturnValue(false)
    expect(isKeepOfflineEnabled()).toBe(false)
  })
})
