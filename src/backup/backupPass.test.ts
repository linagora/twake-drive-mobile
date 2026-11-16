import { AppState } from 'react-native'
import { act, renderHook, waitFor } from '@testing-library/react-native'

import type { StopCause } from '@/native/twakeDriveCore'

import { RETRY_MS, runBackupPass, useBackupPass } from './backupPass'

const counts = { done: 3, pending: 0, skipped: 0, failed: 0 }
const mockRun = jest.fn()
let mockAvailable = true
jest.mock('@/native/twakeDriveCore', () => ({
  backupCore: () => (mockAvailable ? { runBackupPass: mockRun } : null)
}))
jest.mock('./deviceId', () => ({ backupDeviceId: async () => 'dev-1' }))
let mockSettings: { enabled: boolean; folder: { id: string; path: string } | null }
const mockWrite = jest.fn()
jest.mock('./backupSettings', () => ({
  readBackupSettings: () => mockSettings,
  writeBackupSettings: (patch: unknown) => mockWrite(patch)
}))
const mockAdopt = jest.fn()
jest.mock('@/auth/adoptStoredToken', () => ({
  adoptStoredToken: (client: unknown) => mockAdopt(client)
}))
jest.mock('cozy-client', () => ({ useClient: () => null }))
let mockFlagOn = true
jest.mock('./backupFlag', () => ({
  isPhotoBackupEnabled: () => mockFlagOn,
  useIsPhotoBackupEnabled: () => mockFlagOn
}))
let mockStoppedBy: StopCause | undefined
jest.mock('./useBackupStatus', () => ({
  useBackupStatus: () => ({ status: { ...counts, pending: 9, stoppedBy: mockStoppedBy } })
}))

const client = {} as never

beforeEach(() => {
  mockAvailable = true
  mockFlagOn = true
  mockStoppedBy = undefined
  mockSettings = { enabled: true, folder: { id: 'folder-1', path: '/Photos/B/iPhone' } }
  mockRun.mockReset().mockResolvedValue(counts)
  mockAdopt.mockReset().mockResolvedValue(false)
  mockWrite.mockReset()
})

test('the folder a pass made again replaces the deleted one in the settings', async () => {
  const folder = { id: 'folder-2', path: '/Photos/B/iPhone' }
  mockRun.mockResolvedValue({ ...counts, folder })
  await runBackupPass(client)
  expect(mockWrite).toHaveBeenCalledWith({ folder })
})

test('the settings stay when the pass went to their folder', async () => {
  mockRun.mockResolvedValue({ ...counts, folder: { id: 'folder-1', path: '/Photos/B/iPhone' } })
  await runBackupPass(client)
  expect(mockWrite).not.toHaveBeenCalled()
})

test('a pass goes to the folder of the phone, then takes the token the core refreshed', async () => {
  await expect(runBackupPass(client)).resolves.toEqual(counts)
  expect(mockRun).toHaveBeenCalledWith('folder-1', 'dev-1', null)
  expect(mockAdopt).toHaveBeenCalledWith(client)
})

test('a pass the user starts during another keeps its title for the pass after it', async () => {
  const first = runBackupPass(client)
  const asked = runBackupPass(client, 'Photo backup')
  await Promise.all([first, asked])
  expect(mockRun.mock.calls.map(call => call[2])).toEqual([null, 'Photo backup'])
  await runBackupPass(client)
  expect(mockRun).toHaveBeenLastCalledWith('folder-1', 'dev-1', null)
})

test('calls during a pass get one more pass after it, never two at once', async () => {
  const first = runBackupPass(client)
  const second = runBackupPass(client)
  const third = runBackupPass(client)
  await expect(Promise.all([first, second, third])).resolves.toEqual([counts, counts, counts])
  expect(mockRun).toHaveBeenCalledTimes(2)
  await runBackupPass(client)
  expect(mockRun).toHaveBeenCalledTimes(3)
})

