import { renderHook } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  Q: () => ({ getById: () => ({}) }),
  useQuery: jest.fn()
}))

import { useQuery } from 'cozy-client'
import { useLegalNoticeUrl } from './useLegalNotice'

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>

const answer = (data: unknown): void => {
  mockUseQuery.mockReturnValue({ data } as ReturnType<typeof useQuery>)
}

describe('useLegalNoticeUrl', () => {
  beforeEach(() => jest.clearAllMocks())

  it('reads the url the instance settings carry', () => {
    answer({ legal_notice_url: 'https://twake.app/legal' })
    const { result } = renderHook(() => useLegalNoticeUrl())
    expect(result.current).toBe('https://twake.app/legal')
  })

  it('reads it from the attributes shape too', () => {
    answer({ attributes: { legal_notice_url: 'https://twake.app/legal' } })
    const { result } = renderHook(() => useLegalNoticeUrl())
    expect(result.current).toBe('https://twake.app/legal')
  })

  it('answers undefined when the instance names no legal notice', () => {
    answer({ public_name: 'Alice' })
    const { result } = renderHook(() => useLegalNoticeUrl())
    expect(result.current).toBeUndefined()
  })

  it('answers undefined before the settings are there', () => {
    answer(null)
    const { result } = renderHook(() => useLegalNoticeUrl())
    expect(result.current).toBeUndefined()
  })
})
