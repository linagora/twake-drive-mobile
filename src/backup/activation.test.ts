import { finishActivation, startActivation, stopBackup } from './activation'

const mockCore = {
  requestPhotoAccess: jest.fn(),
  deviceName: jest.fn(),
  listDeviceFolders: jest.fn(),
  adoptDeviceFolder: jest.fn(),
  createDeviceFolder: jest.fn()
}
let mockAvailable = true
jest.mock('@/native/twakeDriveCore', () => ({
  backupCore: () => (mockAvailable ? mockCore : null)
}))
jest.mock('./deviceId', () => ({ backupDeviceId: async () => 'dev-1' }))
const mockWrite = jest.fn()
jest.mock('./backupSettings', () => ({
  writeBackupSettings: (...args: unknown[]) => mockWrite(...args)
}))

const folder = (id: string, path = `/Photos/B/${id}`) => ({
  id,
  name: id,
  path,
  deviceIds: [],
  createdAt: '2026-11-11T00:00:00Z'
})

beforeEach(() => {
  mockAvailable = true
  Object.values(mockCore).forEach(fn => fn.mockReset())
  mockWrite.mockReset()
  mockCore.requestPhotoAccess.mockResolvedValue('authorized')
  mockCore.deviceName.mockResolvedValue('iPhone')
  mockCore.listDeviceFolders.mockResolvedValue([])
})

test('the phone uses its own folder at once', async () => {
  const mine = { ...folder('mine'), deviceIds: ['other', 'dev-1'] }
  mockCore.listDeviceFolders.mockResolvedValue([folder('flagship'), mine])
  await expect(startActivation()).resolves.toEqual({ kind: 'ready', folder: mine })
  expect(mockWrite).toHaveBeenCalledWith({
    enabled: true,
    folder: { id: 'mine', path: '/Photos/B/mine' }
  })
})

test('nothing is created before the user chose, flagship folders included', async () => {
  mockCore.listDeviceFolders.mockResolvedValue([folder('flagship')])
  await expect(startActivation()).resolves.toEqual({
    kind: 'choose',
    folders: [folder('flagship')],
    suggestedName: 'iPhone'
  })
  expect(mockCore.createDeviceFolder).not.toHaveBeenCalled()
  expect(mockWrite).not.toHaveBeenCalled()
})

test('a refused photo access stops there', async () => {
  mockCore.requestPhotoAccess.mockResolvedValue('denied')
  await expect(startActivation()).resolves.toEqual({ kind: 'denied', access: 'denied' })
  expect(mockCore.listDeviceFolders).not.toHaveBeenCalled()
})

test('a limited photo access goes on', async () => {
  mockCore.requestPhotoAccess.mockResolvedValue('limited')
  await expect(startActivation()).resolves.toMatchObject({ kind: 'choose' })
})

test('the backup is unavailable where the core is not built in', async () => {
  mockAvailable = false
  await expect(startActivation()).resolves.toEqual({ kind: 'unavailable' })
})

test('an existing folder is adopted with this phone id', async () => {
  mockCore.adoptDeviceFolder.mockResolvedValue(folder('flagship'))
  await finishActivation({ adopt: folder('flagship') })
  expect(mockCore.adoptDeviceFolder).toHaveBeenCalledWith('flagship', 'dev-1')
  expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
})

test('a new folder takes the name the user typed', async () => {
  mockCore.createDeviceFolder.mockResolvedValue(folder('mine'))
  await finishActivation({ create: '  Mon iPhone ', rootName: 'Sauvegardé depuis mon mobile' })
  expect(mockCore.createDeviceFolder).toHaveBeenCalledWith(
    'dev-1',
    'Mon iPhone',
    'Sauvegardé depuis mon mobile'
  )
})

test('turning the backup off keeps its folder', () => {
  stopBackup()
  expect(mockWrite).toHaveBeenCalledWith({ enabled: false })
})