const heldPass = (): (() => void) => {
  let release = (): void => undefined
  mockRun.mockReturnValueOnce(new Promise(resolve => (release = () => resolve(counts))))
  return () => release()
}

test('turned off and on again during a pass, the backup runs again at once', async () => {
  const release = heldPass()
  const stopped = runBackupPass(client)
  // Turned on again: the screen asks for a pass while the stopped one ends.
  void runBackupPass(client)
  release()
  await stopped
  expect(mockRun.mock.calls).toEqual([
    ['folder-1', 'dev-1', null],
    ['folder-1', 'dev-1', null]
  ])
})

test('a folder picked while a pass ran gets a pass of its own', async () => {
  const release = heldPass()
  const first = runBackupPass(client)
  mockSettings = { enabled: true, folder: { id: 'folder-2', path: '/Photos/B/iPad' } }
  void runBackupPass(client)
  release()
  await first
  expect(mockRun.mock.calls).toEqual([
    ['folder-1', 'dev-1', null],
    ['folder-2', 'dev-1', null]
  ])
})

test('no pass while the instance keeps the backup off', async () => {
  mockFlagOn = false
  await expect(runBackupPass(client, 'Photo backup')).resolves.toBeNull()
  expect(mockRun).not.toHaveBeenCalled()
})

test('the flags landing after the launch start the pass the launch skipped', async () => {
  mockFlagOn = false
  const { rerender } = renderHook(() => useBackupPass())
  expect(mockRun).not.toHaveBeenCalled()
  mockFlagOn = true
  rerender({})
  await waitFor(() => expect(mockRun).toHaveBeenCalledTimes(1))
})

describe('a backup stopped by a cause that passes, the app on the screen', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    // A function in the React Native jest mock, a string on a phone.
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
  })
  afterEach(() => jest.useRealTimers())

  const passesAfter = async (ms: number): Promise<number> => {
    await act(async () => void jest.advanceTimersByTime(ms))
    return mockRun.mock.calls.length
  }

  test('tries again every minute after the network, the stack or the session failed', async () => {
    for (const cause of ['Network', 'Server', 'Unauthorized'] as const) {
      mockRun.mockClear()
      mockStoppedBy = cause
      const { unmount } = renderHook(() => useBackupPass())
      expect(await passesAfter(0)).toBe(1)
      expect(await passesAfter(RETRY_MS - 1)).toBe(1)
      expect(await passesAfter(1)).toBe(2)
      unmount()
    }
  })

  test('waits for the user or the next launch after a full Drive or a held back media', async () => {
    for (const cause of [
      'QuotaExceeded',
      'WaitingForWifi',
      'NoRoomOnPhone',
      'FolderGone'
    ] as const) {
      mockRun.mockClear()
      mockStoppedBy = cause
      const { unmount } = renderHook(() => useBackupPass())
      expect(await passesAfter(RETRY_MS * 3)).toBe(1)
      unmount()
    }
  })

  test('does not try again with the app behind', async () => {
    mockStoppedBy = 'Network'
    renderHook(() => useBackupPass())
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true })
    expect(await passesAfter(RETRY_MS * 3)).toBe(1)
  })
})

test('a failed pass lets the next one run', async () => {
  mockRun.mockRejectedValueOnce(new Error('offline'))
  await expect(runBackupPass(client)).rejects.toThrow('offline')
  await expect(runBackupPass(client)).resolves.toEqual(counts)
})

test('no pass while the backup is off or without the core', async () => {
  mockSettings = { enabled: false, folder: { id: 'folder-1', path: '/p' } }
  await expect(runBackupPass(client)).resolves.toBeNull()
  mockSettings = { enabled: true, folder: null }
  await expect(runBackupPass(client)).resolves.toBeNull()
  mockSettings = { enabled: true, folder: { id: 'folder-1', path: '/p' } }
  mockAvailable = false
  await expect(runBackupPass(client)).resolves.toBeNull()
  expect(mockRun).not.toHaveBeenCalled()
})
