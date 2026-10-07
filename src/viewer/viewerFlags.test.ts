const mockFlag = jest.fn()
jest.mock('cozy-flags', () => ({ __esModule: true, default: (name: string) => mockFlag(name) }))

import {
  isViewerEnabled,
  officeCreationEnabledFrom,
  officeEnabledFrom,
  VIEWER_FLAGS
} from './viewerFlags'

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

describe('officeEnabledFrom', () => {
  it('follows the touch screen flag when the instance sets it', () => {
    expect(officeEnabledFrom(false, true)).toBe(false)
    expect(officeEnabledFrom(true, false)).toBe(true)
  })

  it('falls back to the legacy flag otherwise', () => {
    expect(officeEnabledFrom(null, true)).toBe(true)
    expect(officeEnabledFrom(undefined, null)).toBe(false)
  })
})

describe('officeCreationEnabledFrom', () => {
  const on = { touchScreen: true, legacy: null, readOnly: null, write: true }

  it('offers creation when office is on and writable', () => {
    expect(officeCreationEnabledFrom(on)).toBe(true)
  })

  it('hides it when office is off', () => {
    expect(officeCreationEnabledFrom({ ...on, touchScreen: false })).toBe(false)
    expect(
      officeCreationEnabledFrom({ touchScreen: null, legacy: null, readOnly: null, write: null })
    ).toBe(false)
  })

  it('hides it on a read-only touch screen, though viewing stays on', () => {
    expect(officeCreationEnabledFrom({ ...on, readOnly: true })).toBe(false)
    expect(officeEnabledFrom(true, null)).toBe(true)
  })

  it('hides it when the member may not write, which twake-drive sends to a paywall', () => {
    expect(officeCreationEnabledFrom({ ...on, write: false })).toBe(false)
  })

  it('falls back to the legacy flag for writing', () => {
    expect(officeCreationEnabledFrom({ ...on, write: null })).toBe(false)
    expect(
      officeCreationEnabledFrom({ touchScreen: null, legacy: true, readOnly: null, write: null })
    ).toBe(true)
  })
})
