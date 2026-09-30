import { renderHook } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  Q: () => ({ getById: () => ({}) }),
  useQuery: jest.fn()
}))

import { useQuery } from 'cozy-client'
import { makeTosUrl, TWAKE_TOS_URL, useTosUrl } from './useTos'

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>

const answer = (data: unknown): void => {
  mockUseQuery.mockReturnValue({ data } as ReturnType<typeof useQuery>)
}

describe('makeTosUrl', () => {
  it('serves the revision the instance pins', () => {
    expect(makeTosUrl('20240101')).toBe('https://files.cozycloud.cc/TOS-20240101.pdf')
  })

  it('falls back to the Twake terms of use when no revision is pinned', () => {
    expect(makeTosUrl(undefined)).toBe(TWAKE_TOS_URL)
  })

  it('treats an empty revision as none', () => {
    expect(makeTosUrl('')).toBe(TWAKE_TOS_URL)
  })
})

describe('useTosUrl', () => {
  beforeEach(() => jest.clearAllMocks())

  it('reads the revision the instance settings carry', () => {
    answer({ tos: '20240101' })
    const { result } = renderHook(() => useTosUrl())
    expect(result.current).toBe('https://files.cozycloud.cc/TOS-20240101.pdf')
  })

  it('reads it from the attributes shape too', () => {
    answer({ attributes: { tos: '20240101' } })
    const { result } = renderHook(() => useTosUrl())
    expect(result.current).toBe('https://files.cozycloud.cc/TOS-20240101.pdf')
  })

  it('falls back to the Twake terms of use when the instance pins none', () => {
    answer({ public_name: 'Alice' })
    const { result } = renderHook(() => useTosUrl())
    expect(result.current).toBe(TWAKE_TOS_URL)
  })

  it('falls back before the settings are there', () => {
    answer(null)
    const { result } = renderHook(() => useTosUrl())
    expect(result.current).toBe(TWAKE_TOS_URL)
  })
})
