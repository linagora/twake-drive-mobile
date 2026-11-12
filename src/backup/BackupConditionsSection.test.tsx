import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import i18n from '@/i18n'
import { BackupConditionsSection } from './BackupConditionsSection'

const wifiOnly = { cellularPhotos: false, cellularVideos: false, onlyCharging: false }
const mockCore = { backupConditions: jest.fn(), setBackupConditions: jest.fn() }
jest.mock('@/native/twakeDriveCore', () => ({ backupCore: () => mockCore }))

beforeEach(() => {
  mockCore.backupConditions.mockReset().mockResolvedValue(wifiOnly)
  mockCore.setBackupConditions.mockReset().mockResolvedValue(undefined)
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
