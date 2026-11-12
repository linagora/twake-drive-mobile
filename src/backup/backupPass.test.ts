import { runBackupPass } from './backupPass'

const counts = { done: 3, pending: 0, skipped: 0, failed: 0 }
const mockRun = jest.fn()
let mockAvailable = true
jest.mock('@/native/twakeDriveCore', () => ({
  backupCore: () => (mockAvailable ? { runBackupPass: mockRun } : null)
}))
jest.mock('./deviceId', () => ({ backupDeviceId: async () => 'dev-1' }))
let mockSettings: { enabled: boolean; folder: { id: string; path: string } | null }
jest.mock('./backupSettings', () => ({ readBackupSettings: () => mockSettings }))
const mockAdopt = jest.fn()
jest.mock('@/auth/adoptStoredToken', () => ({
  adoptStoredToken: (client: unknown) => mockAdopt(client)
}))
jest.mock('cozy-client', () => ({ useClient: () => null }))

const client = {} as never

beforeEach(() => {
  mockAvailable = true
  mockSettings = { enabled: true, folder: { id: 'folder-1', path: '/Photos/B/iPhone' } }
  mockRun.mockReset().mockResolvedValue(counts)
  mockAdopt.mockReset().mockResolvedValue(false)
})

test('a pass goes to the folder of the phone, then takes the token the core refreshed', async () => {
  await expect(runBackupPass(client)).resolves.toEqual(counts)
  expect(mockRun).toHaveBeenCalledWith('folder-1', 'dev-1')
  expect(mockAdopt).toHaveBeenCalledWith(client)
})

test('calls during a pass get one more pass after it, never two at once', async () => {
  const first = runBackupPass(client)
  const second = runBackupPass(client)
  const third = runBackupPass(client)
  await expect(Promise.all([first, second, third])).resolves.toEqual([counts, counts, counts])
  expect(mockRun).toHaveBeenCalledTimes(2)
  await runBackupPass(client)
  expect(mockRun).toHaveBeenCalledTimes(3)
})

const heldPass = (): (() => void) => {
  let release = (): void => undefined
  mockRun.mockReturnValueOnce(new Promise(resolve => (release = () => resolve(counts))))
  return () => release()
}

test('turned off and on again during a pass, the backup runs again at once', async () => {
  const release = heldPass()
  const stopped = runBackupPass(client)
  // Turned on again: the screen asks for a pass while the stopped one ends.
  void runBackupPass(client)
  release()
  await stopped
  expect(mockRun.mock.calls).toEqual([
    ['folder-1', 'dev-1'],
    ['folder-1', 'dev-1']
  ])
})

test('a folder picked while a pass ran gets a pass of its own', async () => {
  const release = heldPass()
  const first = runBackupPass(client)
  mockSettings = { enabled: true, folder: { id: 'folder-2', path: '/Photos/B/iPad' } }
  void runBackupPass(client)
  release()
  await first
  expect(mockRun.mock.calls).toEqual([
    ['folder-1', 'dev-1'],
    ['folder-2', 'dev-1']
  ])
})

test('a failed pass lets the next one run', async () => {
  mockRun.mockRejectedValueOnce(new Error('offline'))
  await expect(runBackupPass(client)).rejects.toThrow('offline')
  await expect(runBackupPass(client)).resolves.toEqual(counts)
})

test('no pass while the backup is off or without the core', async () => {
  mockSettings = { enabled: false, folder: { id: 'folder-1', path: '/p' } }
  await expect(runBackupPass(client)).resolves.toBeNull()
  mockSettings = { enabled: true, folder: null }
  await expect(runBackupPass(client)).resolves.toBeNull()
  mockSettings = { enabled: true, folder: { id: 'folder-1', path: '/p' } }
  mockAvailable = false
  await expect(runBackupPass(client)).resolves.toBeNull()
  expect(mockRun).not.toHaveBeenCalled()
})
