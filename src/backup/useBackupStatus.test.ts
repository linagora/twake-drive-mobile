import { act, renderHook, waitFor } from '@testing-library/react-native'

import { useBackupStatus } from './useBackupStatus'

const counts = { done: 1, pending: 2, skipped: 0, failed: 1, unavailable: 0 }
let mockProgress: ((status: typeof counts) => void) | null = null
const mockRemove = jest.fn()
const mockCore = {
  backupStatus: jest.fn(),
  photoAccess: jest.fn(),
  retryFailed: jest.fn(),
  addListener: jest.fn((_event: string, listener: (status: typeof counts) => void) => {
    mockProgress = listener
    return { remove: mockRemove }
  })
}
jest.mock('@/native/twakeDriveCore', () => ({ backupCore: () => mockCore }))

beforeEach(() => {
  mockCore.backupStatus.mockReset().mockResolvedValue(counts)
  mockCore.photoAccess.mockReset().mockReturnValue('authorized')
  mockCore.retryFailed.mockReset().mockResolvedValue(undefined)
  mockRemove.mockReset()
})

it('reads the state, then follows the pass running', async () => {
  const { result, unmount } = renderHook(() => useBackupStatus())
  await waitFor(() => expect(result.current.status).toEqual(counts))
  expect(result.current.access).toBe('authorized')
  act(() => mockProgress?.({ ...counts, done: 2, pending: 1 }))
  expect(result.current.status?.done).toBe(2)
  unmount()
  expect(mockRemove).toHaveBeenCalled()
})

it('keeps a newer state told by the pass over an older read', async () => {
  let answer: (status: typeof counts) => void = () => undefined
  mockCore.backupStatus.mockReturnValueOnce(new Promise(resolve => (answer = resolve)))
  const { result } = renderHook(() => useBackupStatus())
  act(() => mockProgress?.({ ...counts, done: 9 }))
  await act(async () => answer(counts))
  expect(result.current.status?.done).toBe(9)
})

it('reads the state again after a retry', async () => {
  const { result } = renderHook(() => useBackupStatus())
  await waitFor(() => expect(result.current.status).toEqual(counts))
  mockCore.backupStatus.mockResolvedValue({ ...counts, failed: 0, pending: 3 })
  await act(() => result.current.retryFailed())
  expect(mockCore.retryFailed).toHaveBeenCalled()
  expect(result.current.status?.failed).toBe(0)
})
