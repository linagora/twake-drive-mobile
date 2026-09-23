import { renderHook } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({ __esModule: true, useClient: jest.fn() }))
jest.mock('@/auth/useSessionCode', () => ({ useSessionCode: jest.fn() }))
jest.mock('@/account/deleteAccount', () => ({ openDeleteAccount: jest.fn() }))

import { useClient } from 'cozy-client'
import { useSessionCode } from '@/auth/useSessionCode'
import { openDeleteAccount } from '@/account/deleteAccount'
import { useDeleteAccount } from './useDeleteAccount'

const mockUseClient = useClient as jest.MockedFunction<typeof useClient>
const mockUseSessionCode = useSessionCode as jest.MockedFunction<typeof useSessionCode>
const mockOpenDeleteAccount = openDeleteAccount as jest.MockedFunction<typeof openDeleteAccount>

const fakeClient = {} as import('cozy-client').default
const fetchSessionCode = jest.fn()

describe('useDeleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseSessionCode.mockReturnValue(fetchSessionCode)
  })

  it('opens the deletion page with the client and a session code fetcher', async () => {
    mockUseClient.mockReturnValue(fakeClient)
    const { result } = renderHook(() => useDeleteAccount())
    await result.current()
    expect(mockOpenDeleteAccount).toHaveBeenCalledWith(fakeClient, fetchSessionCode)
  })

  it('refuses to open anything without a client', async () => {
    mockUseClient.mockReturnValue(null as unknown as import('cozy-client').default)
    const { result } = renderHook(() => useDeleteAccount())
    await expect(result.current()).rejects.toThrow('No cozy client')
    expect(mockOpenDeleteAccount).not.toHaveBeenCalled()
  })
})
