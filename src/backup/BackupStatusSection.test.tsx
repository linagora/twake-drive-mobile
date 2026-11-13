import React from 'react'
import { Linking } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

import i18n from '@/i18n'
import type { BackupState } from './useBackupStatus'
import { BackupStatusSection } from './BackupStatusSection'

const counts = { done: 1240, pending: 37, skipped: 0, failed: 0, unavailable: 0 }
const mockRetry = jest.fn()
let mockState: BackupState
jest.mock('./useBackupStatus', () => ({ useBackupStatus: () => mockState }))
const mockClient = {}
jest.mock('cozy-client', () => ({ useClient: () => mockClient }))
const mockPass = jest.fn()
jest.mock('./backupPass', () => ({ runBackupPass: (client: unknown) => mockPass(client) }))

beforeEach(() => {
  mockRetry.mockReset().mockResolvedValue(undefined)
  mockPass.mockReset().mockResolvedValue(null)
  mockState = { status: { ...counts }, access: 'authorized', retryFailed: mockRetry }
})

it('says how far the backup is', () => {
  const screen = render(<BackupStatusSection />)
  screen.getByText(i18n.t('backup.status.counts', { done: 1240, pending: 37 }))
  screen.getByText(i18n.t('backup.status.neverRun'))
  expect(screen.queryByTestId('backup-quota')).toBeNull()
  expect(screen.queryByTestId('backup-no-access')).toBeNull()
  expect(screen.queryByTestId('backup-retry')).toBeNull()
})

it('says when the last pass ended', () => {
  mockState.status = { ...counts, lastPassAt: Math.floor(Date.now() / 1000) - 120 }
  const screen = render(<BackupStatusSection />)
  expect(screen.queryByText(i18n.t('backup.status.neverRun'))).toBeNull()
  expect(screen.getByTestId('backup-counts')).toBeTruthy()
})

it('tells a full Drive pauses the backup', () => {
  mockState.status = { ...counts, stoppedBy: 'QuotaExceeded' }
  render(<BackupStatusSection />).getByText(i18n.t('backup.status.quota'))
})

it('tells the last pass stopped for another cause', () => {
  mockState.status = { ...counts, stoppedBy: 'Refused' }
  const screen = render(<BackupStatusSection />)
  screen.getByText(i18n.t('backup.status.stopped'))
  expect(screen.queryByTestId('backup-quota')).toBeNull()
})

it('tells the backup waits for Wi-Fi or power, as the user chose', () => {
  mockState.status = { ...counts, stoppedBy: 'WaitingForWifi' }
  render(<BackupStatusSection />).getByText(i18n.t('backup.status.waitingWifi'))
  mockState.status = { ...counts, stoppedBy: 'WaitingForPower' }
  const screen = render(<BackupStatusSection />)
  screen.getByText(i18n.t('backup.status.waitingPower'))
  expect(screen.queryByTestId('backup-stopped')).toBeNull()
})

describe('access to the photos', () => {
  let openSettings: jest.SpyInstance
  beforeEach(() => {
    openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
  })
  afterEach(() => openSettings.mockRestore())

  it('tells the access was taken back, with a way to the settings', () => {
    mockState.access = 'denied'
    const screen = render(<BackupStatusSection />)
    screen.getByText(i18n.t('backup.status.noAccess'))
    fireEvent.press(screen.getByTestId('backup-open-settings'))
    expect(openSettings).toHaveBeenCalled()
  })

  it('offers no settings to a restricted access, not the user to change', () => {
    mockState.access = 'restricted'
    const screen = render(<BackupStatusSection />)
    screen.getByTestId('backup-no-access')
    expect(screen.queryByTestId('backup-open-settings')).toBeNull()
  })

  it('tells only the photos picked are backed up, with a way to the settings', () => {
    mockState.access = 'limited'
    const screen = render(<BackupStatusSection />)
    screen.getByTestId('backup-limited-access')
    screen.getByText(i18n.t('backup.status.limitedAccess'))
    expect(screen.queryByTestId('backup-no-access')).toBeNull()
    fireEvent.press(screen.getByTestId('backup-open-settings'))
    expect(openSettings).toHaveBeenCalled()
  })
})

it('counts the media out of reach and too large', () => {
  mockState.status = { ...counts, unavailable: 2, skipped: 3 }
  const screen = render(<BackupStatusSection />)
  screen.getByText(i18n.t('backup.status.unavailable', { count: 2 }))
  screen.getByText(i18n.t('backup.status.tooLarge', { count: 3 }))
})

it('tries the failed media again at once', async () => {
  mockState.status = { ...counts, failed: 4 }
  const screen = render(<BackupStatusSection />)
  screen.getByText(i18n.t('backup.status.failed', { count: 4 }))
  fireEvent.press(screen.getByTestId('backup-retry'))
  expect(mockRetry).toHaveBeenCalled()
  await waitFor(() => expect(mockPass).toHaveBeenCalledWith(mockClient))
})

it('shows nothing before the state is read', () => {
  mockState.status = null
  expect(render(<BackupStatusSection />).toJSON()).toBeNull()
})
