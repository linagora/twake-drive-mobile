import { requireOptionalNativeModule } from 'expo'

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }))

const load = (native: object | null): typeof import('./twakeDriveCore') => {
  ;(requireOptionalNativeModule as jest.Mock).mockReturnValue(native)
  let core!: typeof import('./twakeDriveCore')
  jest.isolateModules(() => {
    core = jest.requireActual('./twakeDriveCore')
  })
  return core
}

it('offers the backup where the core has its engine', () => {
  const native = { md5File: jest.fn(), runBackupPass: jest.fn() }
  expect(load(native).backupCore()).toBe(native)
})

it('offers the md5 only where the core has no backup engine yet', async () => {
  const native = { md5File: jest.fn().mockResolvedValue('MD5==') }
  const core = load(native)
  expect(core.backupCore()).toBeNull()
  await expect(core.md5File('/tmp/a')).resolves.toBe('MD5==')
})

it('offers nothing where the core is not built in', async () => {
  const core = load(null)
  expect(core.backupCore()).toBeNull()
  await expect(core.md5File('/tmp/a')).resolves.toBeNull()
})
