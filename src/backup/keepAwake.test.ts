import { AppState } from 'react-native'
import { act, renderHook } from '@testing-library/react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'

import type { BackupStatus } from '@/native/twakeDriveCore'

import {
  type KeepAwakeInput,
  STALL_MS,
  shouldKeepAwake,
  useKeepAwakeWhileBackingUp
} from './keepAwake'
import type { BackupState } from './useBackupStatus'

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve())
}))
let mockState: BackupState
jest.mock('./useBackupStatus', () => ({ useBackupStatus: () => mockState }))
jest.mock('./backupFlag', () => ({ useIsPhotoBackupEnabled: () => true }))
jest.mock('./backupSettings', () => ({
  readBackupSettings: () => ({ enabled: true }),
  onBackupSettingsChange: () => () => undefined
}))

const counts: BackupStatus = { done: 1, pending: 3, skipped: 0, failed: 0, unavailable: 1 }
const NOW = 1_000_000
const sending: KeepAwakeInput = {
  status: counts,
  access: 'authorized',
  allowed: true,
  enabled: true,
  appState: 'active',
  lastProgressAt: NOW,
  now: NOW
}

it('keeps the screen on while the backup sends with the app in front', () => {
  expect(shouldKeepAwake(sending)).toBe(true)
  expect(shouldKeepAwake({ ...sending, access: 'limited' })).toBe(true)
})

it('lets the screen sleep once every media the phone can read is sent', () => {
  expect(shouldKeepAwake({ ...sending, status: null })).toBe(false)
  const status = { ...counts, pending: 1, unavailable: 1 }
  expect(shouldKeepAwake({ ...sending, status })).toBe(false)
})

it('lets the screen sleep while something holds every media back', () => {
  for (const stoppedBy of ['WaitingForWifi', 'QuotaExceeded', 'NoRoomOnPhone'] as const) {
    expect(shouldKeepAwake({ ...sending, status: { ...counts, stoppedBy } })).toBe(false)
  }
  expect(shouldKeepAwake({ ...sending, access: 'denied' })).toBe(false)
})

it('lets the screen sleep with the backup off, the flag off, or the app behind', () => {
  expect(shouldKeepAwake({ ...sending, enabled: false })).toBe(false)
  expect(shouldKeepAwake({ ...sending, allowed: false })).toBe(false)
  expect(shouldKeepAwake({ ...sending, appState: 'background' })).toBe(false)
  expect(shouldKeepAwake({ ...sending, appState: 'inactive' })).toBe(false)
})

it('lets the screen sleep when no media went through for 5 minutes, offline for one', () => {
  expect(shouldKeepAwake({ ...sending, now: NOW + STALL_MS - 1 })).toBe(true)
  expect(shouldKeepAwake({ ...sending, now: NOW + STALL_MS })).toBe(false)
})

describe('the screen of the app', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    // A function in the React Native jest mock, a string on a phone.
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
    ;(activateKeepAwakeAsync as jest.Mock).mockClear()
    ;(deactivateKeepAwake as jest.Mock).mockClear()
    mockState = { status: counts, access: 'authorized', retryFailed: jest.fn() }
  })
  afterEach(() => jest.useRealTimers())

  it('stays on while media go through, and sleeps 5 minutes after the last one', () => {
    const { rerender } = renderHook(() => useKeepAwakeWhileBackingUp())
    expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1)
    act(() => void jest.advanceTimersByTime(STALL_MS - 1000))
    mockState = { ...mockState, status: { ...counts, done: 2, pending: 2 } }
    rerender({})
    act(() => void jest.advanceTimersByTime(STALL_MS - 1000))
    expect(deactivateKeepAwake).not.toHaveBeenCalled()
    act(() => void jest.advanceTimersByTime(1000))
    expect(deactivateKeepAwake).toHaveBeenCalledTimes(1)
  })
})
