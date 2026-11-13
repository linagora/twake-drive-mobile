import {
  isPhotoBackupEnabled,
  PHOTO_BACKUP_FLAG,
  stopBackupTheInstanceTurnedOff
} from './backupFlag'

let mockFlags: Record<string, unknown> = {}
jest.mock('cozy-flags', () => ({ __esModule: true, default: (name: string) => mockFlags[name] }))
const mockStop = jest.fn()
let mockCore: { stopBackupPass: () => void } | null = { stopBackupPass: () => mockStop() }
jest.mock('@/native/twakeDriveCore', () => ({ backupCore: () => mockCore }))
let mockEnabled = true
jest.mock('./backupSettings', () => ({ readBackupSettings: () => ({ enabled: mockEnabled }) }))

beforeEach(() => {
  mockFlags = {}
  mockEnabled = true
  mockCore = { stopBackupPass: () => mockStop() }
  mockStop.mockReset()
})

it('is off unless the instance turns it on', () => {
  expect(isPhotoBackupEnabled()).toBe(false)
  mockFlags[PHOTO_BACKUP_FLAG] = 'yes'
  expect(isPhotoBackupEnabled()).toBe(false)
  mockFlags[PHOTO_BACKUP_FLAG] = true
  expect(isPhotoBackupEnabled()).toBe(true)
})

it('stops the passes of a backup the instance turned off, and only then', () => {
  mockFlags[PHOTO_BACKUP_FLAG] = true
  stopBackupTheInstanceTurnedOff()
  expect(mockStop).not.toHaveBeenCalled()
  mockFlags[PHOTO_BACKUP_FLAG] = false
  stopBackupTheInstanceTurnedOff()
  expect(mockStop).toHaveBeenCalledTimes(1)
})

it('leaves alone a backup the user never turned on', () => {
  mockEnabled = false
  stopBackupTheInstanceTurnedOff()
  expect(mockStop).not.toHaveBeenCalled()
})
