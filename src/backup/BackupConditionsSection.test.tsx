import React from 'react'
import { AppState } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import i18n from '@/i18n'
import { BackupConditionsSection } from './BackupConditionsSection'

const wifiOnly = { cellularPhotos: false, cellularVideos: false, onlyCharging: false }
const mockCore = { backupConditions: jest.fn(), setBackupConditions: jest.fn() }
let mockBattery: { isOn: jest.Mock; openSettings: jest.Mock } | null = null
jest.mock('@/native/twakeDriveCore', () => ({
  backupCore: () => mockCore,
  batteryOptimization: () => mockBattery
}))

beforeEach(() => {
  mockCore.backupConditions.mockReset().mockResolvedValue(wifiOnly)
  mockCore.setBackupConditions.mockReset().mockResolvedValue(undefined)
  mockBattery = null
})

it('says nothing of the battery where the platform has no optimization', async () => {
  const screen = render(<BackupConditionsSection />)
  await waitFor(() => screen.getByTestId('backup-onlyCharging-switch'))
  expect(screen.queryByTestId('backup-instant')).toBeNull()
})

it('opens the battery settings when Android holds new photos back, and reads them again on return', async () => {
  mockBattery = { isOn: jest.fn().mockReturnValue(true), openSettings: jest.fn() }
  const screen = render(<BackupConditionsSection />)
  await waitFor(() => screen.getByText(i18n.t('backup.conditions.instantHeldBack')))
  fireEvent.press(screen.getByTestId('backup-allow-background'), { nativeEvent: {} })
  // The native function throws on any argument, the press event included.
  expect(mockBattery.openSettings).toHaveBeenCalledWith()
  // Back from the settings, the optimization lifted.
  mockBattery.isOn.mockReturnValue(false)
  // The jest setup mocks AppState: the section's listener is the last one added.
  const calls = (AppState.addEventListener as jest.Mock).mock.calls as [
    string,
    (state: string) => void
  ][]
  const [, onChange] = calls.filter(([event]) => event === 'change').at(-1) ?? []
  if (!onChange) throw new Error('no AppState listener')
  act(() => onChange('active'))
  screen.getByText(i18n.t('backup.conditions.instantOn'))
})

it('promises a minute once the app runs in the background', async () => {
  mockBattery = { isOn: jest.fn().mockReturnValue(false), openSettings: jest.fn() }
  const screen = render(<BackupConditionsSection />)
  await waitFor(() => screen.getByText(i18n.t('backup.conditions.instantOn')))
  expect(screen.queryByTestId('backup-allow-background')).toBeNull()
})

it('starts from the choices the core keeps, Wi-Fi only by default', async () => {
  const screen = render(<BackupConditionsSection />)
  await waitFor(() => screen.getByText(i18n.t('backup.conditions.cellularPhotos')))
  screen.getByText(i18n.t('backup.conditions.cellularVideos'))
  screen.getByText(i18n.t('backup.conditions.onlyCharging'))
  expect(screen.getByTestId('backup-cellularVideos-switch').props.value).toBe(false)
})

it('allows mobile data for photos only', async () => {
  const screen = render(<BackupConditionsSection />)
  await waitFor(() => screen.getByTestId('backup-cellularPhotos-switch'))
  await act(async () => {
    fireEvent(screen.getByTestId('backup-cellularPhotos-switch'), 'valueChange', true)
  })
  expect(mockCore.setBackupConditions).toHaveBeenCalledWith(true, false, false)
  expect(screen.getByTestId('backup-cellularPhotos-switch').props.value).toBe(true)
})

it('shows what the core kept when a choice cannot be saved', async () => {
  mockCore.setBackupConditions.mockRejectedValue(new Error('locked'))
  const screen = render(<BackupConditionsSection />)
  await waitFor(() => screen.getByTestId('backup-onlyCharging-switch'))
  // Another switch was saved meanwhile.
  mockCore.backupConditions.mockResolvedValue({ ...wifiOnly, cellularPhotos: true })
  await act(async () => {
    fireEvent(screen.getByTestId('backup-onlyCharging-switch'), 'valueChange', true)
  })
  await waitFor(() =>
    expect(screen.getByTestId('backup-onlyCharging-switch').props.value).toBe(false)
  )
  expect(screen.getByTestId('backup-cellularPhotos-switch').props.value).toBe(true)
})
