let mockData: unknown
const mockUseQuery = jest.fn()
jest.mock('cozy-client', () => ({
  __esModule: true,
  default: { fetchPolicies: { olderThan: jest.fn(() => 'older-than-policy') } },
  Q: jest.fn((doctype: string) => ({ doctype })),
  useQuery: (...args: unknown[]) => mockUseQuery(...args)
}))

import { renderHook } from '@testing-library/react-native'

import { isAppInstalled, useIsAppInstalled } from './useIsAppInstalled'

describe('isAppInstalled', () => {
  it('is true when the slug is among the apps', () => {
    expect(isAppInstalled([{ slug: 'drive' }, { slug: 'notes' }], 'notes')).toBe(true)
  })

  it('is false without the slug', () => {
    expect(isAppInstalled([{ slug: 'drive' }], 'notes')).toBe(false)
  })

  it('is false while the apps are unknown', () => {
    expect(isAppInstalled(null, 'notes')).toBe(false)
    expect(isAppInstalled(undefined, 'notes')).toBe(false)
    expect(isAppInstalled([], 'notes')).toBe(false)
  })
})

describe('useIsAppInstalled', () => {
  beforeEach(() => {
    mockUseQuery.mockImplementation(() => ({ data: mockData }))
  })

  it('reads io.cozy.apps with an explicit fetch policy', () => {
    mockData = [{ slug: 'notes' }]
    const { result } = renderHook(() => useIsAppInstalled('notes'))
    expect(result.current).toBe(true)
    expect(mockUseQuery).toHaveBeenCalledWith(
      { doctype: 'io.cozy.apps' },
      { as: 'io.cozy.apps', fetchPolicy: 'older-than-policy' }
    )
  })

  it('is false when the app is not installed', () => {
    mockData = [{ slug: 'drive' }]
    expect(renderHook(() => useIsAppInstalled('notes')).result.current).toBe(false)
  })

  it('is false while the query has no data', () => {
    mockData = null
    expect(renderHook(() => useIsAppInstalled('notes')).result.current).toBe(false)
  })
})
