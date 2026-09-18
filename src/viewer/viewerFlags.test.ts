const mockFlag = jest.fn()
jest.mock('cozy-flags', () => ({ __esModule: true, default: (name: string) => mockFlag(name) }))

import { isViewerEnabled, VIEWER_FLAGS } from './viewerFlags'

describe('isViewerEnabled', () => {
  beforeEach(() => mockFlag.mockReset())

  it('asks for the flag of the viewer at hand', () => {
    isViewerEnabled('markdown')
    expect(mockFlag).toHaveBeenCalledWith(VIEWER_FLAGS.markdown)
  })

  it('stays off on an instance that does not serve the flag', () => {
    mockFlag.mockReturnValue(undefined)
    expect(isViewerEnabled('note')).toBe(false)
  })

  it('is on only on an explicit true', () => {
    mockFlag.mockReturnValue(true)
    expect(isViewerEnabled('note')).toBe(true)
    mockFlag.mockReturnValue('yes')
    expect(isViewerEnabled('note')).toBe(false)
  })
})
