import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import i18n from '@/i18n'
import BackupAlbumsScreen from './backup-albums'

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))
jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => ({ initials: 'MM', loading: false })
}))
jest.mock('cozy-client', () => ({ useClient: () => ({}) }))
const albums = [
  { id: 'camera', title: 'Camera', count: 120 },
  { id: 'shots', title: 'Screenshots', count: 40, choice: 'leftOut' as const }
]
const mockCore = { listAlbums: jest.fn(), setAlbumChoice: jest.fn() }
jest.mock('@/native/twakeDriveCore', () => ({ backupCore: () => mockCore }))

beforeEach(() => {
  mockCore.listAlbums.mockReset().mockResolvedValue(albums)
  mockCore.setAlbumChoice.mockReset().mockResolvedValue(undefined)
})

it('lists the albums with their choice and the rule in use', async () => {
  const screen = render(<BackupAlbumsScreen />)
  await waitFor(() => screen.getByText('Camera'))
  screen.getByText(i18n.t('backup.albums.neutral', { count: 120 }))
  screen.getByText(i18n.t('backup.albums.leftOut', { count: 40 }))
  screen.getByText(i18n.t('backup.albums.nonePicked'))
})

it('picks, leaves out, then frees an album on each tap', async () => {
  const screen = render(<BackupAlbumsScreen />)
  await waitFor(() => screen.getByText('Camera'))
  await act(async () => fireEvent.press(screen.getByTestId('backup-album-camera')))
  expect(mockCore.setAlbumChoice).toHaveBeenLastCalledWith('camera', 'picked')
  screen.getByText(i18n.t('backup.albums.somePicked'))
  await act(async () => fireEvent.press(screen.getByTestId('backup-album-camera')))
  expect(mockCore.setAlbumChoice).toHaveBeenLastCalledWith('camera', 'leftOut')
  await act(async () => fireEvent.press(screen.getByTestId('backup-album-camera')))
  expect(mockCore.setAlbumChoice).toHaveBeenLastCalledWith('camera', null)
})

it('moves an album two steps on two quick taps', async () => {
  const screen = render(<BackupAlbumsScreen />)
  await waitFor(() => screen.getByText('Camera'))
  await act(async () => {
    fireEvent.press(screen.getByTestId('backup-album-camera'))
    fireEvent.press(screen.getByTestId('backup-album-camera'))
  })
  expect(mockCore.setAlbumChoice.mock.calls).toEqual([
    ['camera', 'picked'],
    ['camera', 'leftOut']
  ])
})

it('shows what the core kept when a choice cannot be saved', async () => {
  mockCore.setAlbumChoice.mockRejectedValue(new Error('locked'))
  const screen = render(<BackupAlbumsScreen />)
  await waitFor(() => screen.getByText('Camera'))
  await act(async () => fireEvent.press(screen.getByTestId('backup-album-camera')))
  await waitFor(() => screen.getByText(i18n.t('backup.albums.nonePicked')))
  expect(mockCore.listAlbums).toHaveBeenCalledTimes(2)
})

it('says when the albums cannot be read', async () => {
  mockCore.listAlbums.mockRejectedValue(new Error('no access'))
  const screen = render(<BackupAlbumsScreen />)
  await waitFor(() => screen.getByText(i18n.t('backup.albums.error')))
})
