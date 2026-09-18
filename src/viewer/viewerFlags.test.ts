const mockFlag = jest.fn()
jest.mock('cozy-flags', () => ({ __esModule: true, default: (name: string) => mockFlag(name) }))

import { isViewerEnabled, VIEWER_FLAGS } from './viewerFlags'

describe('isViewerEnabled', () => {
  const dev = __DEV__
  beforeEach(() => {
    mockFlag.mockReset()
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = false
  })
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

  it('is on by default in a dev build, so a viewer can be used while it is built', () => {
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = true
    mockFlag.mockReturnValue(undefined)
    expect(isViewerEnabled('markdown')).toBe(true)
  })

  it('still obeys an instance that turned a viewer off, even in a dev build', () => {
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = true
    mockFlag.mockReturnValue(false)
    expect(isViewerEnabled('markdown')).toBe(false)
  })
})
