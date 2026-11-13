import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'

import BackupScreen from './backup'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))
jest.mock('@/account/useCurrentUser', () => ({
  useCurrentUser: () => ({ initials: 'MM', loading: false })
}))

const mockStart = jest.fn()
const mockFinish = jest.fn()
const mockStop = jest.fn()
let mockSettings: { enabled: boolean; folder: { id: string; path: string } | null }
jest.mock('@/backup/activation', () => ({
  startActivation: () => mockStart(),
  finishActivation: (choice: unknown) => mockFinish(choice),
  stopBackup: () => mockStop()
}))
jest.mock('@/backup/backupSettings', () => ({ readBackupSettings: () => mockSettings }))
const mockPass = jest.fn()
jest.mock('@/backup/backupPass', () => ({ runBackupPass: (client: unknown) => mockPass(client) }))
jest.mock('@/backup/BackupConditionsSection', () => ({ BackupConditionsSection: () => null }))
jest.mock('@/backup/BackupStatusSection', () => {
  const { Text } = jest.requireActual('react-native')
  return { BackupStatusSection: () => <Text testID="backup-status">status</Text> }
})
const mockClient = {}
jest.mock('cozy-client', () => ({ useClient: () => mockClient }))
const mockAdopt = jest.fn()
jest.mock('@/auth/adoptStoredToken', () => ({
  adoptStoredToken: (client: unknown) => mockAdopt(client)
}))

const flagship = {
  id: 'f1',
  name: 'iPhone',
  path: '/Photos/Sauvegardé depuis mon mobile/iPhone',
  deviceIds: ['other'],
  createdAt: '2025-01-01T00:00:00Z'
}

beforeEach(() => {
  mockSettings = { enabled: false, folder: null }
  ;[mockStart, mockFinish, mockStop, mockAdopt, mockPass].forEach(fn => fn.mockReset())
  mockAdopt.mockResolvedValue(false)
  mockPass.mockResolvedValue(null)
})

const turnOn = async (screen: ReturnType<typeof render>): Promise<void> => {
  await act(async () => {
    fireEvent(screen.getByTestId('backup-enable-switch'), 'valueChange', true)
  })
}

it('shows the folder of an active backup', () => {
  mockSettings = { enabled: true, folder: { id: 'f1', path: '/Photos/B/iPhone' } }
  const screen = render(<BackupScreen />)
  screen.getByText(i18n.t('backup.folder', { path: '/Photos/B/iPhone' }))
})

it('offers the existing folders and a named new one before creating anything', async () => {
  mockStart.mockResolvedValue({ kind: 'choose', folders: [flagship], suggestedName: 'iPhone' })
  const screen = render(<BackupScreen />)
  await turnOn(screen)
  screen.getByText(flagship.path)
  expect(screen.getByTestId('backup-new-folder-name').props.value).toBe('iPhone')
  expect(mockFinish).not.toHaveBeenCalled()
})

it('adopts the folder the user picks', async () => {
  mockStart.mockResolvedValue({ kind: 'choose', folders: [flagship], suggestedName: 'iPhone' })
  mockFinish.mockImplementation(async () => {
    mockSettings = { enabled: true, folder: { id: 'f1', path: flagship.path } }
    return { kind: 'ready', folder: flagship }
  })
  const screen = render(<BackupScreen />)
  await turnOn(screen)
  await act(async () => fireEvent.press(screen.getByTestId('backup-folder-f1')))
  expect(mockFinish).toHaveBeenCalledWith({ adopt: flagship })
  screen.getByText(i18n.t('backup.folder', { path: flagship.path }))
  expect(mockPass).toHaveBeenCalledWith(mockClient)
})

it('creates a folder with the name typed, under the flagship root', async () => {
  mockStart.mockResolvedValue({ kind: 'choose', folders: [], suggestedName: 'iPhone' })
  mockFinish.mockResolvedValue({ kind: 'ready', folder: flagship })
  const screen = render(<BackupScreen />)
  await turnOn(screen)
  fireEvent.changeText(screen.getByTestId('backup-new-folder-name'), 'Mon iPhone')
  await act(async () => fireEvent.press(screen.getByTestId('backup-create-folder')))
  expect(mockFinish).toHaveBeenCalledWith({
    create: 'Mon iPhone',
    rootName: i18n.t('backup.rootFolder')
  })
})

it.each(['Pro/Perso', '.', ' .. ', 'a\0b', 'a\nb', 'a\rb'])(
  'refuses the folder name %j, which the stack would refuse',
  async invalid => {
    mockStart.mockResolvedValue({ kind: 'choose', folders: [], suggestedName: 'iPhone' })
    const screen = render(<BackupScreen />)
    await turnOn(screen)
    fireEvent.changeText(screen.getByTestId('backup-new-folder-name'), invalid)
    screen.getByText(i18n.t('backup.invalidName'))
    await act(async () => fireEvent.press(screen.getByTestId('backup-create-folder')))
    expect(mockFinish).not.toHaveBeenCalled()
  }
)

it('accepts a name with dots that is not . or ..', async () => {
  mockStart.mockResolvedValue({ kind: 'choose', folders: [], suggestedName: 'iPhone' })
  const screen = render(<BackupScreen />)
  await turnOn(screen)
  fireEvent.changeText(screen.getByTestId('backup-new-folder-name'), '...')
  expect(screen.queryByTestId('backup-name-invalid')).toBeNull()
})

it('explains a refused photo access', async () => {
  mockStart.mockResolvedValue({ kind: 'denied', access: 'denied' })
  const screen = render(<BackupScreen />)
  await turnOn(screen)
  screen.getByText(i18n.t('backup.denied'))
})

it('says when the backup could not start', async () => {
  mockStart.mockRejectedValue(new Error('offline'))
  const screen = render(<BackupScreen />)
  await turnOn(screen)
  screen.getByText(i18n.t('backup.error'))
})

it('takes on the token the core may have refreshed', async () => {
  mockStart.mockResolvedValue({ kind: 'choose', folders: [], suggestedName: 'iPhone' })
  const screen = render(<BackupScreen />)
  await turnOn(screen)
  expect(mockAdopt).toHaveBeenCalledWith(mockClient)
})

it('opens the choice of the albums once the backup is on', () => {
  mockSettings = { enabled: true, folder: { id: 'f1', path: '/Photos/B/iPhone' } }
  const screen = render(<BackupScreen />)
  fireEvent.press(screen.getByTestId('backup-albums'))
  expect(mockPush).toHaveBeenCalledWith('/settings/backup-albums')
})

it('shows how far the backup is once it is on', () => {
  expect(render(<BackupScreen />).queryByTestId('backup-status')).toBeNull()
  mockSettings = { enabled: true, folder: { id: 'f1', path: '/Photos/B/iPhone' } }
  render(<BackupScreen />).getByTestId('backup-status')
})

it('turns the backup off', async () => {
  mockSettings = { enabled: true, folder: { id: 'f1', path: '/Photos/B/iPhone' } }
  const screen = render(<BackupScreen />)
  await act(async () => {
    fireEvent(screen.getByTestId('backup-enable-switch'), 'valueChange', false)
  })
  expect(mockStop).toHaveBeenCalled()
})
