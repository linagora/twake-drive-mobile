const mockUseQuery = jest.fn()
jest.mock('cozy-client', () => ({
  __esModule: true,
  Q: () => {
    const builder: Record<string, unknown> = {}
    for (const method of ['where', 'partialIndex', 'indexFields', 'sortBy', 'limitBy']) {
      builder[method] = (arg: unknown) => {
        builder[`_${method}`] = arg
        return builder
      }
    }
    return builder
  },
  useQuery: (...args: unknown[]) => mockUseQuery(...args)
}))

import { renderHook } from '@testing-library/react-native'

import {
  countNewShares,
  formatBadgeCount,
  isNewSharingShortcut,
  useNewSharesCount
} from './newShares'

const shortcut = (status?: string) => ({ metadata: status ? { sharing: { status } } : undefined })

describe('isNewSharingShortcut', () => {
  it('accepts a shortcut the stack has not seen opened', () => {
    expect(isNewSharingShortcut(shortcut('new'))).toBe(true)
  })

  it('rejects a shortcut that was opened', () => {
    expect(isNewSharingShortcut(shortcut('seen'))).toBe(false)
  })

  it('rejects a document that is not the shortcut of a share', () => {
    expect(isNewSharingShortcut(shortcut())).toBe(false)
    expect(isNewSharingShortcut({ metadata: { externalId: 'doc-1' } })).toBe(false)
  })
})

describe('countNewShares', () => {
  it('counts the new shortcuts only', () => {
    const files = [shortcut('new'), shortcut('seen'), shortcut(), shortcut('new')]
    expect(countNewShares(files)).toBe(2)
  })

  it('is zero while the query has nothing', () => {
    expect(countNewShares(null)).toBe(0)
    expect(countNewShares(undefined)).toBe(0)
    expect(countNewShares([])).toBe(0)
  })
})

describe('formatBadgeCount', () => {
  it('shows no badge at zero', () => {
    expect(formatBadgeCount(0)).toBeUndefined()
  })

  it('shows the count up to 99', () => {
    expect(formatBadgeCount(1)).toBe(1)
    expect(formatBadgeCount(99)).toBe(99)
  })

  it('caps at 99+', () => {
    expect(formatBadgeCount(100)).toBe('99+')
  })
})

describe('useNewSharesCount', () => {
  it('counts the new shortcuts of the shared-with-me directory', () => {
    mockUseQuery.mockReturnValue({ data: [shortcut('new'), shortcut('seen')] })

    const { result } = renderHook(() => useNewSharesCount())

    expect(result.current).toBe(1)
    const [definition, options] = mockUseQuery.mock.calls[0]
    expect(definition._where).toMatchObject({
      dir_id: 'io.cozy.files.shared-with-me-dir',
      type: 'file'
    })
    expect(options.as).toBe('io.cozy.files/dir/io.cozy.files.shared-with-me-dir/files/name-asc')
  })

  it('is zero before the listing is there', () => {
    mockUseQuery.mockReturnValue({ data: null })
    expect(renderHook(() => useNewSharesCount()).result.current).toBe(0)
  })
})
