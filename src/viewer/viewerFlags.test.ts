const mockFlag = jest.fn()
jest.mock('cozy-flags', () => ({ __esModule: true, default: (name: string) => mockFlag(name) }))

import { isViewerEnabled, VIEWER_FLAGS } from './viewerFlags'

describe('isViewerEnabled', () => {
  const dev = __DEV__
  beforeEach(() => mockFlag.mockReset())
  afterAll(() => {
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = dev
  })

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

  it('reads the same flag in a dev build as in a shipped one', () => {
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = true
    mockFlag.mockReturnValue(undefined)
    expect(isViewerEnabled('markdown')).toBe(false)
    mockFlag.mockReturnValue(true)
    expect(isViewerEnabled('markdown')).toBe(true)
  })
})
