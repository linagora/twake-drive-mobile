import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'

import i18n from '@/i18n'
import type { BackupState } from './useBackupStatus'
import { BackupProgressBanner } from './BackupProgressBanner'

const counts = { done: 30, pending: 10, skipped: 0, failed: 0, unavailable: 0 }
let mockState: BackupState
jest.mock('./useBackupStatus', () => ({
  ...jest.requireActual('./useBackupStatus'),
  useBackupStatus: () => mockState
}))
let mockEnabled = true
jest.mock('./backupSettings', () => ({ readBackupSettings: () => ({ enabled: mockEnabled }) }))
let mockFlag: unknown = true
jest.mock('@/client/useFlag', () => ({ useFlag: () => mockFlag }))
const mockPush = jest.fn()
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react')
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect])
  }
})

beforeEach(() => {
  mockEnabled = true
  mockFlag = true
  mockPush.mockReset()
  mockState = { status: { ...counts }, access: 'authorized', retryFailed: jest.fn() }
})

it('tells how many media are left, with how far the backup is', () => {
  const screen = render(<BackupProgressBanner />)
  screen.getByText(i18n.t('backup.banner.remaining', { count: 10 }))
  expect(screen.getByTestId('backup-progress-bar').props.accessibilityValue).toMatchObject({
    now: 75
  })
})

it('opens the backup settings', () => {
  const screen = render(<BackupProgressBanner />)
  const banner = screen.getByTestId('backup-progress')
  expect(banner.props.accessibilityHint).toBe(i18n.t('backup.banner.hint'))
  fireEvent.press(banner)
  expect(mockPush).toHaveBeenCalledWith('/settings/backup')
})

it('says what holds the backup back', () => {
  mockState.status = { ...counts, stoppedBy: 'WaitingForWifi' }
  render(<BackupProgressBanner />).getByText(i18n.t('backup.banner.waitingWifi'))
  mockState.status = { ...counts, stoppedBy: 'Unauthorized' }
  render(<BackupProgressBanner />).getByText(i18n.t('backup.banner.paused'))
  mockState.access = 'denied'
  render(<BackupProgressBanner />).getByText(i18n.t('backup.banner.noAccess'))
})

it('stays away when nothing is left, or the backup is off', () => {
  mockState.status = { ...counts, pending: 0 }
  expect(render(<BackupProgressBanner />).toJSON()).toBeNull()
  // Unreadable on the phone, they wait for no one.
  mockState.status = { ...counts, pending: 2, unavailable: 2 }
  expect(render(<BackupProgressBanner />).toJSON()).toBeNull()
  mockState.status = { ...counts }
  mockEnabled = false
  expect(render(<BackupProgressBanner />).toJSON()).toBeNull()
})

it('stays away while the instance keeps the backup off', () => {
  mockFlag = undefined
  expect(render(<BackupProgressBanner />).toJSON()).toBeNull()
})
