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
jest.mock('@/ui/QuotaPaywall', () => {
  const { Pressable } = jest.requireActual('react-native')
  return {
    QuotaPaywall: ({ onClose }: { onClose: () => void }) => (
      <Pressable testID="paywall" onPress={onClose} />
    )
  }
})
let mockSettings: { paywallClosedFor?: number; folder?: { id: string; path: string } } = {}
jest.mock('./backupSettings', () => ({
  readBackupSettings: () => mockSettings,
  writeBackupSettings: (patch: object) => (mockSettings = { ...mockSettings, ...patch })
}))
const mockPass = jest.fn()
jest.mock('./backupPass', () => ({ runBackupPass: (client: unknown) => mockPass(client) }))
const mockRecreate = jest.fn()
jest.mock('@/native/twakeDriveCore', () => ({
  backupCore: () => ({ recreateDeviceFolder: (path: string | null) => mockRecreate(path) })
}))
const mockTurnOff = jest.fn()

beforeEach(() => {
  mockRetry.mockReset().mockResolvedValue(undefined)
  mockPass.mockReset().mockResolvedValue(null)
  mockRecreate.mockReset().mockResolvedValue(undefined)
  mockTurnOff.mockReset()
  mockSettings = {}
  mockState = { status: { ...counts }, access: 'authorized', retryFailed: mockRetry }
})

describe('a backup folder gone from Drive', () => {
  beforeEach(() => {
    mockState.status = { ...counts, stoppedBy: 'FolderGone' }
    mockSettings = { folder: { id: 'folder-1', path: '/Photos/B/iPhone' } }
  })

  it('makes it again where it was, then sends the photos again', async () => {
    const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
    screen.getByText(i18n.t('backup.status.folderGone'))
    fireEvent.press(screen.getByTestId('backup-recreate-folder'))
    await waitFor(() => expect(mockPass).toHaveBeenCalledWith(mockClient))
    expect(mockRecreate).toHaveBeenCalledWith('/Photos/B/iPhone')
    expect(mockTurnOff).not.toHaveBeenCalled()
  })

  it('says so when the folder cannot be made again, and sends nothing', async () => {
    mockRecreate.mockRejectedValue(new Error('offline'))
    const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
    fireEvent.press(screen.getByTestId('backup-recreate-folder'))
    await waitFor(() => screen.getByTestId('backup-recreate-failed'))
    expect(mockPass).not.toHaveBeenCalled()
  })

  it('turns the backup off when the user does not want it back', () => {
    const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
    fireEvent.press(screen.getByTestId('backup-turn-off'))
    expect(mockTurnOff).toHaveBeenCalled()
    expect(mockRecreate).not.toHaveBeenCalled()
  })
})

it('says how far the backup is', () => {
  const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
  screen.getByText(i18n.t('backup.status.counts', { done: 1240, pending: 37 }))
  screen.getByText(i18n.t('backup.status.neverRun'))
  expect(screen.queryByTestId('backup-quota')).toBeNull()
  expect(screen.queryByTestId('backup-no-access')).toBeNull()
  expect(screen.queryByTestId('backup-retry')).toBeNull()
})

it('says when the last pass ended', () => {
  mockState.status = { ...counts, lastPassAt: Math.floor(Date.now() / 1000) - 120 }
  const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
  expect(screen.queryByText(i18n.t('backup.status.neverRun'))).toBeNull()
  expect(screen.getByTestId('backup-counts')).toBeTruthy()
})

it('tells a full Drive pauses the backup, with the paywall again after each pass', () => {
  mockState.status = { ...counts, stoppedBy: 'QuotaExceeded', lastPassAt: 100 }
  const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
  screen.getByText(i18n.t('backup.status.quota'))
  fireEvent.press(screen.getByTestId('paywall'))
  expect(screen.queryByTestId('paywall')).toBeNull()
  // Closed for this pass, it stays closed when the screen opens again.
  screen.unmount()
  expect(
    render(<BackupStatusSection onTurnOff={mockTurnOff} />).queryByTestId('paywall')
  ).toBeNull()
  mockState.status = { ...counts, stoppedBy: 'QuotaExceeded', lastPassAt: 200 }
  render(<BackupStatusSection onTurnOff={mockTurnOff} />).getByTestId('paywall')
})

it('tells the last pass stopped for another cause', () => {
  mockState.status = { ...counts, stoppedBy: 'Refused' }
  const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
  screen.getByText(i18n.t('backup.status.stopped'))
  expect(screen.queryByTestId('backup-quota')).toBeNull()
})

it('tells the backup waits for Wi-Fi or power, as the user chose', () => {
  mockState.status = { ...counts, stoppedBy: 'WaitingForWifi' }
  render(<BackupStatusSection onTurnOff={mockTurnOff} />).getByText(
    i18n.t('backup.status.waitingWifi')
  )
  mockState.status = { ...counts, stoppedBy: 'WaitingForPower' }
  const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
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
    const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
    screen.getByText(i18n.t('backup.status.noAccess'))
    fireEvent.press(screen.getByTestId('backup-open-settings'))
    expect(openSettings).toHaveBeenCalled()
  })

  it('offers no settings to a restricted access, not the user to change', () => {
    mockState.access = 'restricted'
    const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
    screen.getByTestId('backup-no-access')
    expect(screen.queryByTestId('backup-open-settings')).toBeNull()
  })

  it('tells only the photos picked are backed up, with a way to the settings', () => {
    mockState.access = 'limited'
    const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
    screen.getByTestId('backup-limited-access')
    screen.getByText(i18n.t('backup.status.limitedAccess'))
    expect(screen.queryByTestId('backup-no-access')).toBeNull()
    fireEvent.press(screen.getByTestId('backup-open-settings'))
    expect(openSettings).toHaveBeenCalled()
  })
})

it('counts the media out of reach and too large', () => {
  mockState.status = { ...counts, unavailable: 2, skipped: 3 }
  const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
  screen.getByText(i18n.t('backup.status.unavailable', { count: 2 }))
  screen.getByText(i18n.t('backup.status.tooLarge', { count: 3 }))
})

it('tries the failed media again at once', async () => {
  mockState.status = { ...counts, failed: 4 }
  const screen = render(<BackupStatusSection onTurnOff={mockTurnOff} />)
  screen.getByText(i18n.t('backup.status.failed', { count: 4 }))
  fireEvent.press(screen.getByTestId('backup-retry'))
  expect(mockRetry).toHaveBeenCalled()
  await waitFor(() => expect(mockPass).toHaveBeenCalledWith(mockClient))
})

it('shows nothing before the state is read', () => {
  mockState.status = null
  expect(render(<BackupStatusSection onTurnOff={mockTurnOff} />).toJSON()).toBeNull()
})
