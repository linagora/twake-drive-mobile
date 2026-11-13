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

const engine = Object.fromEntries(Object.keys(load(null).BACKUP_API).map(name => [name, jest.fn()]))

it('offers the backup where the core has its whole engine', () => {
  const native = { md5File: jest.fn(), ...engine }
  expect(load(native).backupCore()).toBe(native)
})

it('offers no backup from a module missing part of the engine', () => {
  const { listAlbums: _missing, ...partial } = engine
  expect(load({ md5File: jest.fn(), ...partial }).backupCore()).toBeNull()
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
